import { useEffect, useRef, useState, useCallback } from 'react';
import { useWebRTCStore } from '../store/webrtcStore';
import { getSendMessage } from './useWebSocket';

// FIX: Use public STUN servers + get TURN creds from backend if available
// No more localhost:3478 which is completely broken for real peers
const PUBLIC_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

async function getIceServers(): Promise<RTCIceServer[]> {
  try {
    const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8080/api';
    const res = await fetch(`${API_URL}/webrtc/ice-servers`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('tryblynx_token')}` }
    });
    if (res.ok) {
      const data = await res.json();
      return data.ice_servers?.length ? data.ice_servers : PUBLIC_ICE_SERVERS;
    }
  } catch {}
  return PUBLIC_ICE_SERVERS;
}

export function useWebRTC(peerId: string | null, isInitiator: boolean = false) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const processingRef = useRef(false);

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>('new');
  const [isReady, setIsReady] = useState(false);

  // FIX: Use consumeSignalsForPeer to not consume signals meant for other peers
  const consumeSignalsForPeer = useWebRTCStore((s) => s.consumeSignalsForPeer);
  const incomingSignals = useWebRTCStore((s) => s.incomingSignals);

  const initWebRTC = useCallback(async () => {
    if (!peerId) return;
    try {
      const iceServers = await getIceServers();
      
      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localStream.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      } catch (err) {
        console.warn('Media access denied, joining as viewer-only:', err);
        setIsVideoOff(true);
        setIsMuted(true);
      }

      const pc = new RTCPeerConnection({ iceServers });
      peerConnection.current = pc;

      if (stream) {
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      } else {
        // Ensure we can still receive if we didn't add any tracks
        pc.addTransceiver('audio', { direction: 'recvonly' });
        pc.addTransceiver('video', { direction: 'recvonly' });
      }

      pc.ontrack = (event) => {
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0];
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const send = getSendMessage();
          send?.('webrtc.ice', { peer_id: peerId, candidate: event.candidate });
        }
      };

      pc.onconnectionstatechange = () => {
        setConnectionState(pc.connectionState);
        if (pc.connectionState === 'failed') {
          pc.restartIce();
        }
      };

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'disconnected') {
          setTimeout(() => {
            if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
              pc.restartIce();
            }
          }, 2000);
        }
      };

      if (isInitiator) {
        // Automatically initiate call once setup is fully complete
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        const send = getSendMessage();
        send?.('webrtc.offer', { peer_id: peerId, sdp: pc.localDescription });
      }

      setIsReady(true);
    } catch (err: any) {
      console.error('Fatal WebRTC init error:', err);
      setError('Failed to initialize connection.');
    }
  }, [peerId, isInitiator]);

  useEffect(() => {
    initWebRTC();
    return () => {
      localStream.current?.getTracks().forEach((t) => t.stop());
      peerConnection.current?.close();
      peerConnection.current = null;
    };
  }, [initWebRTC]);

  const earlyCandidates = useRef<any[]>([]);

  // FIX: Process only signals for this peer, don't blindly clear all signals
  useEffect(() => {
    if (!isReady || !peerConnection.current || !peerId || incomingSignals.length === 0) return;
    if (processingRef.current) return;

    const signals = consumeSignalsForPeer(peerId);
    if (signals.length === 0) return;

    processingRef.current = true;
    (async () => {
      for (const signal of signals) {
        const pc = peerConnection.current;
        if (!pc) break;
        try {
          if (signal.type === 'offer' && signal.sdp) {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            for (const cand of earlyCandidates.current) {
              await pc.addIceCandidate(new RTCIceCandidate(cand));
            }
            earlyCandidates.current = [];
            
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            const send = getSendMessage();
            send?.('webrtc.answer', { peer_id: peerId, sdp: pc.localDescription });
          } else if (signal.type === 'answer' && signal.sdp) {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            for (const cand of earlyCandidates.current) {
              await pc.addIceCandidate(new RTCIceCandidate(cand));
            }
            earlyCandidates.current = [];
          } else if (signal.type === 'ice' && signal.candidate) {
            if (pc.remoteDescription) {
              await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
            } else {
              earlyCandidates.current.push(signal.candidate);
            }
          }
        } catch (err) {
          console.error('Error processing signal', signal.type, err);
        }
      }
      processingRef.current = false;
    })();
  }, [incomingSignals, peerId, consumeSignalsForPeer, isReady]);

  // initiateCall removed as it is handled internally

  const toggleMute = useCallback(() => {
    if (!localStream.current) return;
    const track = localStream.current.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setIsMuted(!track.enabled);
    }
  }, []);

  const toggleVideo = useCallback(() => {
    if (!localStream.current) return;
    const track = localStream.current.getVideoTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setIsVideoOff(!track.enabled);
    }
  }, []);

  return {
    localVideoRef,
    remoteVideoRef,
    isMuted,
    isVideoOff,
    error,
    connectionState,
    toggleMute,
    toggleVideo,
  };
}

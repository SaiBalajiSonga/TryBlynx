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

export function useWebRTC(peerId: string | null) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const processingRef = useRef(false);

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>('new');

  // FIX: Use consumeSignalsForPeer to not consume signals meant for other peers
  const consumeSignalsForPeer = useWebRTCStore((s) => s.consumeSignalsForPeer);
  const incomingSignals = useWebRTCStore((s) => s.incomingSignals);

  const initWebRTC = useCallback(async () => {
    if (!peerId) return;
    try {
      const iceServers = await getIceServers();
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStream.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      const pc = new RTCPeerConnection({ iceServers });
      peerConnection.current = pc;

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

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
          // Give it a moment before closing
          setTimeout(() => {
            if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
              pc.restartIce();
            }
          }, 2000);
        }
      };
    } catch (err: any) {
      console.error('Error accessing media devices:', err);
      setError('Camera/Microphone access denied or unavailable.');
    }
  }, [peerId]);

  useEffect(() => {
    initWebRTC();
    return () => {
      localStream.current?.getTracks().forEach((t) => t.stop());
      peerConnection.current?.close();
      peerConnection.current = null;
    };
  }, [initWebRTC]);

  // FIX: Process only signals for this peer, don't blindly clear all signals
  useEffect(() => {
    if (!peerConnection.current || !peerId || incomingSignals.length === 0) return;
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
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            const send = getSendMessage();
            send?.('webrtc.answer', { peer_id: peerId, sdp: pc.localDescription });
          } else if (signal.type === 'answer' && signal.sdp) {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          } else if (signal.type === 'ice' && signal.candidate) {
            // FIX: Don't add ICE candidates before remote description is set
            if (pc.remoteDescription) {
              await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
            }
          }
        } catch (err) {
          console.error('Error processing signal', signal.type, err);
        }
      }
      processingRef.current = false;
    })();
  }, [incomingSignals, peerId, consumeSignalsForPeer]);

  const initiateCall = useCallback(async () => {
    if (!peerConnection.current || !peerId) return;
    try {
      const offer = await peerConnection.current.createOffer();
      await peerConnection.current.setLocalDescription(offer);
      const send = getSendMessage();
      send?.('webrtc.offer', { peer_id: peerId, sdp: peerConnection.current.localDescription });
    } catch (err) {
      console.error('Error creating offer', err);
    }
  }, [peerId]);

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
    initiateCall,
  };
}

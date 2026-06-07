import { useEffect, useRef, useState } from 'react';
import { useWebRTCStore } from '../store/webrtcStore';
import { useWebSocket } from './useWebSocket';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:localhost:3478' }
  ],
};

export function useWebRTC(peerId: string | null) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const incomingSignals = useWebRTCStore((state) => state.incomingSignals);
  const { sendMessage } = useWebSocket();

  // Initialize WebRTC
  useEffect(() => {
    if (!peerId) return;

    const initWebRTC = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localStream.current = stream;
        
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        peerConnection.current = new RTCPeerConnection(ICE_SERVERS);

        stream.getTracks().forEach((track) => {
          peerConnection.current?.addTrack(track, stream);
        });

        peerConnection.current.ontrack = (event) => {
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = event.streams[0];
          }
        };

        peerConnection.current.onicecandidate = (event) => {
          if (event.candidate) {
            sendMessage('webrtc.ice', {
              peer_id: peerId,
              candidate: event.candidate,
            });
          }
        };

      } catch (err: any) {
        console.error("Error accessing media devices.", err);
        setError("Camera/Microphone access denied or unavailable.");
      }
    };

    initWebRTC();

    return () => {
      localStream.current?.getTracks().forEach((track) => track.stop());
      peerConnection.current?.close();
    };
  }, [peerId]);

  // Process Incoming Signals
  useEffect(() => {
    if (!peerConnection.current || !peerId || incomingSignals.length === 0) return;

    const processSignals = async () => {
      for (const signal of incomingSignals) {
        if (signal.peer_id !== peerId) continue;

        try {
          if (signal.type === 'offer' && signal.sdp) {
            await peerConnection.current!.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            const answer = await peerConnection.current!.createAnswer();
            await peerConnection.current!.setLocalDescription(answer);
            sendMessage('webrtc.answer', { peer_id: peerId, sdp: peerConnection.current!.localDescription });
          } else if (signal.type === 'answer' && signal.sdp) {
            await peerConnection.current!.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          } else if (signal.type === 'ice' && signal.candidate) {
            await peerConnection.current!.addIceCandidate(new RTCIceCandidate(signal.candidate));
          }
        } catch (err) {
          console.error('Error processing signal', err);
        }
      }
      useWebRTCStore.getState().clearSignals();
    };

    processSignals();
  }, [incomingSignals, peerId, sendMessage]);

  const initiateCall = async () => {
    if (!peerConnection.current || !peerId) return;
    try {
      const offer = await peerConnection.current.createOffer();
      await peerConnection.current.setLocalDescription(offer);
      sendMessage('webrtc.offer', { peer_id: peerId, sdp: peerConnection.current.localDescription });
    } catch (err) {
      console.error('Error creating offer', err);
    }
  };

  const toggleMute = () => {
    if (localStream.current) {
      const audioTracks = localStream.current.getAudioTracks();
      if (audioTracks.length > 0) {
        audioTracks[0].enabled = !audioTracks[0].enabled;
        setIsMuted(!audioTracks[0].enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localStream.current) {
      const videoTracks = localStream.current.getVideoTracks();
      if (videoTracks.length > 0) {
        videoTracks[0].enabled = !videoTracks[0].enabled;
        setIsVideoOff(!videoTracks[0].enabled);
      }
    }
  };

  return {
    localVideoRef,
    remoteVideoRef,
    isMuted,
    isVideoOff,
    error,
    toggleMute,
    toggleVideo,
    initiateCall,
  };
}

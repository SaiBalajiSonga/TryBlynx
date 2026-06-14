import { useState, useEffect } from 'react';
import { useChatStore } from '../store/chatStore';
import { useWebSocket } from '../lib/useWebSocket';
import { useAuthStore } from '../store/authStore';
import { Video, Zap, X, Camera } from 'lucide-react';
import { useWebRTCStore } from '../store/webrtcStore';
import { VideoRoom } from './VideoRoom';
import { MatchHistorySidebar } from './MatchHistorySidebar';

export function VideoChat() {
  const wsStatus   = useChatStore(s => s.wsStatus);
  const matchStatus = useChatStore(s => s.matchStatus);
  const activeRoomId = useChatStore(s => s.activeRoomId);
  const matchPeerId  = useChatStore(s => s.matchPeerId);
  
  const { sendMessage } = useWebSocket();
  const { isVideoActive, activePeerId, isInitiator, startVideo } = useWebRTCStore();
  const [elapsed, setElapsed] = useState(0);

  const user = useAuthStore(s => s.user);

  // FIX: When a match is found via text-match flow and we're on the video page,
  // automatically start the video call. Determine initiator deterministically
  // by comparing UUIDs so only one side sends the offer.
  useEffect(() => {
    if (matchStatus === 'matched' && matchPeerId && activeRoomId && !isVideoActive && user) {
      const amInitiator = user.id < matchPeerId;
      const t = setTimeout(() => {
        startVideo(matchPeerId, amInitiator);
      }, 500);
      return () => clearTimeout(t);
    }
  }, [matchStatus, matchPeerId, activeRoomId, isVideoActive, startVideo, user]);

  useEffect(() => {
    if (matchStatus !== 'waiting') { setElapsed(0); return; }
    const t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, [matchStatus]);

  // Clean up when leaving the Video Chat page
  useEffect(() => {
    return () => {
      const webrtc = useWebRTCStore.getState();
      const chat = useChatStore.getState();
      
      if (webrtc.isVideoActive) {
        if (chat.activeRoomId) {
          if (chat.matchPeerId) {
            sendMessage('match.leave', { peer_id: chat.matchPeerId, room_id: chat.activeRoomId });
          } else {
            sendMessage('chat.leave', { room_id: chat.activeRoomId });
          }
          chat.clearMatchChat();
        }
        webrtc.endVideo();
      }
      
      if (chat.matchStatus === 'waiting') {
        sendMessage('match.cancel', {});
        chat.setMatchStatus('idle');
      }
    };
  }, [sendMessage]);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // Show video room overlay if active
  if (isVideoActive && activePeerId) {
    return (
      <div style={{ flex: 1, display: 'flex', height: '100%', overflow: 'hidden' }}>
        <MatchHistorySidebar />
        <div style={{ flex: 1, position: 'relative', background: '#000', overflow: 'hidden' }}>
          <VideoRoom peerId={activePeerId} isInitiator={isInitiator} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', height: '100%', overflow: 'hidden' }}>
      <MatchHistorySidebar />
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '32px', background: 'var(--blynx-900)',
        backgroundImage: 'radial-gradient(ellipse at center, rgba(244,114,182,0.06) 0%, transparent 70%)',
      }}>
        <div style={{ maxWidth: '440px', width: '100%', textAlign: 'center' }}>
        {/* Animated icon */}
        <div style={{ position: 'relative', display: 'inline-flex', marginBottom: '36px' }}>
          {matchStatus === 'waiting' && [0, 1].map(i => (
            <div key={i} style={{
              position: 'absolute', inset: `${-(i + 1) * 14}px`, borderRadius: '50%',
              border: '1.5px solid #f472b6', opacity: 0,
              animation: `pulse-ring 2s ease ${i * 0.5}s infinite`,
            }} />
          ))}
          <div style={{
            width: '96px', height: '96px', borderRadius: '50%',
            background: matchStatus === 'waiting'
              ? 'linear-gradient(135deg, #f472b6 0%, #fb923c 100%)'
              : 'var(--blynx-700)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: matchStatus === 'waiting' ? '0 0 40px rgba(244,114,182,0.4)' : 'none',
            transition: 'all 0.4s',
          }}>
            <Video size={40} color={matchStatus === 'waiting' ? 'white' : 'var(--text-muted)'} />
          </div>
        </div>

        <h2 style={{ margin: '0 0 10px', fontSize: '28px', fontWeight: 700, color: 'white', letterSpacing: '-0.5px' }}>
          {matchStatus === 'waiting' ? 'Finding someone…' : 'Video Chat'}
        </h2>
        <p style={{ margin: '0 0 32px', color: 'var(--text-secondary)', fontSize: '15px', lineHeight: 1.5 }}>
          {matchStatus === 'waiting'
            ? `Searching for a video match · ${fmt(elapsed)}`
            : 'Go face-to-face with a stranger. Real, unfiltered, instant.'}
        </p>

        {/* Same PC / different browser notice */}
        <div style={{
          padding: '10px 14px', borderRadius: '8px', marginBottom: '20px',
          background: 'rgba(250,166,26,0.08)', border: '1px solid rgba(250,166,26,0.2)',
          fontSize: '12px', color: 'var(--yellow)', textAlign: 'left',
          display: 'flex', alignItems: 'flex-start', gap: '8px',
        }}>
          <Camera size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
          <span>
            Testing on the same computer with different browsers? WebRTC works — both browsers share the same camera, so you'll see the same feed twice. On separate devices it works normally.
          </span>
        </div>

        {matchStatus === 'waiting' ? (
          <button
            onClick={() => sendMessage('match.cancel', {})}
            style={{
              width: '100%', padding: '14px', borderRadius: '10px',
              border: '1px solid var(--border-bright)', background: 'var(--blynx-700)',
              color: 'var(--text-primary)', fontSize: '15px', fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            }}
          >
            <X size={18} /> Cancel
          </button>
        ) : (
          <button
            onClick={() => sendMessage('match.find', { target_gender: 'any', mode: 'video' })}
            disabled={wsStatus !== 'connected'}
            className="btn-accent"
            style={{ width: '100%', padding: '14px', fontSize: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
          >
            <Zap size={18} />
            {wsStatus !== 'connected' ? 'Connecting…' : 'Find a Video Match'}
          </button>
        )}
      </div>
    </div>
    </div>
  );
}

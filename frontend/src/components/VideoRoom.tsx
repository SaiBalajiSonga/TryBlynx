import { useEffect, useState, useRef } from 'react';
import { useWebRTC } from '../lib/useWebRTC';
import { useWebRTCStore } from '../store/webrtcStore';
import { useChatStore } from '../store/chatStore';
import { useAuthStore } from '../store/authStore';
import { getSendMessage } from '../lib/useWebSocket';
import { api } from '../lib/api';
import { Mic, MicOff, Video, VideoOff, PhoneOff, AlertCircle, Wifi, Send, Loader } from 'lucide-react';
import { startVideoModeration, reportAIStrike } from '../lib/videoModeration';

const EMPTY_MESSAGES: import('../store/chatStore').ChatMessage[] = [];

export function VideoRoom({ peerId, isInitiator }: { peerId: string; isInitiator: boolean }) {
  const { endVideo } = useWebRTCStore();
  const {
    localVideoRef, remoteVideoRef,
    isMuted, isVideoOff, error, connectionState,
    toggleMute, toggleVideo,
  } = useWebRTC(peerId, isInitiator);

  const [chatVisible, setChatVisible] = useState(true);
  const [chatInput, setChatInput] = useState('');
  const [isPipHovered, setIsPipHovered] = useState(false);
  const [peerProfile, setPeerProfile] = useState<any>(null);
  const [remoteLoaded, setRemoteLoaded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // NSFWJS cleanup ref — stores the cleanup fn from startVideoModeration
  const moderationCleanupRef = useRef<(() => void) | null>(null);

  const user = useAuthStore(s => s.user);
  const activeRoomId = useChatStore(s => s.activeRoomId);
  const messages = useChatStore(s => (activeRoomId ? s.messages[activeRoomId] : undefined) ?? EMPTY_MESSAGES);

  useEffect(() => {
    if (peerId) {
      api.getUserProfile(peerId)
        .then(data => {
          setPeerProfile(data);
          useChatStore.getState().addRecentMatch({
            peer_id: peerId,
            username: data.username,
            display_name: data.display_name,
            matched_at: Date.now()
          });
        })
        .catch(err => console.error("Failed to fetch peer profile", err));
    }
  }, [peerId]);

  useEffect(() => {
    if (chatVisible) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, chatVisible]);

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !activeRoomId) return;
    const send = getSendMessage();
    send?.('chat.message', { room_id: activeRoomId, body: chatInput.trim() });
    setChatInput('');
  };

  useEffect(() => {
    // Bug fix #11: Cancel previous moderation session before starting a new one
    // to prevent memory leaks when video is toggled off/on.
    if (isVideoOff) {
      moderationCleanupRef.current?.();
      moderationCleanupRef.current = null;
      return;
    }
    const videoEl = localVideoRef.current;
    if (!videoEl) return;
    moderationCleanupRef.current?.(); // cancel any existing session
    const cleanup = startVideoModeration(videoEl, (predictions) => {
      console.warn('Inappropriate behavior detected!', predictions);
      reportAIStrike();
      endVideo();
    });
    moderationCleanupRef.current = cleanup ?? null;
    return () => {
      moderationCleanupRef.current?.();
      moderationCleanupRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVideoOff]);

  const stateColor = {
    connected: '#4ade80',
    connecting: '#fbbf24',
    new: '#fbbf24',
    disconnected: '#f87171',
    failed: '#f87171',
    closed: '#f87171',
  }[connectionState] ?? 'var(--text-muted)';

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 100,
      background: 'rgba(10,11,15,0.92)',
      backdropFilter: 'blur(12px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px',
    }}>
      {error ? (
        <div style={{
          background: 'var(--blynx-800)',
          border: '1px solid var(--border)',
          borderRadius: '20px',
          padding: '40px',
          textAlign: 'center',
          maxWidth: '380px', width: '100%',
        }}>
          <div style={{
            width: '64px', height: '64px', borderRadius: '50%',
            background: 'rgba(237,66,69,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px',
          }}>
            <AlertCircle size={32} color="#ed4245" />
          </div>
          <h3 style={{ margin: '0 0 10px', color: 'white', fontSize: '18px', fontWeight: 700 }}>
            Camera Access Denied
          </h3>
          <p style={{ margin: '0 0 24px', color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1.5 }}>
            {error}
          </p>
          <button
            onClick={endVideo}
            className="btn-accent"
            style={{ width: '100%', padding: '12px' }}
          >
            Close
          </button>
        </div>
      ) : (
        <div style={{
          width: '100%', maxWidth: '1100px',
          background: 'var(--blynx-850)',
          borderRadius: '20px',
          border: '1px solid var(--border)',
          overflow: 'hidden',
          boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
          display: 'flex',
          flexDirection: 'column',
          aspectRatio: '16/9',
          position: 'relative',
        }}>
          {/* Main remote video */}
          <div 
            style={{ flex: 1, position: 'relative', background: '#000', cursor: 'pointer' }}
            onClick={() => setChatVisible(v => !v)}
          >
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              onLoadedMetadata={() => setRemoteLoaded(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: remoteLoaded ? 1 : 0, transition: 'opacity 0.3s' }}
            />
            {/* Loading placeholder while remote video hasn't loaded */}
            {!remoteLoaded && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: '14px',
                background: '#0a0b0f',
              }}>
                <div style={{
                  width: '64px', height: '64px', borderRadius: '50%',
                  background: 'linear-gradient(135deg, var(--accent), #7289da)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '24px', fontWeight: 700, color: 'white', overflow: 'hidden',
                }}>
                  {peerProfile?.avatar_url
                    ? <img src={peerProfile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : (peerProfile?.display_name || peerProfile?.username || '?').charAt(0).toUpperCase()
                  }
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '14px' }}>
                  <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} />
                  Connecting...
                </div>
              </div>
            )}

            {/* User Details Overlay */}
            {peerProfile && (
              <div style={{
                position: 'absolute', top: '16px', left: '16px',
                display: 'flex', alignItems: 'center', gap: '10px',
                background: 'rgba(0,0,0,0.5)',
                backdropFilter: 'blur(8px)',
                padding: '6px 14px 6px 6px',
                borderRadius: '24px',
                border: '1px solid rgba(255,255,255,0.1)',
                zIndex: 10,
                pointerEvents: 'none'
              }}>
                <div style={{
                  width: '32px', height: '32px', borderRadius: '50%',
                  background: 'linear-gradient(135deg, var(--accent), #7289da)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '13px', fontWeight: 700, color: 'white',
                  flexShrink: 0,
                }}>
                  {peerProfile.avatar_url ? (
                    <img src={peerProfile.avatar_url} alt="Avatar" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    (peerProfile.display_name || peerProfile.username).charAt(0).toUpperCase()
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontWeight: 600, fontSize: '14px', color: 'white', lineHeight: '1.2' }}>
                    {peerProfile.display_name || peerProfile.username}
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    @{peerProfile.username}
                  </span>
                </div>
              </div>
            )}

            {/* Connection state badge */}
            <div style={{
              position: 'absolute', top: '16px', right: '16px',
              display: 'flex', alignItems: 'center', gap: '6px',
              background: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(8px)',
              padding: '5px 10px',
              borderRadius: '20px',
              border: '1px solid rgba(255,255,255,0.08)',
              zIndex: 10,
            }}>
              <Wifi size={12} color={stateColor} />
              <span style={{ fontSize: '12px', color: 'white', fontWeight: 500, textTransform: 'capitalize' }}>
                {connectionState}
              </span>
            </div>

            {/* Local PIP */}
            <div 
              onMouseEnter={() => setIsPipHovered(true)}
              onMouseLeave={() => setIsPipHovered(false)}
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'absolute', bottom: '16px', right: '16px',
                width: '160px', aspectRatio: '4/3',
                borderRadius: '12px',
                overflow: 'hidden',
                border: '2px solid rgba(255,255,255,0.15)',
                background: '#111',
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              }}
            >
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
              />
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', flexDirection: 'column',
                justifyContent: 'flex-end',
                padding: '8px',
                background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 40%)',
                opacity: isPipHovered ? 1 : 0, 
                transition: 'opacity 0.2s',
                pointerEvents: isPipHovered ? 'auto' : 'none'
              }}>
                <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                  <ControlBtn
                    onClick={toggleMute}
                    active={isMuted}
                    activeColor="rgba(237,66,69,0.9)"
                    activeIconColor="white"
                    icon={isMuted ? MicOff : Mic}
                    label={isMuted ? 'Unmute' : 'Mute'}
                    size={32}
                    iconSize={14}
                  />
                  <ControlBtn
                    onClick={toggleVideo}
                    active={isVideoOff}
                    activeColor="rgba(237,66,69,0.9)"
                    activeIconColor="white"
                    icon={isVideoOff ? VideoOff : Video}
                    label={isVideoOff ? 'Start Cam' : 'Stop Cam'}
                    size={32}
                    iconSize={14}
                  />
                  <button
                    onClick={() => {
                      endVideo();
                      const chat = useChatStore.getState();
                      if (chat.activeRoomId) {
                        const send = getSendMessage();
                        if (chat.matchPeerId) {
                          send?.('match.leave', { peer_id: chat.matchPeerId, room_id: chat.activeRoomId });
                        } else {
                          send?.('chat.leave', { room_id: chat.activeRoomId });
                        }
                        chat.clearMatchChat();
                      }
                    }}
                    style={{
                      width: '32px', height: '32px', borderRadius: '50%',
                      border: 'none', cursor: 'pointer',
                      background: '#ed4245',
                      color: 'white',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: '0 0 10px rgba(237,66,69,0.35)',
                      transition: 'background 0.12s, transform 0.1s',
                    }}
                    title="End Call"
                  >
                    <PhoneOff size={14} />
                  </button>
                </div>
              </div>
              
              {/* Show VideoOff icon if video is off and not hovered */}
              {isVideoOff && !isPipHovered && (
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'var(--blynx-800)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  pointerEvents: 'none'
                }}>
                  <VideoOff size={24} color="var(--text-muted)" />
                </div>
              )}

              <div style={{
                position: 'absolute', top: '4px', left: '6px',
                fontSize: '10px', color: 'rgba(255,255,255,0.7)',
                fontWeight: 600, textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                pointerEvents: 'none'
              }}>
                You
              </div>
            </div>

            {/* Translucent Chat Overlay */}
            {chatVisible && (
              <div 
                style={{
                  position: 'absolute', bottom: '16px', left: '16px',
                  width: '320px', maxHeight: '50%',
                  display: 'flex', flexDirection: 'column',
                  gap: '8px', zIndex: 10,
                  pointerEvents: 'auto',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{
                  flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px',
                  maskImage: 'linear-gradient(to bottom, transparent, black 15%)',
                  WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 15%)',
                  paddingTop: '20px', scrollbarWidth: 'none',
                }}>
                  {messages.map((msg, i) => {
                    const isMe = msg.sender_id === user?.id;
                    return (
                      <div key={msg.message_id || i} style={{
                        alignSelf: 'flex-start',
                        background: isMe ? 'rgba(88,101,242,0.4)' : 'rgba(0,0,0,0.5)',
                        backdropFilter: 'blur(6px)',
                        padding: '6px 12px',
                        borderRadius: '14px',
                        color: 'white',
                        fontSize: '14px',
                        lineHeight: 1.4,
                        maxWidth: '90%',
                        wordBreak: 'break-word',
                        border: '1px solid rgba(255,255,255,0.08)'
                      }}>
                        <span style={{ fontWeight: 600, color: isMe ? '#a5b4fc' : '#fca5a5', marginRight: '6px' }}>
                          {isMe ? 'You' : msg.sender_name}
                        </span>
                        <span>{msg.body}</span>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
                <form onSubmit={handleSendChat} style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Type a message..."
                    style={{
                      flex: 1, padding: '10px 14px', borderRadius: '20px',
                      background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: 'white', fontSize: '14px', outline: 'none'
                    }}
                  />
                  <button
                    type="submit"
                    disabled={!chatInput.trim()}
                    style={{
                      width: '38px', height: '38px', borderRadius: '50%',
                      background: chatInput.trim() ? 'var(--accent)' : 'rgba(0,0,0,0.5)',
                      backdropFilter: 'blur(6px)', border: 'none',
                      color: chatInput.trim() ? 'white' : 'rgba(255,255,255,0.4)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: chatInput.trim() ? 'pointer' : 'not-allowed',
                      transition: '0.2s'
                    }}
                  >
                    <Send size={16} />
                  </button>
                </form>
              </div>
            )}
          </div>
          {/* Persistent bottom control bar — always visible */}
          <div style={{
            height: '64px', flexShrink: 0,
            background: 'rgba(10,11,15,0.85)', backdropFilter: 'blur(10px)',
            borderTop: '1px solid rgba(255,255,255,0.07)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
          }}>
            <ControlBtn
              onClick={toggleMute}
              active={isMuted}
              activeColor="rgba(237,66,69,0.9)"
              activeIconColor="white"
              icon={isMuted ? MicOff : Mic}
              label={isMuted ? 'Unmute' : 'Mute'}
            />
            <ControlBtn
              onClick={toggleVideo}
              active={isVideoOff}
              activeColor="rgba(237,66,69,0.9)"
              activeIconColor="white"
              icon={isVideoOff ? VideoOff : Video}
              label={isVideoOff ? 'Start Cam' : 'Stop Cam'}
            />
            <button
              onClick={endVideo}
              style={{
                width: '48px', height: '48px', borderRadius: '50%',
                border: 'none', cursor: 'pointer',
                background: '#ed4245',
                color: 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 0 20px rgba(237,66,69,0.45)',
                transition: 'transform 0.1s, box-shadow 0.1s',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.boxShadow = '0 0 28px rgba(237,66,69,0.65)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 0 20px rgba(237,66,69,0.45)'; }}
              title="End Call"
            >
              <PhoneOff size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ControlBtn({ onClick, active, activeColor, activeIconColor, icon: Icon, label, size = 44, iconSize = 20 }: {
  onClick: () => void;
  active: boolean;
  activeColor: string;
  activeIconColor: string;
  icon: typeof Mic;
  label: string;
  size?: number;
  iconSize?: number;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        width: `${size}px`, height: `${size}px`, borderRadius: '50%',
        border: 'none', cursor: 'pointer',
        background: active ? activeColor : 'rgba(0,0,0,0.6)',
        color: active ? activeIconColor : 'white',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.12s, color 0.12s, transform 0.1s',
        backdropFilter: 'blur(4px)'
      }}
    >
      <Icon size={iconSize} />
    </button>
  );
}

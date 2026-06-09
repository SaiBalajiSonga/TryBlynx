import { useEffect } from 'react';
import { useWebRTC } from '../lib/useWebRTC';
import { useWebRTCStore } from '../store/webrtcStore';
import { Mic, MicOff, Video, VideoOff, PhoneOff, AlertCircle, Wifi } from 'lucide-react';
import { startVideoModeration, reportAIStrike } from '../lib/videoModeration';

export function VideoRoom({ peerId, isInitiator }: { peerId: string; isInitiator: boolean }) {
  const { endVideo } = useWebRTCStore();
  const {
    localVideoRef, remoteVideoRef,
    isMuted, isVideoOff, error, connectionState,
    toggleMute, toggleVideo, initiateCall,
  } = useWebRTC(peerId);

  useEffect(() => {
    if (isInitiator) {
      const timer = setTimeout(() => initiateCall(), 800);
      return () => clearTimeout(timer);
    }
  }, [isInitiator, initiateCall]);

  useEffect(() => {
    if (localVideoRef.current && !isVideoOff) {
      // Start AI moderation on the local video stream
      const cleanup = startVideoModeration(localVideoRef.current, (predictions) => {
        console.warn('Inappropriate behavior detected!', predictions);
        reportAIStrike();
        endVideo();
      });
      return cleanup;
    }
  }, [localVideoRef.current, isVideoOff, endVideo]);

  const stateColor = {
    connected: 'var(--teal)',
    connecting: 'var(--yellow)',
    new: 'var(--yellow)',
    disconnected: 'var(--red)',
    failed: 'var(--red)',
    closed: 'var(--red)',
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
          <div style={{ flex: 1, position: 'relative', background: '#000' }}>
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />

            {/* Connection state badge */}
            <div style={{
              position: 'absolute', top: '16px', left: '16px',
              display: 'flex', alignItems: 'center', gap: '6px',
              background: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(8px)',
              padding: '5px 10px',
              borderRadius: '20px',
              border: '1px solid rgba(255,255,255,0.08)',
            }}>
              <Wifi size={12} color={stateColor} />
              <span style={{ fontSize: '12px', color: 'white', fontWeight: 500, textTransform: 'capitalize' }}>
                {connectionState}
              </span>
            </div>

            {/* Local PIP */}
            <div style={{
              position: 'absolute', bottom: '16px', right: '16px',
              width: '160px', aspectRatio: '4/3',
              borderRadius: '12px',
              overflow: 'hidden',
              border: '2px solid rgba(255,255,255,0.15)',
              background: '#111',
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            }}>
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              {isVideoOff && (
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'var(--blynx-800)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <VideoOff size={24} color="var(--text-muted)" />
                </div>
              )}
              <div style={{
                position: 'absolute', bottom: '4px', left: '6px',
                fontSize: '10px', color: 'rgba(255,255,255,0.7)',
                fontWeight: 600,
              }}>
                You
              </div>
            </div>
          </div>

          {/* Controls bar */}
          <div style={{
            padding: '16px 24px',
            background: 'var(--blynx-800)',
            borderTop: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: '12px',
          }}>
            <ControlBtn
              onClick={toggleMute}
              active={isMuted}
              activeColor="rgba(237,66,69,0.2)"
              activeIconColor="#ed4245"
              icon={isMuted ? MicOff : Mic}
              label={isMuted ? 'Unmute' : 'Mute'}
            />
            <button
              onClick={endVideo}
              style={{
                width: '52px', height: '52px', borderRadius: '50%',
                border: 'none', cursor: 'pointer',
                background: '#ed4245',
                color: 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 0 20px rgba(237,66,69,0.35)',
                transition: 'background 0.12s, transform 0.1s',
              }}
              title="End Call"
            >
              <PhoneOff size={22} />
            </button>
            <ControlBtn
              onClick={toggleVideo}
              active={isVideoOff}
              activeColor="rgba(237,66,69,0.2)"
              activeIconColor="#ed4245"
              icon={isVideoOff ? VideoOff : Video}
              label={isVideoOff ? 'Start Cam' : 'Stop Cam'}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ControlBtn({ onClick, active, activeColor, activeIconColor, icon: Icon, label }: {
  onClick: () => void;
  active: boolean;
  activeColor: string;
  activeIconColor: string;
  icon: typeof Mic;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        width: '44px', height: '44px', borderRadius: '50%',
        border: 'none', cursor: 'pointer',
        background: active ? activeColor : 'var(--blynx-600)',
        color: active ? activeIconColor : 'var(--text-secondary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.12s, color 0.12s, transform 0.1s',
      }}
    >
      <Icon size={20} />
    </button>
  );
}

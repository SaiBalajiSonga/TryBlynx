import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { api } from '../lib/api';
import { X, MapPin, Globe, Edit2, Shield, Crown, Code, ShieldAlert, Ban, UserPlus, UserCheck, UserX, MessageSquare, Clock, Loader } from 'lucide-react';
import { SettingsView } from './Settings';
import { useNavigate } from 'react-router-dom';

interface UserProfileModalProps {
  userId: string;
  onClose: () => void;
}

type FriendStatus = 'none' | 'pending_outgoing' | 'pending_incoming' | 'accepted' | 'blocked';

export function UserProfileModal({ userId, onClose }: UserProfileModalProps) {
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [isReporting, setIsReporting] = useState(false);
  const [friendStatus, setFriendStatus] = useState<FriendStatus>('none');
  const [friendLoading, setFriendLoading] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [isFullscreenAvatar, setIsFullscreenAvatar] = useState(false);

  const isOwnProfile = userId === currentUser?.id;

  useEffect(() => {
    if (isOwnProfile) {
      setUser(currentUser);
      setLoading(false);
    } else {
      api.getUserProfile(userId)
        .then(res => { setUser(res); setLoading(false); })
        .catch(() => setLoading(false));
    }

    if (!isOwnProfile) {
      api.getFriendStatus(userId)
        .then(s => setFriendStatus(s.status as FriendStatus))
        .catch(() => {});
    }
  }, [userId, currentUser, isOwnProfile]);

  const showFb = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(''), 2500);
  };

  const withLoading = async (fn: () => Promise<void>) => {
    setFriendLoading(true);
    try { await fn(); } finally { setFriendLoading(false); }
  };

  const handleSendRequest   = () => withLoading(async () => { await api.sendFriendRequest(userId);   setFriendStatus('pending_outgoing'); showFb('Friend request sent!'); });
  const handleAccept        = () => withLoading(async () => { await api.acceptFriendRequest(userId);  setFriendStatus('accepted');         showFb('You are now friends!'); });
  const handleDecline       = () => withLoading(async () => { await api.declineFriendRequest(userId); setFriendStatus('none'); });
  const handleRemoveFriend  = () => withLoading(async () => {
    if (!window.confirm('Remove this friend?')) return;
    await api.removeFriend(userId);
    setFriendStatus('none');
  });
  const handleMessage = async () => {
    try {
      const res = await api.startDM(userId);
      onClose();
      navigate(`/app/dms/${res.conversation_id}`);
    } catch (err: any) {
      if (err.message === 'not_friends') {
        showFb('Add as friend first to message.');
      } else {
        showFb(err.message || 'Could not start DM.');
      }
    }
  };
  const handleBlock = async () => {
    if (!window.confirm(`Block ${user.username}?`)) return;
    try { await api.blockUser(user.id); showFb('User blocked.'); setTimeout(onClose, 1500); }
    catch (err: any) { showFb(err.message); }
  };
  const handleReport = async () => {
    if (!reportReason) return showFb('Please provide a reason.');
    try { await api.reportUser(user.id, reportReason); showFb('Reported.'); setIsReporting(false); setReportReason(''); }
    catch (err: any) { showFb(err.message); }
  };

  if (loading) return null;
  if (!user) return null;

  if (isEditing) {
    return (
      <div 
        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        onClick={() => setIsEditing(false)}
      >
        <div 
          style={{ width: '600px', height: '80vh', background: 'var(--blynx-900)', borderRadius: '16px', overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}
          onClick={(e) => e.stopPropagation()}
        >
          <button onClick={() => setIsEditing(false)} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', color: 'white', cursor: 'pointer', zIndex: 10 }}>
            <X size={24} />
          </button>
          <SettingsView />
        </div>
      </div>
    );
  }

  const hash = user.username.split('').reduce((acc: number, c: string) => c.charCodeAt(0) + ((acc << 5) - acc), 0);
  const bannerColor = `hsl(${Math.abs(hash) % 360}, 55%, 38%)`;
  const initials = (user.display_name || user.username || 'U').charAt(0).toUpperCase();

  if (isFullscreenAvatar && user.avatar_url) {
    return (
      <div 
        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.65)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(6px)' }}
        onClick={() => setIsFullscreenAvatar(false)}
      >
        <img src={user.avatar_url} alt="" style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: '8px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }} />
        <button style={{ position: 'absolute', top: 24, right: 24, background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', padding: '8px', borderRadius: '50%', cursor: 'pointer', display: 'flex' }}>
          <X size={24} />
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ width: '360px', background: 'var(--blynx-850)', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 16px 48px rgba(0,0,0,0.6)', position: 'relative' }} onClick={e => e.stopPropagation()}>

        {/* Banner */}
        <div style={{ height: '110px', background: `linear-gradient(135deg, ${bannerColor}, hsl(${(Math.abs(hash)+60)%360},55%,30%))`, position: 'relative' }}>
          <button onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, background: 'rgba(0,0,0,0.4)', border: 'none', borderRadius: '50%', padding: '6px', color: 'white', cursor: 'pointer', display: 'flex' }}>
            <X size={15} />
          </button>
        </div>

        {/* Avatar */}
        <div style={{ position: 'absolute', top: '66px', left: '16px', borderRadius: '50%', background: 'var(--blynx-850)', padding: '5px' }}>
          <div 
            onClick={() => { if (user.avatar_url) setIsFullscreenAvatar(true); }}
            style={{ width: '76px', height: '76px', borderRadius: '50%', background: 'var(--blynx-700)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '30px', fontWeight: 700, color: 'white', overflow: 'hidden', cursor: user.avatar_url ? 'pointer' : 'default' }}
          >
            {user.avatar_url
              ? <img src={user.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
              : initials}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 14px', height: '44px', gap: '6px', alignItems: 'center' }}>
          {feedback && <span style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 600 }}>{feedback}</span>}

          {isOwnProfile ? (
            <button onClick={() => setIsEditing(true)} style={smBtn}>
              <Edit2 size={12} /> Edit Profile
            </button>
          ) : friendLoading ? (
            <Loader size={18} className="spin" color="var(--accent)" />
          ) : (
            <>
              {friendStatus === 'accepted' && (
                <>
                  <button onClick={handleMessage} className="btn-accent" style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px', borderRadius: '6px' }}>
                    <MessageSquare size={12} /> Message
                  </button>
                  <button onClick={handleRemoveFriend} title="Remove friend" style={{ ...smBtn, color: '#ed4245' }}>
                    <UserX size={12} />
                  </button>
                </>
              )}
              {friendStatus === 'pending_outgoing' && (
                <button disabled style={{ ...smBtn, opacity: 0.6, cursor: 'default', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Clock size={12} /> Pending
                </button>
              )}
              {friendStatus === 'pending_incoming' && (
                <>
                  <button onClick={handleAccept} className="btn-accent" style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', borderRadius: '6px' }}>
                    <UserCheck size={12} /> Accept
                  </button>
                  <button onClick={handleDecline} style={smBtn}><UserX size={12} /></button>
                </>
              )}
              {friendStatus === 'none' && (
                <button onClick={handleSendRequest} style={{ ...smBtn, display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <UserPlus size={12} /> Add Friend
                </button>
              )}
              <button onClick={() => setIsReporting(true)} title="Report" style={{ ...smBtn, padding: '6px 8px' }}>
                <ShieldAlert size={12} />
              </button>
              <button onClick={handleBlock} title="Block" style={{ ...smBtn, color: '#ed4245', padding: '6px 8px' }}>
                <Ban size={12} />
              </button>
            </>
          )}
        </div>

        {/* Report overlay */}
        {isReporting && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'var(--blynx-850)', zIndex: 10, padding: '24px', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ margin: '0 0 16px', color: 'white' }}>Report User</h3>
            <textarea
              value={reportReason} onChange={e => setReportReason(e.target.value)}
              placeholder="Why are you reporting this user?"
              style={{ flex: 1, background: 'var(--blynx-800)', border: '1px solid var(--border)', color: 'white', padding: '12px', borderRadius: '8px', resize: 'none', outline: 'none', marginBottom: '16px' }}
            />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setIsReporting(false)} style={{ background: 'transparent', color: 'white', border: 'none', cursor: 'pointer', padding: '8px 16px' }}>Cancel</button>
              <button onClick={handleReport} style={{ background: '#ed4245', color: 'white', border: 'none', cursor: 'pointer', padding: '8px 16px', borderRadius: '6px' }}>Submit</button>
            </div>
          </div>
        )}

        {/* Body */}
        <div style={{ padding: '0 16px 16px' }}>
          <div style={{ background: 'var(--blynx-800)', borderRadius: '10px', padding: '14px', marginTop: '6px' }}>
            <h2 style={{ margin: '0 0 2px', fontSize: '19px', fontWeight: 800, color: 'white', display: 'flex', alignItems: 'center', gap: '6px' }}>
              {user.display_name || user.username}
              {user.is_admin     && <Shield size={15} color="var(--accent)" />}
              {user.is_vip       && <Crown  size={15} color="#fbbf24" />}
              {user.is_developer && <Code   size={15} color="#a855f7" />}
            </h2>
            <div style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '12px' }}>@{user.username}</div>

            <div style={{ width: '100%', height: '1px', background: 'var(--border)', marginBottom: '12px' }} />

            <div style={{ marginBottom: '12px' }}>
              <h3 style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 800, margin: '0 0 6px', letterSpacing: '0.5px' }}>About Me</h3>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                {user.bio || "This user hasn't written a bio yet."}
              </p>
            </div>

            {(user.location || user.language) && (
              <div style={{ display: 'flex', gap: '14px', marginBottom: '12px', flexWrap: 'wrap' }}>
                {user.location && <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--text-secondary)', fontSize: '12px' }}><MapPin size={13} />{user.location}</div>}
                {user.language && <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--text-secondary)', fontSize: '12px' }}><Globe size={13} />{user.language}</div>}
              </div>
            )}

            {user.interests?.length > 0 && (
              <div>
                <h3 style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 800, margin: '0 0 8px', letterSpacing: '0.5px' }}>Interests</h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                  {user.interests.map((i: string, idx: number) => (
                    <span key={idx} style={{ background: 'var(--blynx-700)', color: 'white', fontSize: '11px', padding: '3px 8px', borderRadius: '12px' }}>{i}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const smBtn: React.CSSProperties = {
  background: 'var(--blynx-750)', border: 'none', color: 'white',
  padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px',
  display: 'flex', alignItems: 'center', gap: '5px', fontFamily: 'inherit',
};

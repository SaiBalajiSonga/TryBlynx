import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { api } from '../lib/api';
import { X, MapPin, Globe, Edit2, Shield, Crown, Code, ShieldAlert, Ban } from 'lucide-react';
import { SettingsView } from './Settings';

interface UserProfileModalProps {
  userId: string;
  onClose: () => void;
}

export function UserProfileModal({ userId, onClose }: UserProfileModalProps) {
  const currentUser = useAuthStore((s) => s.user);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [isReporting, setIsReporting] = useState(false);

  const handleBlock = async () => {
    if (!window.confirm(`Are you sure you want to block ${user.username}?`)) return;
    try {
      await api.blockUser(user.id);
      alert('User blocked successfully.');
      onClose();
    } catch (err: any) {
      alert(`Failed to block: ${err.message}`);
    }
  };

  const handleReport = async () => {
    if (!reportReason) return alert("Please provide a reason.");
    try {
      await api.reportUser(user.id, reportReason);
      alert('User reported successfully.');
      setIsReporting(false);
      setReportReason('');
    } catch (err: any) {
      alert(`Failed to report: ${err.message}`);
    }
  };

  useEffect(() => {
    if (userId === currentUser?.id) {
      setUser(currentUser);
      setLoading(false);
    } else {
      api.getUserProfile(userId).then((res) => {
        setUser(res);
        setLoading(false);
      }).catch(err => {
        console.error("Failed to load profile:", err);
        setLoading(false);
      });
    }
  }, [userId, currentUser]);

  if (loading) return null;
  if (!user) return null;

  if (isEditing) {
    return (
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.7)', zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>
        <div style={{ width: '600px', height: '80vh', background: 'var(--blynx-900)', borderRadius: '16px', overflow: 'hidden', position: 'relative' }}>
          <button onClick={() => setIsEditing(false)} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', color: 'white', cursor: 'pointer', zIndex: 10 }}>
            <X size={24} />
          </button>
          <SettingsView />
        </div>
      </div>
    );
  }

  // Simple hash for banner color
  const hash = user.username.split('').reduce((acc: number, char: string) => char.charCodeAt(0) + ((acc << 5) - acc), 0);
  const hue = Math.abs(hash) % 360;
  const bannerColor = `hsl(${hue}, 60%, 40%)`;

  const initials = (user.display_name || user.username || 'U').charAt(0).toUpperCase();

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div style={{
        width: '340px', background: 'var(--blynx-850)', borderRadius: '16px',
        overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        position: 'relative'
      }}>
        {/* Banner */}
        <div style={{ height: '120px', background: bannerColor, position: 'relative' }}>
          <button 
            onClick={onClose}
            style={{ position: 'absolute', top: 12, right: 12, background: 'rgba(0,0,0,0.4)', border: 'none', borderRadius: '50%', padding: '6px', color: 'white', cursor: 'pointer' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Avatar */}
        <div style={{ position: 'absolute', top: '76px', left: '16px', borderRadius: '50%', background: 'var(--blynx-850)', padding: '6px' }}>
          <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'var(--blynx-700)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', fontWeight: 700, color: 'white', border: '2px solid rgba(255,255,255,0.1)' }}>
            {user.avatar_url ? <img src={user.avatar_url} style={{width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover'}} alt="" /> : initials}
          </div>
        </div>

        {/* Actions (Top Right of Body) */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 16px', height: '40px', gap: '8px' }}>
          {currentUser?.id === user.id ? (
            <button 
              onClick={() => setIsEditing(true)}
              style={{ background: 'var(--blynx-750)', border: 'none', color: 'white', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Edit2 size={12} /> Edit Profile
            </button>
          ) : (
            <>
              <button 
                onClick={() => setIsReporting(true)}
                style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                onMouseEnter={e => { e.currentTarget.style.color = '#ed4245'; e.currentTarget.style.borderColor = '#ed4245'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
              >
                <ShieldAlert size={12} /> Report
              </button>
              <button 
                onClick={handleBlock}
                style={{ background: '#ed4245', border: 'none', color: 'white', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Ban size={12} /> Block
              </button>
            </>
          )}
        </div>

        {/* Report Overlay */}
        {isReporting && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'var(--blynx-850)', zIndex: 10, padding: '24px', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ margin: '0 0 16px 0', color: 'white' }}>Report User</h3>
            <textarea 
              value={reportReason}
              onChange={e => setReportReason(e.target.value)}
              placeholder="Why are you reporting this user?"
              style={{ flex: 1, background: 'var(--blynx-800)', border: '1px solid var(--border)', color: 'white', padding: '12px', borderRadius: '8px', resize: 'none', outline: 'none', marginBottom: '16px' }}
            />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setIsReporting(false)} style={{ background: 'transparent', color: 'white', border: 'none', cursor: 'pointer', padding: '8px 16px' }}>Cancel</button>
              <button onClick={handleReport} style={{ background: '#ed4245', color: 'white', border: 'none', cursor: 'pointer', padding: '8px 16px', borderRadius: '4px' }}>Submit Report</button>
            </div>
          </div>
        )}

        {/* Body Content */}
        <div style={{ padding: '16px', paddingTop: '0', background: 'var(--blynx-800)', margin: '16px', borderRadius: '8px' }}>
          <div style={{ marginBottom: '12px' }}>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: 'white', display: 'flex', alignItems: 'center', gap: '6px' }}>
              {user.display_name || user.username}
              {user.is_admin && <Shield size={16} color="var(--accent)" />}
              {user.is_vip && <Crown size={16} color="#fbbf24" />}
              {user.is_developer && <Code size={16} color="#a855f7" />}
            </h2>
            <div style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '2px' }}>@{user.username}</div>
          </div>

          <div style={{ width: '100%', height: '1px', background: 'var(--border)', margin: '12px 0' }} />

          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 800, margin: '0 0 8px 0' }}>About Me</h3>
            <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>
              {user.bio || "This user hasn't written a bio yet."}
            </p>
          </div>

          {(user.location || user.language) && (
            <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
              {user.location && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                  <MapPin size={14} /> {user.location}
                </div>
              )}
              {user.language && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                  <Globe size={14} /> {user.language}
                </div>
              )}
            </div>
          )}

          {user.interests && user.interests.length > 0 && (
            <div>
              <h3 style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 800, margin: '0 0 8px 0' }}>Interests</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {user.interests.map((interest: string, i: number) => (
                  <span key={i} style={{ background: 'var(--blynx-700)', color: 'white', fontSize: '12px', padding: '4px 8px', borderRadius: '4px' }}>
                    {interest}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

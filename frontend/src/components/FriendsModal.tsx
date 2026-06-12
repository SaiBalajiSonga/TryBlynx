import { useState, useEffect } from 'react';
import { X, UserPlus, MessageSquare, Loader, UserX } from 'lucide-react';
import { api } from '../lib/api';
import { useNavigate } from 'react-router-dom';

interface FriendsModalProps {
  onClose: () => void;
}

export function FriendsModal({ onClose }: FriendsModalProps) {
  const [friends, setFriends] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.getFriends()
      .then(res => setFriends(res.friends || []))
      .catch(err => console.error('Failed to load friends:', err))
      .finally(() => setLoading(false));
  }, []);

  const handleMessage = async (userId: string) => {
    try {
      const res = await api.startDM(userId);
      onClose();
      navigate(`/app/dms/${res.conversation_id}`);
    } catch (err: any) {
      alert(err.message || 'Could not start DM.');
    }
  };

  const handleRemove = async (userId: string) => {
    if (!window.confirm('Remove this friend?')) return;
    try {
      await api.removeFriend(userId);
      setFriends(prev => prev.filter(f => f.id !== userId));
    } catch (err: any) {
      alert(err.message || 'Failed to remove friend');
    }
  };

  return (
    <div 
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} 
      onClick={onClose}
    >
      <div 
        style={{ background: 'var(--bg-surface)', width: '90%', maxWidth: '400px', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', maxHeight: '80vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-elevated)' }}>
          <h2 style={{ margin: 0, fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <UserPlus size={18} color="var(--accent)" />
            My Friends
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: '4px' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: '16px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><Loader className="spin" color="var(--accent)" /></div>
          ) : friends.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 20px' }}>
              You don't have any friends yet.<br />Use the Search bar to find people!
            </div>
          ) : (
            friends.map(u => (
              <div key={u.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: '10px', border: '1px solid var(--border)', gap: '12px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent), #7289da)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, flexShrink: 0, overflow: 'hidden' }}>
                  {u.avatar_url
                    ? <img src={u.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                    : (u.display_name || u.username).charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: 'white', fontSize: '15px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {u.display_name || u.username}
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    @{u.username}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={() => handleMessage(u.id)} style={{ background: 'var(--accent)', border: 'none', color: 'white', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 600 }}>
                    <MessageSquare size={14} /> DM
                  </button>
                  <button onClick={() => handleRemove(u.id)} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center' }} title="Remove friend">
                    <UserX size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

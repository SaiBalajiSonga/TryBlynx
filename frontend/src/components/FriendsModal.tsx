import { useState, useEffect } from 'react';
import { X, UserPlus, MessageSquare, Loader, UserX, UserCheck, Search as SearchIcon } from 'lucide-react';
import { api } from '../lib/api';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

interface FriendsModalProps {
  onClose: () => void;
}

export function FriendsModal({ onClose }: FriendsModalProps) {
  const user = useAuthStore(s => s.user);
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'add'>('all');
  
  const [friends, setFriends] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    if (activeTab === 'all') {
      api.getFriends()
        .then(res => setFriends(res.friends || []))
        .catch(err => console.error(err))
        .finally(() => setLoading(false));
    } else if (activeTab === 'pending') {
      api.getFriendRequests()
        .then(res => setRequests(res.requests || []))
        .catch(err => console.error(err))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'add') return;
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(() => {
      setLoading(true);
      api.searchUsers(searchQuery)
        .then(res => setSearchResults(res.users || []))
        .catch(err => console.error(err))
        .finally(() => setLoading(false));
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery, activeTab]);

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
      setFriends(prev => prev.filter(f => f.peer_id !== userId && f.id !== userId));
    } catch (err: any) {
      alert(err.message || 'Failed to remove friend');
    }
  };

  const handleAccept = async (userId: string) => {
    try {
      await api.acceptFriendRequest(userId);
      setRequests(prev => prev.filter(r => r.requester_id !== userId));
    } catch {}
  };

  const handleDecline = async (userId: string) => {
    try {
      await api.declineFriendRequest(userId);
      setRequests(prev => prev.filter(r => r.requester_id !== userId));
    } catch {}
  };

  const handleSendRequest = async (userId: string) => {
    try {
      await api.sendFriendRequest(userId);
      alert('Request sent!');
    } catch (err: any) {
      alert(err.message || 'Failed to send request');
    }
  };

  return (
    <div 
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} 
      onClick={onClose}
    >
      <div 
        style={{ background: 'var(--blynx-900)', width: '90%', maxWidth: '480px', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', height: '80vh', maxHeight: '600px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '16px 20px 0', borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h2 style={{ margin: 0, fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px', color: 'white' }}>
              <UserPlus size={18} color="var(--accent)" />
              Friends
            </h2>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: '4px' }}>
              <X size={20} />
            </button>
          </div>
          <div style={{ display: 'flex', gap: '20px' }}>
            {(['all', 'pending', 'add'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '0 0 12px 0', fontSize: '14px', fontWeight: 600,
                color: activeTab === tab ? 'white' : 'var(--text-muted)',
                borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
                transition: 'all 0.15s', whiteSpace: 'nowrap'
              }}>
                {tab === 'all' ? 'All Friends' : tab === 'pending' ? 'Pending' : 'Add Friend'}
              </button>
            ))}
          </div>
        </div>

        <div style={{ padding: '16px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {activeTab === 'add' && (
            <div style={{ position: 'relative', marginBottom: '16px' }}>
              <SearchIcon size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search by username..."
                style={{
                  width: '100%', padding: '12px 16px 12px 42px', background: 'var(--blynx-800)', border: '1px solid var(--border)',
                  borderRadius: '10px', color: 'white', fontSize: '14px', outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
          )}

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><Loader className="spin" color="var(--accent)" /></div>
          ) : activeTab === 'all' ? (
            friends.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 20px' }}>You don't have any friends yet.</div>
            ) : friends.map(u => (
              <UserRow key={u.id} u={{ id: u.peer_id || u.id, display_name: u.peer_name, username: u.peer_username, avatar_url: u.peer_avatar }}>
                <button onClick={() => handleMessage(u.peer_id || u.id)} style={btnStyle('var(--accent)')}><MessageSquare size={14} /> DM</button>
                <button onClick={() => handleRemove(u.peer_id || u.id)} style={outlineStyle} title="Remove friend"><UserX size={14} /></button>
              </UserRow>
            ))
          ) : activeTab === 'pending' ? (
            requests.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 20px' }}>No pending friend requests.</div>
            ) : requests.map(r => {
              const isOutgoing = r.requester_id === user?.id;
              const peerId = r.peer_id || (isOutgoing ? r.addressee_id : r.requester_id);
              return (
                <UserRow key={r.id} u={{ id: peerId, display_name: r.peer_name, username: r.peer_username, avatar_url: r.peer_avatar }}>
                  {isOutgoing ? (
                    <button onClick={() => handleDecline(peerId)} style={outlineStyle}><X size={14} /> Cancel</button>
                  ) : (
                    <>
                      <button onClick={() => handleAccept(peerId)} style={btnStyle('#57f287')}><UserCheck size={14} /> Accept</button>
                      <button onClick={() => handleDecline(peerId)} style={outlineStyle}><X size={14} /> Decline</button>
                    </>
                  )}
                </UserRow>
              );
            })
          ) : (
            searchResults.length === 0 ? (
              searchQuery.trim().length >= 2 && <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 20px' }}>No users found.</div>
            ) : searchResults.map(u => (
              <UserRow key={u.id} u={u}>
                <button onClick={() => handleSendRequest(u.id)} style={outlineStyle}><UserPlus size={14} /> Add</button>
              </UserRow>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function UserRow({ u, children }: { u: any, children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: '10px', border: '1px solid var(--border)', gap: '12px' }}>
      <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, flexShrink: 0, overflow: 'hidden' }}>
        {u.avatar_url ? <img src={u.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : (u.display_name || u.username || 'U').charAt(0).toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: 'white', fontSize: '15px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.display_name || u.username}</div>
        <div style={{ color: 'var(--text-secondary)', fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{u.username}</div>
      </div>
      <div style={{ display: 'flex', gap: '6px' }}>{children}</div>
    </div>
  );
}

const btnStyle = (bg: string) => ({
  background: bg, border: 'none', color: 'white', padding: '6px 10px', borderRadius: '6px',
  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 600
});

const outlineStyle = {
  background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)',
  padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 600
};

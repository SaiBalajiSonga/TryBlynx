import { useState, useEffect } from 'react';
import {
  Search as SearchIcon, Loader, MessageSquare, Crown, Shield,
  Star, Terminal, UserPlus, UserCheck, UserX, Clock, Ban
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';

type FriendStatus = 'none' | 'pending_outgoing' | 'pending_incoming' | 'accepted' | 'blocked';

export function Search() {
  const navigate = useNavigate();
  const currentUser = useAuthStore(s => s.user);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  // Map of userId → friendship status
  const [statuses, setStatuses] = useState<Record<string, FriendStatus>>({});
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.trim().length >= 2) {
        setLoading(true);
        api.searchUsers(query)
          .then(res => {
            const users = res.users || [];
            setResults(users);
            setSearched(true);
            // Fetch friendship status for each result (skip self)
            users.forEach((u: any) => {
              if (u.id === currentUser?.id) return;
              api.getFriendStatus(u.id)
                .then(s => setStatuses(prev => ({ ...prev, [u.id]: s.status as FriendStatus })))
                .catch(() => {});
            });
          })
          .catch(err => console.error('Search failed:', err))
          .finally(() => setLoading(false));
      } else {
        setResults([]);
        setSearched(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [query, currentUser?.id]);

  const setStatus = (userId: string, s: FriendStatus) =>
    setStatuses(prev => ({ ...prev, [userId]: s }));

  const withLoading = async (userId: string, fn: () => Promise<void>) => {
    setActionLoading(prev => ({ ...prev, [userId]: true }));
    try { await fn(); } finally {
      setActionLoading(prev => ({ ...prev, [userId]: false }));
    }
  };

  const showFeedback = (userId: string, msg: string) => {
    setFeedback(prev => ({ ...prev, [userId]: msg }));
    setTimeout(() => setFeedback(prev => { const n = { ...prev }; delete n[userId]; return n; }), 2500);
  };

  const handleSendRequest = (userId: string) => withLoading(userId, async () => {
    await api.sendFriendRequest(userId);
    setStatus(userId, 'pending_outgoing');
    showFeedback(userId, 'Friend request sent!');
  });

  const handleAccept = (userId: string) => withLoading(userId, async () => {
    await api.acceptFriendRequest(userId);
    setStatus(userId, 'accepted');
    showFeedback(userId, 'You are now friends!');
  });

  const handleDecline = (userId: string) => withLoading(userId, async () => {
    await api.declineFriendRequest(userId);
    setStatus(userId, 'none');
  });

  const handleRemove = (userId: string) => withLoading(userId, async () => {
    if (!window.confirm('Remove this friend?')) return;
    await api.removeFriend(userId);
    setStatus(userId, 'none');
  });

  const handleMessage = async (userId: string) => {
    try {
      const res = await api.startDM(userId);
      navigate(`/dms/${res.conversation_id}`);
    } catch (err: any) {
      if (err.message === 'not_friends') {
        alert('You need to be friends first to send a direct message.');
      } else {
        alert(err.message || 'Could not start DM.');
      }
    }
  };

  const getRoleIcon = (u: any) => {
    if (u.is_developer) return <span title="Developer"><Terminal size={13} color="#a855f7" /></span>;
    if (u.is_admin)     return <span title="Admin"><Shield size={13} color="#ff3333" /></span>;
    if (u.is_moderator) return <span title="Moderator"><Star size={13} color="#3399ff" /></span>;
    if (u.is_vip)       return <span title="VIP"><Crown size={13} color="#faa61a" /></span>;
    return null;
  };

  const FriendActions = ({ u }: { u: any }) => {
    if (u.id === currentUser?.id) return null;
    const status = statuses[u.id] ?? 'none';
    const busy = actionLoading[u.id] ?? false;
    const fb = feedback[u.id];

    if (fb) return <span style={{ color: 'var(--accent)', fontSize: '12px', fontWeight: 600 }}>{fb}</span>;

    if (status === 'accepted') return (
      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={() => handleMessage(u.id)} className="btn-accent" style={{ padding: '7px 14px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '5px' }}>
          <MessageSquare size={14} /> Message
        </button>
        <button onClick={() => handleRemove(u.id)} disabled={busy} style={outlineBtn} title="Remove friend">
          <UserX size={14} />
        </button>
      </div>
    );

    if (status === 'pending_outgoing') return (
      <button disabled style={{ ...outlineBtn, opacity: 0.6, display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 14px', cursor: 'default' }}>
        <Clock size={14} /> Pending
      </button>
    );

    if (status === 'pending_incoming') return (
      <div style={{ display: 'flex', gap: '6px' }}>
        <button onClick={() => handleAccept(u.id)} disabled={busy} className="btn-accent" style={{ padding: '7px 12px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <UserCheck size={14} /> Accept
        </button>
        <button onClick={() => handleDecline(u.id)} disabled={busy} style={{ ...outlineBtn, padding: '7px 12px' }}>
          <UserX size={14} />
        </button>
      </div>
    );

    if (status === 'blocked') return (
      <button disabled style={{ ...outlineBtn, opacity: 0.5, display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 12px', cursor: 'default' }}>
        <Ban size={14} /> Blocked
      </button>
    );

    // none
    return (
      <button onClick={() => handleSendRequest(u.id)} disabled={busy} style={{ ...outlineBtn, display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 14px' }}>
        {busy ? <Loader size={14} className="spin" /> : <UserPlus size={14} />}
        {busy ? '' : 'Add Friend'}
      </button>
    );
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--blynx-900)' }}>
      <div style={{ padding: '24px', borderBottom: '1px solid var(--border)', background: 'var(--blynx-850)' }}>
        <h2 style={{ margin: '0 0 16px', fontSize: '22px', color: 'white', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <SearchIcon size={22} color="var(--accent)" /> Find Users
        </h2>
        <div style={{ position: 'relative', maxWidth: '560px' }}>
          <SearchIcon size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by username or display name..."
            style={{
              width: '100%', padding: '13px 16px 13px 44px',
              background: 'var(--blynx-800)', border: '1px solid var(--border)',
              borderRadius: '12px', color: 'white', fontSize: '15px', outline: 'none',
              boxSizing: 'border-box', transition: 'border-color 0.2s',
            }}
            onFocus={e => e.target.style.borderColor = 'var(--accent)'}
            onBlur={e => e.target.style.borderColor = 'var(--border)'}
          />
        </div>
      </div>

      <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
        <div style={{ maxWidth: '560px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><Loader className="spin" color="var(--accent)" /></div>
          ) : query.trim().length < 2 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>Type at least 2 characters to search...</div>
          ) : results.length === 0 && searched ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>No users found matching "{query}"</div>
          ) : (
            results.map(u => (
              <div key={u.id} style={{
                display: 'flex', alignItems: 'center', padding: '14px 16px',
                background: 'var(--blynx-800)', border: '1px solid var(--border)', borderRadius: '12px',
                transition: 'background 0.15s, border-color 0.15s', gap: '14px',
              }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--blynx-750)'; e.currentTarget.style.borderColor = 'var(--border-bright)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--blynx-800)'; e.currentTarget.style.borderColor = 'var(--border)'; }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent), #7289da)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, flexShrink: 0, overflow: 'hidden' }}>
                  {u.avatar_url
                    ? <img src={u.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                    : (u.display_name || u.username).charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                    <span style={{ color: 'white', fontSize: '15px', fontWeight: 600 }}>{u.display_name || u.username}</span>
                    {getRoleIcon(u)}
                    {u.id === currentUser?.id && <span style={{ fontSize: '11px', color: 'var(--accent)', background: 'rgba(88,101,242,0.15)', padding: '1px 6px', borderRadius: '8px' }}>You</span>}
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>@{u.username}</div>
                </div>
                <FriendActions u={u} />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

const outlineBtn: React.CSSProperties = {
  background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)',
  padding: '7px 10px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px',
  display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'inherit',
  transition: 'border-color 0.15s, color 0.15s',
};

import React from 'react';

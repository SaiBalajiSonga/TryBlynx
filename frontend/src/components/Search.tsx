import { useState, useEffect } from 'react';
import { Search as SearchIcon, Loader, MessageSquare, Crown, Shield, Star, Terminal } from 'lucide-react';
import { api } from '../lib/api';

export function Search() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (query.trim().length >= 2) {
        setLoading(true);
        api.searchUsers(query)
          .then(res => {
            setResults(res.users || []);
            setSearched(true);
          })
          .catch(err => console.error("Search failed:", err))
          .finally(() => setLoading(false));
      } else {
        setResults([]);
        setSearched(false);
      }
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [query]);

  const handleMessageUser = async (userId: string) => {
    // In a real app, this would get or create a DM conversation with this user
    // For now we'll just show an alert since we don't have getOrCreateDM on frontend
    alert(`Messaging user ${userId} not fully wired!`);
  };

  const getRoleIcon = (user: any) => {
    if (user.is_developer) return <span title="Developer"><Terminal size={14} color="#00ff00" /></span>;
    if (user.is_admin) return <span title="Admin"><Shield size={14} color="#ff3333" /></span>;
    if (user.is_moderator) return <span title="Moderator"><Star size={14} color="#3399ff" /></span>;
    if (user.is_vip) return <span title="VIP"><Crown size={14} color="#faa61a" /></span>;
    return null;
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--blynx-900)' }}>
      <div style={{ padding: '24px', borderBottom: '1px solid var(--border)', background: 'var(--blynx-850)' }}>
        <h2 style={{ margin: '0 0 16px', fontSize: '24px', color: 'white', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <SearchIcon size={24} color="var(--accent)" /> Search Users
        </h2>
        <div style={{ position: 'relative', maxWidth: '600px' }}>
          <SearchIcon size={20} color="var(--text-muted)" style={{ position: 'absolute', left: '16px', top: '14px' }} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by username or display name..."
            style={{
              width: '100%', padding: '14px 16px 14px 48px',
              background: 'var(--blynx-800)', border: '1px solid var(--border)',
              borderRadius: '12px', color: 'white', fontSize: '16px', outline: 'none',
              boxSizing: 'border-box'
            }}
          />
        </div>
      </div>

      <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><Loader className="spin" color="var(--accent)" /></div>
          ) : query.trim().length < 2 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>
              Type at least 2 characters to search...
            </div>
          ) : results.length === 0 && searched ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>
              No users found matching "{query}"
            </div>
          ) : (
            results.map(u => (
              <div key={u.id} style={{
                display: 'flex', alignItems: 'center', padding: '16px',
                background: 'var(--blynx-800)', border: '1px solid var(--border)', borderRadius: '12px',
                transition: 'background 0.2s'
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--blynx-750)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--blynx-800)'}>
                <div style={{
                  width: '48px', height: '48px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent), #7289da)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600,
                  marginRight: '16px', flexShrink: 0
                }}>
                  {(u.display_name || u.username).charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                    <span style={{ color: 'white', fontSize: '16px', fontWeight: 600 }}>{u.display_name || u.username}</span>
                    {getRoleIcon(u)}
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>@{u.username}</div>
                </div>
                <button
                  onClick={() => handleMessageUser(u.id)}
                  className="btn-accent"
                  style={{ padding: '8px 16px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <MessageSquare size={16} /> Message
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

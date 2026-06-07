import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useAuthStore, type UserProfile } from '../store/authStore';
import { MapPin, Sparkles, Loader2, Globe, Plus, X, Send } from 'lucide-react';

interface FeedPost {
  id: string;
  author_id: string;
  body: string;
  created_at: string;
  author?: UserProfile;
}

export function Feed() {
  const user = useAuthStore((s) => s.user);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [composing, setComposing] = useState(false);
  const [newPost, setNewPost] = useState('');
  const [posting, setPosting] = useState(false);

  useEffect(() => { loadFeed(); }, []);

  const loadFeed = async () => {
    try {
      setIsLoading(true);
      setError('');
      const data = await api.getFeed();
      setPosts(data.posts || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load feed');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePost = async () => {
    if (!newPost.trim()) return;
    setPosting(true);
    try {
      await api.createPost(newPost.trim());
      setNewPost('');
      setComposing(false);
      await loadFeed();
    } catch (err: any) {
      setError(err.message || 'Failed to post');
    } finally {
      setPosting(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--blynx-900)' }}>
        <div style={{ textAlign: 'center' }}>
          <Loader2 size={32} color="var(--accent)" className="animate-spin-slow" style={{ marginBottom: '12px' }} />
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: 0 }}>Loading feed…</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--blynx-900)' }}>
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0,
        background: 'rgba(13,14,18,0.85)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border)',
        padding: '16px 24px',
        zIndex: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Globe size={18} color="var(--accent)" />
          <span style={{ fontWeight: 700, fontSize: '16px', color: 'white' }}>Discovery Feed</span>
        </div>
        <button
          onClick={() => setComposing(!composing)}
          style={{
            padding: '7px 14px',
            borderRadius: '8px',
            border: 'none', cursor: 'pointer',
            background: composing ? 'var(--blynx-600)' : 'var(--accent)',
            color: 'white',
            fontSize: '13px', fontWeight: 600,
            fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: '6px',
            transition: 'background 0.12s',
          }}
        >
          {composing ? <X size={14} /> : <Plus size={14} />}
          {composing ? 'Cancel' : 'Post'}
        </button>
      </div>

      <div style={{ maxWidth: '680px', margin: '0 auto', padding: '20px 24px' }}>
        {/* Compose box */}
        {composing && (
          <div style={{
            background: 'var(--blynx-800)',
            border: '1px solid var(--border)',
            borderRadius: '14px',
            padding: '16px',
            marginBottom: '20px',
            animation: 'fade-in 0.2s ease',
          }}>
            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{
                width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
                background: 'linear-gradient(135deg, var(--accent), #7289da)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, color: 'white', fontSize: '14px',
              }}>
                {(user?.display_name || user?.username || 'U').charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <textarea
                  value={newPost}
                  onChange={(e) => setNewPost(e.target.value)}
                  placeholder="Share something with the community…"
                  maxLength={2000}
                  rows={3}
                  style={{
                    width: '100%', background: 'transparent',
                    border: 'none', outline: 'none',
                    color: 'var(--text-primary)', fontSize: '14px',
                    fontFamily: 'inherit', resize: 'none', lineHeight: 1.5,
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {newPost.length}/2000
                  </span>
                  <button
                    onClick={handlePost}
                    disabled={!newPost.trim() || posting}
                    className="btn-accent"
                    style={{ padding: '7px 16px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    {posting ? <Loader2 size={14} className="animate-spin-slow" /> : <Send size={14} />}
                    Post
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div style={{
            background: 'rgba(237,66,69,0.08)',
            border: '1px solid rgba(237,66,69,0.25)',
            color: '#ed4245', padding: '12px 16px', borderRadius: '10px',
            marginBottom: '16px', fontSize: '14px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            {error}
            <button onClick={loadFeed} style={{ background: 'none', border: 'none', color: '#ed4245', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}>
              Retry
            </button>
          </div>
        )}

        {posts.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '64px 32px',
            background: 'var(--blynx-800)',
            border: '1px solid var(--border)',
            borderRadius: '16px',
          }}>
            <Sparkles size={40} color="var(--accent)" style={{ marginBottom: '16px', opacity: 0.5 }} />
            <h3 style={{ margin: '0 0 8px', fontSize: '17px', fontWeight: 600, color: 'white' }}>
              Nothing here yet
            </h3>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '14px' }}>
              Be the first to share something!
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {posts.map((post, i) => (
              <PostCard key={post.id} post={post} delay={i * 40} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PostCard({ post, delay }: { post: FeedPost; delay: number }) {
  const author = post.author;
  const isVip = author?.is_vip;
  const initials = (author?.display_name || author?.username || 'U').charAt(0).toUpperCase();
  const displayName = author?.display_name || author?.username || 'Unknown';

  const timeAgo = (dateStr: string) => {
    const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  return (
    <div
      style={{
        background: 'var(--blynx-800)',
        border: `1px solid ${isVip ? 'rgba(250,166,26,0.3)' : 'var(--border)'}`,
        borderRadius: '14px',
        padding: '16px',
        animation: `fade-in 0.25s ease ${delay}ms both`,
        transition: 'border-color 0.15s, transform 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.borderColor = isVip ? 'rgba(250,166,26,0.5)' : 'var(--border-bright)';
        (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
        (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 20px rgba(0,0,0,0.2)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.borderColor = isVip ? 'rgba(250,166,26,0.3)' : 'var(--border)';
        (e.currentTarget as HTMLElement).style.transform = '';
        (e.currentTarget as HTMLElement).style.boxShadow = '';
      }}
    >
      <div style={{ display: 'flex', gap: '12px' }}>
        <div style={{
          width: '40px', height: '40px', borderRadius: '50%', flexShrink: 0,
          background: isVip
            ? 'linear-gradient(135deg, #faa61a, #ff6b35)'
            : 'linear-gradient(135deg, var(--accent), #7289da)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, color: 'white', fontSize: '16px',
          overflow: 'hidden',
        }}>
          {author?.avatar_url
            ? <img src={author.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : initials}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, fontSize: '14px', color: 'white' }}>{displayName}</span>
            {isVip && (
              <span style={{
                fontSize: '10px', fontWeight: 700,
                background: 'rgba(250,166,26,0.15)',
                color: '#faa61a',
                border: '1px solid rgba(250,166,26,0.3)',
                padding: '1px 6px', borderRadius: '4px',
                textTransform: 'uppercase', letterSpacing: '0.5px',
              }}>
                VIP
              </span>
            )}
            {author?.location && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '12px', color: 'var(--text-muted)' }}>
                <MapPin size={11} />
                {author.location}
              </span>
            )}
            <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'Space Mono, monospace' }}>
              {timeAgo(post.created_at)}
            </span>
          </div>

          <p style={{ margin: '0 0 10px', color: 'var(--text-primary)', fontSize: '14px', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {post.body}
          </p>

          {author?.interests && author.interests.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {author.interests.slice(0, 5).map((interest, i) => (
                <span key={i} style={{
                  padding: '2px 8px',
                  background: 'var(--blynx-600)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-secondary)',
                  fontSize: '12px',
                  borderRadius: '6px',
                }}>
                  {interest}
                </span>
              ))}
              {author.interests.length > 5 && (
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '2px 4px' }}>
                  +{author.interests.length - 5}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

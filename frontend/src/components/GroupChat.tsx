import { useState, useEffect, useRef, useCallback } from 'react';
import { Users, Hash, Loader, Send, Crown, Shield, Star, Terminal } from 'lucide-react';
import { api } from '../lib/api';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { useWebSocket } from '../lib/useWebSocket';

export function GroupChat() {
  const navigate = useNavigate();
  const { id } = useParams();
  const user = useAuthStore(s => s.user);
  const { sendMessage } = useWebSocket();

  const [groups, setGroups] = useState<any[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [members, setMembers] = useState<any[]>([]);
  const [showMembers, setShowMembers] = useState(true);
  const [newMessage, setNewMessage] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  // Track which rooms we've joined so we don't double-join
  const joinedRooms = useRef<Set<string>>(new Set());

  // FIX: Read messages directly from chatStore (populated by WS handler)
  // instead of maintaining a separate local state that drifts out of sync
  const wsMessages = useChatStore(s => s.messages[id || ''] || []);

  // Fetch groups list once
  useEffect(() => {
    api.getGroups()
      .then(res => {
        const gs = res.groups || [];
        setGroups(gs);
        if (!id && gs.length > 0) {
          const def = gs.find((g: any) => g.name === 'General') || gs[0];
          navigate(`/groups/${def.id}`, { replace: true });
        }
      })
      .catch(err => console.error('Failed to load groups:', err))
      .finally(() => setLoadingGroups(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When active group changes: join WS room + load REST history + load members
  useEffect(() => {
    if (!id) return;

    // Join room via WS (idempotent on backend, but skip if already joined this session)
    if (!joinedRooms.current.has(id)) {
      sendMessage('chat.join', { room_id: id });
      joinedRooms.current.add(id);
    }

    // Load REST message history into the store only once per room
    // FIX: Load into chatStore via addMessage so WS + REST messages merge correctly
    api.getMessages(id)
      .then(res => {
        const msgs: any[] = res.messages || [];
        // Only seed if store is empty for this room (avoid duplicating on re-visit)
        const current = useChatStore.getState().messages[id] || [];
        if (current.length === 0) {
          msgs.forEach(m => {
            // Normalise REST shape → ChatMessage shape
            useChatStore.getState().addMessage(id, {
              message_id: m.id || m.message_id,
              sender_id:  m.sender_id,
              sender_name: m.sender_name || m.username || 'User',
              room_id:    id,
              body:       m.body || m.content,
              created_at: m.created_at,
            });
          });
        }
      })
      .catch(err => console.error('Failed to load messages:', err));

    // Load members via REST, then poll every 10 s for live updates
    // FIX: 10-second polling so members list stays fresh without page refresh
    const fetchMembers = () => {
      api.getGroupMembers(id)
        .then(res => setMembers(res.members || []))
        .catch(err => console.error('Failed to load members:', err));
    };
    fetchMembers();
    const memberPoll = setInterval(fetchMembers, 10_000);
    return () => clearInterval(memberPoll);
  }, [id, sendMessage]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [wsMessages.length]);

  const handleSend = useCallback(() => {
    if (!newMessage.trim() || !id) return;
    sendMessage('chat.message', { room_id: id, body: newMessage.trim() });
    setNewMessage('');
  }, [newMessage, id, sendMessage]);

  const activeGroup = groups.find(g => g.id === id);

  const getRoleIcon = (member: any) => {
    if (member.is_developer) return <Terminal size={11} color="#00ff00" />;
    if (member.is_admin)     return <Shield size={11} color="#ff3333" />;
    if (member.is_moderator) return <Star size={11} color="#3399ff" />;
    if (member.is_vip)       return <Crown size={11} color="#faa61a" />;
    return null;
  };

  return (
    <div style={{ flex: 1, display: 'flex', background: 'var(--blynx-900)', overflow: 'hidden', height: '100%' }}>

      {/* ── LEFT: Group List ── */}
      <div style={{ width: '220px', borderRight: '1px solid var(--border)', background: 'var(--blynx-850)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Channels</h2>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 6px' }}>
          {loadingGroups
            ? <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}><Loader size={18} color="var(--accent)" /></div>
            : groups.map(g => {
              const isActive = g.id === id;
              return (
                <button key={g.id} onClick={() => navigate(`/groups/${g.id}`)} style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '8px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                  background: isActive ? 'var(--blynx-750)' : 'transparent',
                  color: isActive ? 'white' : 'var(--text-secondary)',
                  fontFamily: 'inherit', fontSize: '14px', fontWeight: isActive ? 600 : 400,
                  transition: 'all 0.1s', textAlign: 'left',
                }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--blynx-800)'; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                >
                  <Hash size={16} style={{ flexShrink: 0, opacity: 0.7 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</span>
                </button>
              );
            })
          }
        </div>
      </div>

      {/* ── CENTER: Chat ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {id && activeGroup ? (
          <>
            {/* Header */}
            <div style={{ height: '52px', padding: '0 16px', borderBottom: '1px solid var(--border)', background: 'var(--blynx-850)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Hash size={20} color="var(--text-muted)" />
                <span style={{ color: 'white', fontSize: '15px', fontWeight: 600 }}>{activeGroup.name}</span>
              </div>
              <button onClick={() => setShowMembers(s => !s)} style={{
                background: showMembers ? 'var(--blynx-750)' : 'transparent', border: 'none', cursor: 'pointer',
                color: showMembers ? 'white' : 'var(--text-secondary)', padding: '6px', borderRadius: '6px',
                display: 'flex', transition: 'background 0.1s',
              }}>
                <Users size={18} />
              </button>
            </div>

            {/* Messages — FIX: column (not column-reverse) with scroll to bottom */}
            <div style={{ flex: 1, padding: '12px 16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {wsMessages.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', margin: 'auto' }}>
                  <Hash size={32} style={{ marginBottom: '8px', opacity: 0.3 }} />
                  <p style={{ fontSize: '14px' }}>Start the conversation in #{activeGroup.name}</p>
                </div>
              ) : (
                wsMessages.map((msg, i) => {
                  const isMe = msg.sender_id === user?.id;
                  const prev = wsMessages[i - 1];
                  const isFirst = !prev || prev.sender_id !== msg.sender_id;
                  return (
                    <div key={msg.message_id} style={{ display: 'flex', gap: '12px', flexDirection: isMe ? 'row-reverse' : 'row' }}>
                      <div style={{ width: '36px', flexShrink: 0 }}>
                        {isFirst && (
                          <div style={{
                            width: '36px', height: '36px', borderRadius: '50%',
                            background: isMe ? 'linear-gradient(135deg, var(--accent), #7289da)' : 'var(--blynx-700)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: 'white', fontWeight: 700, fontSize: '14px',
                          }}>
                            {(msg.sender_name || 'U').charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', maxWidth: '72%' }}>
                        {isFirst && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                            <span style={{ color: isMe ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: 600, fontSize: '12px' }}>
                              {isMe ? (user?.display_name || user?.username || 'You') : msg.sender_name}
                            </span>
                            <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
                              {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        )}
                        <div style={{
                          background: isMe ? 'var(--accent)' : 'var(--blynx-800)',
                          color: 'white', padding: '9px 13px',
                          borderRadius: isMe ? '14px 14px 3px 14px' : '14px 14px 14px 3px',
                          fontSize: '14px', lineHeight: 1.45, wordBreak: 'break-word',
                          border: isMe ? 'none' : '1px solid var(--border)',
                        }}>
                          {msg.body}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={endRef} />
            </div>

            {/* Input */}
            <div style={{ padding: '0 16px 16px', flexShrink: 0 }}>
              <div style={{ display: 'flex', gap: '10px', background: 'var(--blynx-800)', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                <input
                  type="text" value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                  placeholder={`Message #${activeGroup.name}`}
                  style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'white', fontSize: '14px', fontFamily: 'inherit' }}
                />
                <button onClick={handleSend} disabled={!newMessage.trim()} className="btn-accent" style={{ padding: '6px 14px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                  <Send size={15} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            {loadingGroups ? <Loader size={20} color="var(--accent)" /> : 'Select a channel'}
          </div>
        )}
      </div>

      {/* ── RIGHT: Members ── */}
      {showMembers && id && (
        <div style={{ width: '220px', background: 'var(--blynx-850)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Members — {members.length}
            </h3>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
            {members.length === 0
              ? <p style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>No members</p>
              : members.map(m => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '7px 8px', borderRadius: '6px', cursor: 'pointer', transition: 'background 0.1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--blynx-800)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'var(--blynx-700)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600, fontSize: '12px', flexShrink: 0 }}>
                    {(m.display_name || m.username || 'U').charAt(0).toUpperCase()}
                  </div>
                  <span style={{ color: m.is_vip ? '#faa61a' : 'var(--text-secondary)', fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    {m.display_name || m.username}
                  </span>
                  {getRoleIcon(m)}
                </div>
              ))
            }
          </div>
        </div>
      )}
    </div>
  );
}

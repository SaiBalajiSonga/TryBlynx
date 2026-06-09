import { useState, useEffect, useRef, useCallback } from 'react';
import { Users, Hash, Loader, Send, Crown, Shield, Star, Terminal, Reply, X } from 'lucide-react';
import { api } from '../lib/api';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { useWebSocket } from '../lib/useWebSocket';

// Stable empty array — never recreated, prevents Zustand getSnapshot infinite loop
const EMPTY_MESSAGES: import('../store/chatStore').ChatMessage[] = [];

const parseMessageBody = (rawBody: string) => {
    if (rawBody.startsWith('$$REPLY$$')) {
        const parts = rawBody.split('$$');
        if (parts.length >= 4) {
            try {
                const replyContext = JSON.parse(parts[2]);
                const actualBody = parts.slice(3).join('$$');
                return { isReply: true, replyContext, actualBody };
            } catch (e) {}
        }
    }
    return { isReply: false, replyContext: null, actualBody: rawBody };
};

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
  const [replyTo, setReplyTo] = useState<import('../store/chatStore').ChatMessage | null>(null);
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Track which rooms we've joined so we don't double-join
  const joinedRooms = useRef<Set<string>>(new Set());

  // FIX: Read messages directly from chatStore (populated by WS handler)
  // instead of maintaining a separate local state that drifts out of sync
  // FIX: Must return stable reference. Inline `|| []` creates new array every
  // render → Zustand sees changed snapshot → re-renders → infinite loop.
  const wsMessages = useChatStore(s => s.messages[id ?? ''] ?? EMPTY_MESSAGES);
  const wsStatus = useChatStore(s => s.wsStatus);

  // Fetch groups list and poll for member count updates
  useEffect(() => {
    const fetchGroups = () => {
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
    };

    fetchGroups();
    const groupPoll = setInterval(fetchGroups, 3_000);
    return () => clearInterval(groupPoll);
  }, [id, navigate]);

  // When active group changes or WS reconnects: join WS room + load REST history + load members
  useEffect(() => {
    if (!id || wsStatus !== 'connected') {
      if (id && joinedRooms.current.has(id)) {
        joinedRooms.current.delete(id);
      }
      return;
    }

    // Clear old members immediately so the UI doesn't look stuck on previous group
    setMembers([]);

    // Join room via WS (idempotent on backend, but skip if already joined this session)
    if (!joinedRooms.current.has(id)) {
      sendMessage('chat.join', { room_id: id });
      joinedRooms.current.add(id);
    }

    // Leave room when navigating away
    return () => {
      sendMessage('chat.leave', { room_id: id });
      joinedRooms.current.delete(id);
    };
  }, [id, sendMessage, wsStatus]);

  // Load REST history and members when group changes
  useEffect(() => {
    if (!id) return;

    const fetchMembers = () => {
      api.getGroupMembers(id)
        .then(res => {
          const mems = res.members || [];
          setMembers(mems);
          // Instantly sync the sidebar count for the active group
          setGroups(prev => prev.map(g => g.id === id ? { ...g, member_count: mems.length } : g));
        })
        .catch(err => console.error('Failed to load members:', err));
    };

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
      .catch(err => console.error('Failed to load messages:', err))
      .finally(() => {
        // Fetch members AFTER getMessages so the backend AutoJoinPublicGroup has definitely finished
        fetchMembers();
      });

    // Polling so members list stays fresh without page refresh
    const memberPoll = setInterval(fetchMembers, 3_000);
    return () => clearInterval(memberPoll);
  }, [id, sendMessage]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [wsMessages.length]);

  const handleSend = useCallback(() => {
    if (!newMessage.trim() || !id) return;
    
    let finalMessage = newMessage.trim();
    if (replyTo) {
        const { actualBody } = parseMessageBody(replyTo.body);
        const replyContext = {
            id: replyTo.message_id,
            name: replyTo.sender_name,
            text: actualBody.substring(0, 60) + (actualBody.length > 60 ? '...' : '')
        };
        finalMessage = `$$REPLY$$${JSON.stringify(replyContext)}$$${finalMessage}`;
    }

    sendMessage('chat.message', { room_id: id, body: finalMessage });
    setNewMessage('');
    setReplyTo(null);
  }, [newMessage, id, sendMessage, replyTo]);

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
        <div style={{ padding: '20px 16px 12px 16px' }}>
          <h2 style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Channels</h2>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px' }}>
          {loadingGroups
            ? <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}><Loader size={18} color="var(--accent)" /></div>
            : groups.map(g => {
              const isActive = g.id === id;
              return (
                <button key={g.id} onClick={() => navigate(`/groups/${g.id}`)} style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '8px 10px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                  background: isActive ? 'var(--blynx-750)' : 'transparent',
                  color: isActive ? 'white' : 'var(--text-secondary)',
                  fontFamily: 'inherit', fontSize: '14px', fontWeight: isActive ? 500 : 400,
                  transition: 'all 0.1s', textAlign: 'left', marginBottom: '2px'
                }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--blynx-800)'; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{
                    width: '28px', height: '28px', borderRadius: '50%',
                    background: isActive ? 'var(--accent)' : 'var(--blynx-700)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', fontWeight: 600, fontSize: '12px', flexShrink: 0
                  }}>
                    {g.name.charAt(0).toUpperCase()}
                  </div>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{g.name}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)', fontSize: '11px' }}>
                    <Users size={12} />
                    <span>{g.member_count || 0}</span>
                  </div>
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
            <div style={{ height: '60px', padding: '0 20px', borderBottom: '1px solid rgba(255, 255, 255, 0.04)', background: 'var(--blynx-850)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '28px', height: '28px', borderRadius: '50%',
                  background: 'var(--accent)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', fontWeight: 600, fontSize: '13px', flexShrink: 0
                }}>
                  {activeGroup.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: '15px', color: 'white', fontWeight: 600 }}>{activeGroup.name}</h2>
                  <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{members.length} members</div>
                </div>
              </div>
              <button onClick={() => setShowMembers(s => !s)} style={{
                background: showMembers ? 'var(--blynx-750)' : 'transparent', border: 'none', cursor: 'pointer',
                color: showMembers ? 'white' : 'var(--text-secondary)', padding: '8px', borderRadius: '50%',
                display: 'flex', transition: 'background 0.1s',
              }}>
                <Users size={20} />
              </button>
            </div>

            {/* ── Messages — Instagram DM style ── */}
            <div style={{ flex: 1, padding: '12px 8px 12px 16px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
              {wsMessages.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', margin: 'auto' }}>
                  <Hash size={32} style={{ marginBottom: '8px', opacity: 0.3 }} />
                  <p style={{ fontSize: '14px' }}>Start the conversation in #{activeGroup.name}</p>
                </div>
              ) : (
                wsMessages.map((msg, i) => {
                  const { isReply, replyContext, actualBody } = parseMessageBody(msg.body);
                  const isMe = msg.sender_id === user?.id;
                  const prev = wsMessages[i - 1];
                  const next = wsMessages[i + 1];
                  // Group boundary detection
                  const isGroupStart = !prev || prev.sender_id !== msg.sender_id;
                  const isGroupEnd   = !next || next.sender_id !== msg.sender_id;
                  const isSolo       = isGroupStart && isGroupEnd;
                  // Instagram bubble radius rules:
                  // Solo:       full round (18px all)
                  // Group start (top):   top corners round, bottom-inner square
                  // Group middle:        inner side square top & bottom
                  // Group end (bottom):  top-inner square, bottom corners round
                  const r = '18px';
                  const s = '4px'; // squared corner
                  let borderRadius: string;
                  if (isMe) {
                    // My bubbles: stack on the RIGHT, so right corners flatten
                    if (isSolo)             borderRadius = `${r} ${r} ${r} ${r}`;
                    else if (isGroupStart)  borderRadius = `${r} ${r} ${s} ${r}`; // TR(r), BR(s)
                    else if (isGroupEnd)    borderRadius = `${r} ${s} ${r} ${r}`; // TR(s), BR(r)
                    else                    borderRadius = `${r} ${s} ${s} ${r}`; // TR(s), BR(s)
                  } else {
                    // Their bubbles: stack on the LEFT, so left corners flatten
                    if (isSolo)             borderRadius = `${r} ${r} ${r} ${r}`;
                    else if (isGroupStart)  borderRadius = `${r} ${r} ${r} ${s}`; // TL(r), BL(s)
                    else if (isGroupEnd)    borderRadius = `${s} ${r} ${r} ${r}`; // TL(s), BL(r)
                    else                    borderRadius = `${s} ${r} ${r} ${s}`; // TL(s), BL(s)
                  }
                  // Vertical spacing: new group gets more breathing room
                  const marginTop = isGroupStart ? '20px' : '2px';
                  return (
                    <div
                      key={msg.message_id}
                      style={{
                        display: 'flex',
                        flexDirection: 'row',
                        alignItems: 'flex-end', // avatar aligns to bottom of group
                        gap: '8px',
                        marginTop,
                        // Right-align my messages
                        justifyContent: isMe ? 'flex-end' : 'flex-start',
                      }}
                    >
                      {/* Avatar column — only for others, only shown on last bubble of group */}
                      {!isMe && (
                        <div style={{ width: '28px', flexShrink: 0, alignSelf: 'flex-end', marginBottom: '4px' }}>
                          {isGroupEnd ? (
                            <div style={{
                              width: '28px', height: '28px', borderRadius: '50%',
                              background: 'var(--blynx-600)',
                              border: '1px solid rgba(255,255,255,0.05)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: 'white', fontWeight: 600, fontSize: '11px',
                              flexShrink: 0,
                            }}>
                              {(msg.sender_name || 'U').charAt(0).toUpperCase()}
                            </div>
                          ) : (
                            // Invisible spacer — keeps bubbles left-aligned even without avatar
                            <div style={{ width: '28px' }} />
                          )}
                        </div>
                      )}

                      {/* Bubble + optional name header */}
                      <div 
                        style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', maxWidth: '72%', position: 'relative' }}
                        onMouseEnter={() => setHoveredMsgId(msg.message_id)}
                        onMouseLeave={() => setHoveredMsgId(null)}
                      >
                        {/* Sender name — only on group start for others, never for me */}
                        {!isMe && isGroupStart && (
                          <span style={{
                            fontSize: '12px', fontWeight: 500,
                            color: 'var(--text-muted)',
                            marginBottom: '4px', marginLeft: '38px',
                          }}>
                            {msg.sender_name}
                          </span>
                        )}

                        <div style={{ display: 'flex', alignItems: 'center', flexDirection: isMe ? 'row-reverse' : 'row', gap: '10px' }}>
                          {/* The bubble container */}
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                            {/* Reply Context */}
                            {isReply && replyContext && (
                              <div style={{
                                fontSize: '12px', color: 'var(--text-muted)', 
                                background: 'rgba(0,0,0,0.2)', padding: '6px 12px',
                                borderRadius: '12px', marginBottom: '4px',
                                borderLeft: '2px solid var(--accent)',
                                maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                opacity: 0.8
                              }}>
                                <strong style={{ color: 'var(--text-secondary)' }}>{replyContext.name}</strong>
                                <br/>
                                {replyContext.text}
                              </div>
                            )}
                            {/* The bubble */}
                            <div style={{
                              padding: '8px 14px',
                              borderRadius,
                              background: isMe
                                ? 'linear-gradient(135deg, var(--accent) 0%, #7289da 100%)'
                                : 'var(--blynx-750)',
                              color: 'white',
                              fontSize: '15px', lineHeight: 1.4,
                              wordBreak: 'break-word',
                              border: isMe ? 'none' : '1px solid var(--border)',
                              boxShadow: isMe ? '0 2px 8px rgba(88,101,242,0.25)' : 'none',
                              position: 'relative',
                            }}>
                              {actualBody}
                            </div>
                          </div>

                          {/* Reply Button (Hover) */}
                          {hoveredMsgId === msg.message_id && (
                            <button
                              onClick={() => setReplyTo(msg)}
                              style={{
                                background: 'var(--blynx-800)', border: '1px solid var(--border)',
                                borderRadius: '50%', width: '28px', height: '28px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer', color: 'var(--text-secondary)',
                                transition: 'all 0.1s', padding: 0
                              }}
                              title="Reply"
                            >
                              <Reply size={14} />
                            </button>
                          )}
                        </div>

                        {/* Timestamp — only at group end, small and muted */}
                        {isGroupEnd && (
                          <span style={{
                            fontSize: '11px', color: 'var(--text-muted)', opacity: 0.8,
                            marginTop: '4px',
                            marginLeft: isMe ? '0' : '38px',
                            marginRight: isMe ? '8px' : '0',
                          }}>
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={endRef} />
            </div>

            {/* Input */}
            <div style={{ padding: '0 20px 20px', flexShrink: 0 }}>
              {replyTo && (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: 'var(--blynx-800)', padding: '10px 16px',
                  borderTopLeftRadius: '24px', borderTopRightRadius: '24px',
                  border: '1px solid rgba(255,255,255,0.06)', borderBottom: 'none',
                  fontSize: '12px', color: 'var(--text-secondary)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Reply size={14} color="var(--accent)" />
                    <span>Replying to <strong>{replyTo.sender_name}</strong></span>
                  </div>
                  <button onClick={() => setReplyTo(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, display: 'flex' }}>
                    <X size={14} />
                  </button>
                </div>
              )}
              <div style={{ 
                display: 'flex', gap: '12px', background: 'var(--blynx-800)', 
                padding: '12px 18px', 
                borderRadius: replyTo ? '0 0 24px 24px' : '24px', 
                border: '1px solid rgba(255,255,255,0.06)' 
              }}>
                <input
                  type="text" value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                  placeholder={`Message #${activeGroup.name}`}
                  style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'white', fontSize: '14px', fontFamily: 'inherit', padding: '0 8px' }}
                />
                <button onClick={handleSend} disabled={!newMessage.trim()} className="btn-accent" style={{ padding: '6px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px' }}>
                  <Send size={15} style={{ marginLeft: '-2px' }} />
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
          <div style={{ padding: '20px 16px 12px 16px' }}>
            <h3 style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
              Members — {members.length}
            </h3>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px' }}>
            {members.length === 0
              ? <p style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>No members</p>
              : members.map(m => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '8px', cursor: 'pointer', transition: 'background 0.1s', marginBottom: '2px' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--blynx-800)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--blynx-700)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600, fontSize: '12px', flexShrink: 0 }}>
                    {(m.display_name || m.username || 'U').charAt(0).toUpperCase()}
                  </div>
                  <span style={{ color: m.is_vip ? '#faa61a' : 'var(--text-secondary)', fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
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

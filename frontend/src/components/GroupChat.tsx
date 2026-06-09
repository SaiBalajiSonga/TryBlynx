import { useState, useEffect, useRef, useCallback, Fragment } from 'react';
import { Users, Hash, Loader, Send, Crown, Shield, Star, Terminal, Reply, X, Plus, Settings as SettingsIcon, Pencil, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { useWebSocket } from '../lib/useWebSocket';
import { GroupSettingsModal } from './GroupSettingsModal';
import { MarkdownRenderer } from './MarkdownRenderer';

interface GroupChatProps {
  onUserClick?: (userId: string) => void;
}

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

export function GroupChat({ onUserClick }: GroupChatProps) {
  const navigate = useNavigate();
  const { id } = useParams();
  const user = useAuthStore(s => s.user);
  const { sendMessage } = useWebSocket();

  const [groups, setGroups] = useState<any[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [members, setMembers] = useState<any[]>([]);
  const [showMembers, setShowMembers] = useState(true);
  const [showSettingsModal, setShowSettingsModal] = useState<false | 'create' | 'edit'>(false);
  const [newMessage, setNewMessage] = useState('');
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState<string>('');
  const [replyTo, setReplyTo] = useState<import('../store/chatStore').ChatMessage | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Track which rooms we've joined so we don't double-join
  const joinedRooms = useRef<Set<string>>(new Set());

  // FIX: Read messages directly from chatStore (populated by WS handler)
  // instead of maintaining a separate local state that drifts out of sync
  // FIX: Must return stable reference. Inline `|| []` creates new array every
  // render → Zustand sees changed snapshot → re-renders → infinite loop.
  const wsMessages = useChatStore(s => s.messages[id ?? ''] ?? EMPTY_MESSAGES);
  const wsStatus = useChatStore(s => s.wsStatus);

  const fetchGroups = useCallback(() => {
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
  }, [id, navigate]);

  // Fetch groups list and poll for member count updates
  useEffect(() => {

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
              is_edited:  !!m.is_edited,
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

  const handleSend = () => {
    if (!newMessage.trim() || !id) return;
    const body = replyTo ? `$$REPLY$$$${JSON.stringify({id: replyTo.message_id, name: replyTo.sender_name, text: replyTo.body.substring(0, 30).replace(/"/g, '\\"')})}...$$$$${newMessage}` : newMessage;
    sendMessage('chat.message', { room_id: id, body });
    setNewMessage('');
    setReplyTo(null);
  };

  const handleEditSave = (msgId: string) => {
    if (!editBody.trim() || !id) return;
    sendMessage('chat.edit', { room_id: id, message_id: msgId, body: editBody });
    setEditingMsgId(null);
    setEditBody('');
  };

  const handleDelete = (msgId: string) => {
    if (!id) return;
    if (confirm('Are you sure you want to delete this message?')) {
      sendMessage('chat.delete', { room_id: id, message_id: msgId });
    }
  };

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
        <div style={{ padding: '20px 16px 12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Channels</h2>
          {user?.is_admin && (
            <button onClick={() => setShowSettingsModal('create')} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0' }} title="Create Channel">
              <Plus size={14} />
            </button>
          )}
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
                  <h2 style={{ margin: 0, fontSize: '15px', color: 'white', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {activeGroup.name}
                    {user?.is_admin && (
                      <button onClick={() => setShowSettingsModal('edit')} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: '0' }} title="Edit Channel Settings">
                        <SettingsIcon size={14} />
                      </button>
                    )}
                  </h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '11px', marginTop: '2px' }}>
                    <span>{members.length} members</span>
                    {activeGroup.is_nsfw && <span style={{ background: 'rgba(237,66,69,0.1)', color: '#ed4245', padding: '1px 4px', borderRadius: '4px', fontSize: '9px', fontWeight: 800 }}>NSFW</span>}
                    {activeGroup.slowmode_seconds > 0 && <span style={{ background: 'rgba(88,101,242,0.1)', color: 'var(--accent)', padding: '1px 4px', borderRadius: '4px', fontSize: '9px', fontWeight: 800 }}>SLOWMODE: {activeGroup.slowmode_seconds}s</span>}
                    {activeGroup.description && (
                      <>
                        <span style={{ width: '3px', height: '3px', background: 'var(--text-muted)', borderRadius: '50%' }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>{activeGroup.description}</span>
                      </>
                    )}
                  </div>
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
                  const prev = wsMessages[i - 1];
                  // Group boundary detection
                  const isGroupStart = !prev || prev.sender_id !== msg.sender_id;
                  
                  return (
                    <Fragment key={msg.message_id}>
                      {isGroupStart && i > 0 && (
                        <div style={{ height: '1px', margin: '8px 16px 7px 16px' }} />
                      )}
                      <div
                        onMouseEnter={() => setHoveredMsgId(msg.message_id)}
                        onMouseLeave={() => setHoveredMsgId(null)}
                        style={{
                          display: 'flex',
                          flexDirection: 'row',
                          alignItems: 'flex-start',
                          padding: '2px 16px',
                          marginTop: isGroupStart && i === 0 ? '16px' : '0',
                        background: hoveredMsgId === msg.message_id ? 'rgba(255,255,255,0.03)' : 'transparent',
                        width: '100%',
                        boxSizing: 'border-box',
                        position: 'relative'
                      }}
                    >
                      {/* Avatar column */}
                      <div style={{ width: '56px', flexShrink: 0, marginRight: '16px', display: 'flex', justifyContent: 'center' }}>
                        {isGroupStart ? (
                          <div 
                            onClick={() => onUserClick && msg.sender_id && onUserClick(msg.sender_id)}
                            style={{
                            width: '48px', height: '48px', borderRadius: '50%',
                            background: 'var(--blynx-600)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: 'white', fontWeight: 600, fontSize: '18px',
                            cursor: 'pointer'
                          }}>
                            {(msg.sender_name || 'U').charAt(0).toUpperCase()}
                          </div>
                        ) : (
                          <div style={{ 
                            width: '100%', textAlign: 'center', fontSize: '10px', 
                            color: 'var(--text-muted)', 
                            opacity: hoveredMsgId === msg.message_id ? 1 : 0,
                            lineHeight: '22px', // align with first line of text
                            whiteSpace: 'nowrap'
                          }}>
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                          </div>
                        )}
                      </div>

                      {/* Content column */}
                      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                        {isGroupStart && (
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '2px' }}>
                            <span style={{ fontSize: '15px', fontWeight: 500, color: 'white', cursor: 'pointer' }}
                                  onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                                  onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
                                  onClick={() => onUserClick && msg.sender_id && onUserClick(msg.sender_id)}
                            >
                              {msg.sender_name}
                            </span>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                              {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        )}

                        {isReply && replyContext && (
                          <div style={{
                            fontSize: '13px', color: 'var(--text-muted)', 
                            display: 'flex', alignItems: 'center', gap: '6px',
                            marginBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            cursor: 'pointer'
                          }}
                          onMouseEnter={e => e.currentTarget.style.color = 'white'}
                          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                          >
                            <Reply size={14} />
                            <strong>@{replyContext.name}</strong> {replyContext.text}
                          </div>
                        )}

                        <div style={{ 
                          color: '#dcddde', 
                          fontSize: '15px', 
                          lineHeight: '22px', 
                          wordBreak: 'break-word',
                          whiteSpace: 'pre-wrap'
                        }}>
                          {editingMsgId === msg.message_id ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                              <input
                                autoFocus
                                value={editBody}
                                onChange={e => setEditBody(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter' && !e.shiftKey) handleEditSave(msg.message_id);
                                  if (e.key === 'Escape') { setEditingMsgId(null); setEditBody(''); }
                                }}
                                style={{ background: 'var(--blynx-800)', border: '1px solid var(--border)', borderRadius: '4px', color: 'white', padding: '8px', fontSize: '14px', outline: 'none' }}
                              />
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                escape to <span style={{ color: '#00aff4', cursor: 'pointer' }} onClick={() => setEditingMsgId(null)}>cancel</span> • enter to <span style={{ color: '#00aff4', cursor: 'pointer' }} onClick={() => handleEditSave(msg.message_id)}>save</span>
                              </span>
                            </div>
                          ) : (
                            <>
                              <MarkdownRenderer content={actualBody} />
                              {msg.is_edited && (
                                <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '4px' }}>(edited)</span>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      {/* Floating Actions */}
                      {hoveredMsgId === msg.message_id && (
                        <div style={{
                          position: 'absolute',
                          right: '16px',
                          top: '-12px',
                          background: 'var(--blynx-800)',
                          border: '1px solid var(--border)',
                          borderRadius: '4px',
                          display: 'flex',
                          overflow: 'hidden',
                          boxShadow: '0 0 0 1px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.1)'
                        }}>
                          <button
                            onClick={() => setReplyTo(msg)}
                            style={{
                              background: 'transparent', border: 'none',
                              padding: '4px 8px', cursor: 'pointer', color: 'var(--text-secondary)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'var(--blynx-700)'; e.currentTarget.style.color = 'white'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                            title="Reply"
                          >
                            <Reply size={16} />
                          </button>
                          {msg.sender_id === user?.id && (
                            <>
                              <button
                                onClick={() => { setEditingMsgId(msg.message_id); setEditBody(actualBody); }}
                                style={{
                                  background: 'transparent', border: 'none', borderLeft: '1px solid var(--border)',
                                  padding: '4px 8px', cursor: 'pointer', color: 'var(--text-secondary)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background = 'var(--blynx-700)'; e.currentTarget.style.color = 'white'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                                title="Edit"
                              >
                                <Pencil size={16} />
                              </button>
                              <button
                                onClick={() => handleDelete(msg.message_id)}
                                style={{
                                  background: 'transparent', border: 'none', borderLeft: '1px solid var(--border)',
                                  padding: '4px 8px', cursor: 'pointer', color: '#ed4245',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background = '#ed4245'; e.currentTarget.style.color = 'white'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#ed4245'; }}
                                title="Delete"
                              >
                                <Trash2 size={16} />
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </Fragment>
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
                  borderTopLeftRadius: '8px', borderTopRightRadius: '8px',
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
                borderRadius: replyTo ? '0 0 8px 8px' : '8px', 
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
      {/* Modals */}
      {showSettingsModal && (
        <GroupSettingsModal
          mode={showSettingsModal}
          initialData={showSettingsModal === 'edit' ? activeGroup : undefined}
          onClose={() => setShowSettingsModal(false)}
          onSave={() => {
            setShowSettingsModal(false);
            fetchGroups(); // Reload the groups to fetch the new/updated one
          }}
          onDelete={() => {
            setShowSettingsModal(false);
            fetchGroups();
            navigate('/groups'); // Kick them out of the deleted group
          }}
        />
      )}
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { Users, Hash, Loader, Send, Crown, Shield, Star, Terminal } from 'lucide-react';
import { api } from '../lib/api';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { useWebSocket } from '../lib/useWebSocket';

export function GroupChat() {
  const navigate = useNavigate();
  const { id } = useParams(); // URL param for active group
  const user = useAuthStore(s => s.user);
  const { sendMessage } = useWebSocket();
  
  const [groups, setGroups] = useState<any[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);
  
  const [members, setMembers] = useState<any[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [showMembers, setShowMembers] = useState(true);

  const [messages, setMessages] = useState<any[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch groups list once
  useEffect(() => {
    api.getGroups()
      .then(res => {
        setGroups(res.groups || []);
        // Auto-navigate to General group if none selected
        if (!id && res.groups?.length > 0) {
          const generalGroup = res.groups.find((g: any) => g.name === 'General') || res.groups[0];
          navigate(`/groups/${generalGroup.id}`, { replace: true });
        }
      })
      .catch(err => console.error("Failed to load groups:", err))
      .finally(() => setLoadingGroups(false));
  }, [id, navigate]);

  // Fetch members and messages when active group changes
  useEffect(() => {
    if (!id) return;
    
    setLoadingMembers(true);
    api.getGroupMembers(id)
      .then(res => setMembers(res.members || []))
      .catch(err => console.error("Failed to load members:", err))
      .finally(() => setLoadingMembers(false));

    setLoadingMessages(true);
    api.getMessages(id)
      .then(res => setMessages(res.messages || []))
      .catch(err => console.error("Failed to load messages:", err))
      .finally(() => setLoadingMessages(false));

    // Send chat.join to the websocket to subscribe to real-time events and auto-join the public group
    sendMessage('chat.join', { room_id: id });

  }, [id, sendMessage]);

  // Listen for new websocket messages
  const wsMessagesRaw = useChatStore(s => s.messages[id || '']);
  const wsMessages = wsMessagesRaw || [];
  useEffect(() => {
    if (!id || wsMessages.length === 0) return;
    const latest = wsMessages[wsMessages.length - 1];
    // latest has room_id because it's a ChatMessage
    if (latest.room_id === id || (latest as any).conversation_id === id) {
      setMessages(prev => {
        // Prevent duplicate appending
        if (prev.some(m => m.id === latest.message_id || m.id === (latest as any).id)) return prev;
        return [latest, ...prev];
      });
    }
  }, [wsMessages, id]);

  const activeGroup = groups.find(g => g.id === id);

  const handleSendMessage = () => {
    if (!newMessage.trim() || !id) return;
    
    // Send message via websocket for real-time delivery
    sendMessage('chat.message', { room_id: id, body: newMessage });
    setNewMessage('');
  };

  const getRoleIcon = (member: any) => {
    if (member.is_developer) return <span title="Developer"><Terminal size={12} color="#00ff00" /></span>;
    if (member.is_admin) return <span title="Admin"><Shield size={12} color="#ff3333" /></span>;
    if (member.is_moderator) return <span title="Moderator"><Star size={12} color="#3399ff" /></span>;
    if (member.is_vip) return <span title="VIP"><Crown size={12} color="#faa61a" /></span>;
    return null;
  };

  return (
    <div style={{ flex: 1, display: 'flex', background: 'var(--blynx-900)', overflow: 'hidden' }}>
      
      {/* ── LEFT PANE: Group List ── */}
      <div style={{
        width: '240px', borderRight: '1px solid var(--border)',
        background: 'var(--blynx-850)', display: 'flex', flexDirection: 'column'
      }}>
        <div style={{ padding: '16px', borderBottom: '1px solid var(--border)', boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }}>
          <h2 style={{ margin: 0, fontSize: '16px', color: 'white', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Groups
          </h2>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {loadingGroups ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}><Loader className="spin" size={20} color="var(--accent)" /></div>
          ) : (
            groups.map(g => {
              const isActive = g.id === id;
              return (
                <div
                  key={g.id}
                  onClick={() => navigate(`/groups/${g.id}`)}
                  style={{
                    display: 'flex', alignItems: 'center', padding: '8px 12px',
                    borderRadius: '6px', cursor: 'pointer',
                    background: isActive ? 'var(--blynx-750)' : 'transparent',
                    color: isActive ? 'white' : 'var(--text-secondary)',
                    transition: 'background 0.1s, color 0.1s'
                  }}
                  onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = 'var(--blynx-800)'; e.currentTarget.style.color = 'var(--text-primary)'; } }}
                  onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; } }}
                >
                  <Hash size={18} style={{ marginRight: '8px', opacity: 0.7 }} />
                  <span style={{ fontSize: '15px', fontWeight: isActive ? 600 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {g.name}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── CENTER PANE: Chat Area ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--blynx-900)', position: 'relative' }}>
        {id && activeGroup ? (
          <>
            {/* Header */}
            <div style={{
              height: '56px', padding: '0 16px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'var(--blynx-850)', flexShrink: 0, boxShadow: '0 1px 2px rgba(0,0,0,0.2)', zIndex: 10
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Hash size={24} color="var(--text-muted)" />
                <h3 style={{ margin: 0, color: 'white', fontSize: '16px', fontWeight: 600 }}>{activeGroup.name}</h3>
              </div>
              <button
                onClick={() => setShowMembers(!showMembers)}
                style={{
                  background: showMembers ? 'var(--blynx-750)' : 'transparent', border: 'none', cursor: 'pointer',
                  color: showMembers ? 'white' : 'var(--text-secondary)', padding: '6px', borderRadius: '6px',
                  display: 'flex', alignItems: 'center', transition: 'background 0.1s'
                }}
                onMouseEnter={e => { if (!showMembers) e.currentTarget.style.background = 'var(--blynx-800)'; }}
                onMouseLeave={e => { if (!showMembers) e.currentTarget.style.background = 'transparent'; }}
              >
                <Users size={20} />
              </button>
            </div>

            {/* Messages Feed */}
            <div style={{ flex: 1, padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column-reverse', gap: '16px' }}>
              <div ref={messagesEndRef} />
              {loadingMessages ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}><Loader className="spin" color="var(--accent)" /></div>
              ) : messages.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', margin: 'auto' }}>
                  <h2 style={{ color: 'white', marginBottom: '8px' }}>Welcome to #{activeGroup.name}!</h2>
                  <p>This is the start of the conversation.</p>
                </div>
              ) : (
                messages.map(msg => {
                  const isMe = msg.sender_id === user?.id;
                  return (
                    <div key={msg.id} style={{ display: 'flex', gap: '16px', flexDirection: isMe ? 'row-reverse' : 'row' }}>
                      <div style={{
                        width: '40px', height: '40px', borderRadius: '50%', flexShrink: 0,
                        background: isMe ? 'linear-gradient(135deg, var(--accent), #7289da)' : 'var(--blynx-700)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600
                      }}>
                        {isMe ? (user?.display_name || user?.username || 'U').charAt(0).toUpperCase() : 'U'}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', maxWidth: '70%' }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '4px' }}>
                          <span style={{ color: 'white', fontWeight: 600, fontSize: '14px' }}>
                            {isMe ? (user?.display_name || user?.username) : 'User'}
                          </span>
                          <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div style={{
                          background: isMe ? 'var(--accent)' : 'var(--blynx-800)',
                          color: isMe ? 'white' : 'var(--text-primary)',
                          padding: '10px 14px', borderRadius: isMe ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                          fontSize: '15px', lineHeight: '1.4'
                        }}>
                          {msg.body}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Input Box */}
            <div style={{ padding: '0 16px 24px' }}>
              <div style={{
                display: 'flex', gap: '12px', background: 'var(--blynx-800)',
                padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--border)'
              }}>
                <input
                  type="text"
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  placeholder={`Message #${activeGroup.name}`}
                  style={{
                    flex: 1, background: 'transparent', border: 'none', outline: 'none',
                    color: 'white', fontSize: '15px'
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleSendMessage();
                  }}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!newMessage.trim()}
                  className="btn-accent"
                  style={{ padding: '6px 16px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            {groups.length > 0 ? 'Select a group to start chatting' : 'No groups available'}
          </div>
        )}
      </div>

      {/* ── RIGHT PANE: Members List ── */}
      {showMembers && id && (
        <div style={{
          width: '240px', background: 'var(--blynx-850)', borderLeft: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', flexShrink: 0
        }}>
          <div style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Members — {members.length}
            </h3>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {loadingMembers ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}><Loader className="spin" size={20} color="var(--accent)" /></div>
            ) : members.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>No members</div>
            ) : (
              members.map(member => (
                <div key={member.id} style={{
                  display: 'flex', alignItems: 'center', padding: '8px', borderRadius: '6px',
                  cursor: 'pointer', transition: 'background 0.1s'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--blynx-800)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '50%', background: 'var(--blynx-700)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600,
                    marginRight: '12px', flexShrink: 0
                  }}>
                    {(member.display_name || member.username).charAt(0).toUpperCase()}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0 }}>
                    <span style={{ color: member.is_vip ? '#faa61a' : 'var(--text-secondary)', fontSize: '14px', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {member.display_name || member.username}
                    </span>
                    {getRoleIcon(member)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

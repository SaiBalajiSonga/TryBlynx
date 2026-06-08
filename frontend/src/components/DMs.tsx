import { useState, useEffect, useRef } from 'react';
import { Send, MoreVertical, Phone, Video, Loader } from 'lucide-react';
import { api } from '../lib/api';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';

export function DMs() {
  const navigate = useNavigate();
  const { id } = useParams(); // URL param for active DM conversation
  const user = useAuthStore(s => s.user);

  const [dms, setDms] = useState<any[]>([]);
  const [loadingDms, setLoadingDms] = useState(true);

  const [messages, setMessages] = useState<any[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch DMs list once
  useEffect(() => {
    api.getDMs()
      .then(res => {
        const chats = res.conversations || [];
        setDms(chats);
        // Auto-navigate to first DM if none selected
        if (!id && chats.length > 0) {
          navigate(`/dms/${chats[0].id}`, { replace: true });
        }
      })
      .catch(err => console.error("Failed to load DMs:", err))
      .finally(() => setLoadingDms(false));
  }, [id, navigate]);

  // Fetch messages when active DM changes
  useEffect(() => {
    if (!id) return;

    setLoadingMessages(true);
    api.getMessages(id)
      .then(res => setMessages(res.messages || []))
      .catch(err => console.error("Failed to load messages:", err))
      .finally(() => setLoadingMessages(false));

  }, [id]);

  // Listen for new websocket messages
  const wsMessagesRaw = useChatStore(s => s.dmMessages[id || '']);
  const wsMessages = wsMessagesRaw || [];
  useEffect(() => {
    if (!id || wsMessages.length === 0) return;
    const latest = wsMessages[wsMessages.length - 1];
    if (latest.conversation_id === id) {
      setMessages(prev => {
        if (prev.some(m => m.id === latest.message_id || m.id === (latest as any).id)) return prev;
        return [latest, ...prev];
      });
    }
  }, [wsMessages, id]);

  const activeChat = dms.find(c => c.id === id);

  const handleSendMessage = () => {
    if (!newMessage.trim() || !id) return;
    api.sendMessage(id, newMessage)
      .then(msg => {
        setMessages(prev => [msg, ...prev]);
        setNewMessage('');
      })
      .catch(err => console.error("Failed to send:", err));
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div style={{ flex: 1, display: 'flex', background: 'var(--blynx-900)', overflow: 'hidden' }}>
      
      {/* ── LEFT PANE: Chat List ── */}
      <div style={{
        width: '320px', borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', background: 'var(--blynx-850)', flexShrink: 0
      }}>
        <div style={{ padding: '20px 16px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ margin: 0, fontSize: '20px', color: 'white', fontWeight: 700 }}>Direct Messages</h2>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loadingDms ? (
             <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}><Loader className="spin" color="var(--accent)" /></div>
          ) : dms.length === 0 ? (
             <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>No direct messages yet.</div>
          ) : (
            dms.map(chat => {
              const isActive = chat.id === id;
              return (
                <div
                  key={chat.id}
                  onClick={() => navigate(`/dms/${chat.id}`)}
                  style={{
                    display: 'flex', alignItems: 'center', padding: '12px 16px',
                    cursor: 'pointer', borderBottom: '1px solid var(--border)',
                    background: isActive ? 'var(--blynx-750)' : 'transparent',
                    transition: 'background 0.1s'
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--blynx-800)'; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent), #7289da)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600,
                    marginRight: '12px', flexShrink: 0
                  }}>
                    {chat.peer_name?.charAt(0).toUpperCase() || 'U'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                      <span style={{ color: 'white', fontWeight: 600, fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {chat.peer_name}
                      </span>
                      <span style={{ color: 'var(--text-muted)', fontSize: '11px', flexShrink: 0, marginLeft: '8px' }}>
                        {formatDate(chat.last_message_at)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {chat.last_message || 'No messages yet'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── CENTER PANE: Active Chat ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--blynx-900)' }}>
        {id && activeChat ? (
          <>
            {/* Header */}
            <div style={{
              padding: '16px 24px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'var(--blynx-850)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '40px', height: '40px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent), #7289da)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600
                }}>
                  {activeChat.peer_name?.charAt(0).toUpperCase() || 'U'}
                </div>
                <div>
                  <h3 style={{ margin: 0, color: 'white', fontSize: '16px', fontWeight: 600 }}>{activeChat.peer_name}</h3>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '16px', color: 'var(--text-secondary)' }}>
                <Phone size={20} style={{ cursor: 'pointer' }} />
                <Video size={20} style={{ cursor: 'pointer' }} />
                <MoreVertical size={20} style={{ cursor: 'pointer' }} />
              </div>
            </div>

            {/* Chat History Area */}
            <div style={{ flex: 1, padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column-reverse', gap: '16px' }}>
              <div ref={messagesEndRef} />
              {loadingMessages ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}><Loader className="spin" color="var(--accent)" /></div>
              ) : messages.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', margin: 'auto' }}>
                  <h2 style={{ color: 'white', marginBottom: '8px' }}>Say hi to {activeChat.peer_name}!</h2>
                  <p>This is the start of your direct message history.</p>
                </div>
              ) : (
                messages.map(msg => {
                  const isMe = msg.sender_id === user?.id;
                  return (
                    <div key={msg.id} style={{ display: 'flex', gap: '16px', flexDirection: isMe ? 'row-reverse' : 'row' }}>
                      <div style={{
                        width: '40px', height: '40px', borderRadius: '50%', flexShrink: 0,
                        background: isMe ? 'linear-gradient(135deg, var(--accent), #7289da)' : 'linear-gradient(135deg, var(--teal), #2b8a3e)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600
                      }}>
                        {isMe ? (user?.display_name || user?.username || 'U').charAt(0).toUpperCase() : (activeChat.peer_name?.charAt(0).toUpperCase() || 'U')}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', maxWidth: '70%' }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '4px' }}>
                          <span style={{ color: 'white', fontWeight: 600, fontSize: '14px' }}>
                            {isMe ? (user?.display_name || user?.username) : activeChat.peer_name}
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

            {/* Input Area */}
            <div style={{ padding: '24px' }}>
              <div style={{ display: 'flex', gap: '12px', background: 'var(--blynx-800)', padding: '12px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                <input
                  type="text"
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  placeholder={`Message ${activeChat.peer_name}...`}
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
                  style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Send size={16} /> Send
                </button>
              </div>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            Select a chat to start messaging
          </div>
        )}
      </div>
    </div>
  );
}

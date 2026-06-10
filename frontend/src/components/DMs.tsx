import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, MoreVertical, Phone, Video, Loader, UserPlus, Lock } from 'lucide-react';
import { api } from '../lib/api';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { generateKeyPair, exportPublicKey, exportPrivateKeyToJwk, encryptE2EPayload, decryptE2EPayload } from '../lib/crypto';

export function DMs() {
  const navigate = useNavigate();
  const { id } = useParams();
  const user = useAuthStore(s => s.user);
  const updateUser = useAuthStore(s => s.updateUser);

  const [dms, setDms] = useState<any[]>([]);
  const [loadingDms, setLoadingDms] = useState(true);

  // E2EE Key Initialization
  useEffect(() => {
    if (!user) return;
    const checkKeys = async () => {
      const storedPriv = localStorage.getItem(`tryblynx_privkey_${user.id}`);
      if (!user.public_key || !storedPriv) {
        try {
          const kp = await generateKeyPair();
          const pub = await exportPublicKey(kp.publicKey);
          const priv = await exportPrivateKeyToJwk(kp.privateKey);
          localStorage.setItem(`tryblynx_privkey_${user.id}`, JSON.stringify(priv));
          await api.updateProfile({ ...user, public_key: pub });
          updateUser({ public_key: pub });
        } catch (err) {
          console.error('Failed to generate keys:', err);
        }
      }
    };
    checkKeys();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
        if (!id && chats.length > 0) navigate(`/dms/${chats[0].id}`, { replace: true });
      })
      .catch(err => console.error('Failed to load DMs:', err))
      .finally(() => setLoadingDms(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch + decrypt messages when active DM changes
  useEffect(() => {
    if (!id || !user) return;
    setMessages([]);
    const fetchAndDecrypt = async () => {
      setLoadingMessages(true);
      try {
        const res = await api.getMessages(id);
        // FIX: Backend returns newest-first; reverse for chronological display
        const msgs = (res.messages || []).slice().reverse();
        const privStr = localStorage.getItem(`tryblynx_privkey_${user.id}`);
        const privJwk = privStr ? JSON.parse(privStr) : null;
        const decryptedMsgs = await Promise.all(msgs.map(async (msg: any) => {
          // Normalize to message_id field
          const normalized = { ...msg, message_id: msg.message_id || msg.id };
          if (!msg.body?.startsWith('{')) return normalized;
          if (!privJwk) return { ...normalized, body: '[Encrypted — Missing Key]' };
          const plain = await decryptE2EPayload(msg.body, privJwk, msg.sender_id === user.id);
          return { ...normalized, body: plain };
        }));
        setMessages(decryptedMsgs);
      } catch (err) {
        console.error('Failed to load messages:', err);
      } finally {
        setLoadingMessages(false);
      }
    };
    fetchAndDecrypt();
  }, [id, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // FIX: Scroll to bottom whenever messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Listen for new WebSocket messages for this conversation
  // FIX: use ?? [] instead of || [] to avoid creating a new array every render (infinite loop)
  const wsMessages = useChatStore(s => s.dmMessages[id ?? '']) ?? [];
  const wsMessagesLen = wsMessages.length;

  useEffect(() => {
    if (!id || wsMessagesLen === 0 || !user) return;
    const latest = wsMessages[wsMessagesLen - 1];
    if (!latest || latest.conversation_id !== id) return;

    // FIX: dedup using message_id field (backend shape), not id
    setMessages(prev => {
      const isDup = prev.some(
        m => m.message_id === latest.message_id || m.message_id === (latest as any).id
      );
      if (isDup) return prev;

      const decryptAndAdd = async () => {
        const privStr = localStorage.getItem(`tryblynx_privkey_${user.id}`);
        const privJwk = privStr ? JSON.parse(privStr) : null;
        let plainBody = latest.body;
        if (latest.body?.startsWith('{') && privJwk) {
          plainBody = await decryptE2EPayload(latest.body, privJwk, latest.sender_id === user.id);
        } else if (latest.body?.startsWith('{')) {
          plainBody = '[Encrypted — Missing Key]';
        }
        setMessages(p => {
          if (p.some(m => m.message_id === latest.message_id)) return p;
          return [...p, { ...latest, body: plainBody, message_id: latest.message_id || (latest as any).id }];
        });
      };
      decryptAndAdd();
      return prev; // placeholder — actual update happens in decryptAndAdd
    });
  }, [wsMessagesLen, id, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeChat = dms.find(c => c.id === id);

  const handleSendMessage = useCallback(async () => {
    if (!newMessage.trim() || !id || !activeChat || !user) return;

    let payloadStr = newMessage;
    if (user.public_key && activeChat.peer_public_key) {
      try {
        payloadStr = await encryptE2EPayload(newMessage, user.public_key, activeChat.peer_public_key);
      } catch {
        return alert('Encryption failed. Message not sent.');
      }
    } else if (!activeChat.peer_public_key) {
      if (!window.confirm('Recipient has no E2EE key. Send unencrypted?')) return;
    }

    const plainText = newMessage;
    setNewMessage('');
    try {
      const msg = await api.sendMessage(id, payloadStr);
      setMessages(prev => {
        const normalized = { ...msg, message_id: msg.id || msg.message_id, body: plainText };
        if (prev.some(m => m.message_id === normalized.message_id)) return prev;
        return [...prev, normalized];
      });
    } catch (err: any) {
      console.error('Failed to send:', err);
      setNewMessage(plainText);
    }
  }, [newMessage, id, activeChat, user]);

  const fmt = (s: string) => s ? new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <div style={{ flex: 1, display: 'flex', background: 'var(--blynx-900)', overflow: 'hidden' }}>

      {/* ── LEFT PANE ── */}
      <div style={{ width: '300px', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--blynx-850)', flexShrink: 0 }}>
        <div style={{ padding: '20px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: '18px', color: 'white', fontWeight: 700 }}>Direct Messages</h2>
          <button
            onClick={() => navigate('/search')}
            title="Find friends to message"
            style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px', borderRadius: '6px', display: 'flex' }}
          >
            <UserPlus size={18} />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loadingDms ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}><Loader className="spin" color="var(--accent)" /></div>
          ) : dms.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Lock size={32} style={{ marginBottom: '12px', opacity: 0.4 }} />
              <p style={{ margin: '0 0 8px', fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)' }}>No messages yet</p>
              <p style={{ margin: 0, fontSize: '12px' }}>Add friends first, then you can DM them.</p>
            </div>
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
                    background: isActive ? 'rgba(88,101,242,0.12)' : 'transparent',
                    transition: 'background 0.1s'
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--blynx-800)'; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent), #7289da)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600,
                    marginRight: '12px', flexShrink: 0, overflow: 'hidden'
                  }}>
                    {chat.peer_avatar
                      ? <img src={chat.peer_avatar} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                      : (chat.peer_name?.charAt(0).toUpperCase() || 'U')}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '3px' }}>
                      <span style={{ color: 'white', fontWeight: 600, fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {chat.peer_name}
                      </span>
                      <span style={{ color: 'var(--text-muted)', fontSize: '11px', flexShrink: 0, marginLeft: '8px' }}>{fmt(chat.last_message_at)}</span>
                    </div>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                      {chat.last_message || 'No messages yet'}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── CENTER PANE ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--blynx-900)', minWidth: 0 }}>
        {id && activeChat ? (
          <>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--blynx-850)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent), #7289da)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600, overflow: 'hidden' }}>
                  {activeChat.peer_avatar
                    ? <img src={activeChat.peer_avatar} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                    : activeChat.peer_name?.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 style={{ margin: 0, color: 'white', fontSize: '15px', fontWeight: 700 }}>{activeChat.peer_name}</h3>
                  <span style={{ fontSize: '11px', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Lock size={10} /> End-to-end encrypted
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '16px', color: 'var(--text-secondary)' }}>
                <Phone size={18} style={{ cursor: 'pointer' }} />
                <Video size={18} style={{ cursor: 'pointer' }} />
                <MoreVertical size={18} style={{ cursor: 'pointer' }} />
              </div>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {loadingMessages ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><Loader className="spin" color="var(--accent)" /></div>
              ) : messages.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', margin: 'auto' }}>
                  <h3 style={{ color: 'white', marginBottom: '8px' }}>Say hi to {activeChat.peer_name}! 👋</h3>
                  <p style={{ margin: 0, fontSize: '13px' }}>This is the start of your private conversation.</p>
                </div>
              ) : (
                messages.map((msg, i) => {
                  const isMe = msg.sender_id === user?.id;
                  const key = msg.message_id || msg.id || i;
                  return (
                    <div key={key} style={{ display: 'flex', gap: '10px', flexDirection: isMe ? 'row-reverse' : 'row', alignItems: 'flex-end' }}>
                      <div style={{
                        width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
                        background: isMe ? 'linear-gradient(135deg, var(--accent), #7289da)' : 'linear-gradient(135deg, var(--teal), #2b8a3e)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: '13px',
                        overflow: 'hidden',
                      }}>
                        {isMe
                          ? (user?.avatar_url ? <img src={user.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : (user?.display_name || user?.username || 'U').charAt(0).toUpperCase())
                          : (activeChat.peer_avatar ? <img src={activeChat.peer_avatar} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : activeChat.peer_name?.charAt(0).toUpperCase())}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', maxWidth: '68%' }}>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'baseline', marginBottom: '3px' }}>
                          <span style={{ color: 'white', fontWeight: 600, fontSize: '13px' }}>
                            {isMe ? (user?.display_name || user?.username) : activeChat.peer_name}
                          </span>
                          <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div style={{
                          background: isMe ? 'var(--accent)' : 'var(--blynx-800)',
                          color: isMe ? 'white' : 'var(--text-primary)',
                          padding: '10px 14px', fontSize: '14px', lineHeight: '1.5',
                          borderRadius: isMe ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                          wordBreak: 'break-word',
                        }}>
                          {msg.body}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              {/* FIX: ref at BOTTOM so scrollIntoView goes to newest message */}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
              <div style={{ display: 'flex', gap: '10px', background: 'var(--blynx-800)', padding: '10px 12px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                <input
                  type="text"
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  placeholder={`Message ${activeChat.peer_name}...`}
                  style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'white', fontSize: '14px' }}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!newMessage.trim()}
                  className="btn-accent"
                  style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px' }}
                >
                  <Send size={15} /> Send
                </button>
              </div>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', flexDirection: 'column', gap: '12px' }}>
            <Lock size={40} style={{ opacity: 0.3 }} />
            <p style={{ margin: 0, fontSize: '15px' }}>Select a conversation to start messaging</p>
          </div>
        )}
      </div>
    </div>
  );
}

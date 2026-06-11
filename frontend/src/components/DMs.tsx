import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, MoreVertical, Phone, Video, Loader, MessageSquare, Lock, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import {
  generateKeyPair, exportPublicKey, exportPrivateKeyToJwk,
  encryptMessage, decryptMessage, isEncrypted,
  storePrivateKey, loadPrivateKey,
} from '../lib/crypto';
import { getSendMessage } from '../lib/useWebSocket';

// Stable fallback — prevents Zustand getSnapshot infinite loop
const EMPTY_WS_MSGS: import('../store/chatStore').DMMessage[] = [];

export function DMs() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const user = useAuthStore(s => s.user);
  const updateUser = useAuthStore(s => s.updateUser);
  const clearDMUnread = useChatStore((s) => s.clearDMUnread);

  // Clear unread count when we visit the chat
  useEffect(() => {
    if (id) {
      clearDMUnread(id);
    }
  }, [id, clearDMUnread]);

  const [dms, setDms] = useState<any[]>([]);
  const [loadingDms, setLoadingDms] = useState(true);
  const [messages, setMessages] = useState<any[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [e2eeReady, setE2eeReady] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Step 1: Ensure this user has a keypair ────────────────────────────────
  // Mirrors Instagram's approach: on first DM open, generate RSA keypair,
  // store privkey in localStorage (never sent to server), upload pubkey.
  useEffect(() => {
    if (!user) return;
    const init = async () => {
      const existingPriv = loadPrivateKey(user.id);
      if (user.public_key && existingPriv) {
        // Keys already exist — ready
        setE2eeReady(true);
        return;
      }
      try {
        if (!window.crypto || !window.crypto.subtle) {
          console.error('[E2EE] window.crypto.subtle is unavailable. Are you using HTTP instead of HTTPS on a network IP? E2EE requires a secure context.');
          setE2eeReady(true);
          return;
        }
        const kp = await generateKeyPair();
        const pub = await exportPublicKey(kp.publicKey);
        const priv = await exportPrivateKeyToJwk(kp.privateKey);
        storePrivateKey(user.id, priv);
        await api.updateProfile({ ...user, public_key: pub });
        updateUser({ public_key: pub });
        setE2eeReady(true);
      } catch (err) {
        console.error('[E2EE] Key generation failed:', err);
        // Still allow using DMs in plaintext fallback
        setE2eeReady(true);
      }
    };
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ── Step 2: Load DM list ──────────────────────────────────────────────────
  useEffect(() => {
    api.getDMs()
      .then(res => {
        const chats = res.conversations || [];
        setDms(chats);
        if (!id && chats.length > 0) navigate(`/app/dms/${chats[0].id}`, { replace: true });
      })
      .catch(err => console.error('[DMs] Failed to load list:', err))
      .finally(() => setLoadingDms(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Step 3: Load + decrypt message history when conversation changes ──────
  useEffect(() => {
    if (!id || !user || !e2eeReady) return;
    setMessages([]);
    setLoadingMessages(true);

    const fetchAndDecrypt = async () => {
      try {
        const res = await api.getMessages(id);
        // Backend returns newest-first; reverse for chronological display
        const msgs: any[] = (res.messages || []).slice().reverse();
        const privJwk = loadPrivateKey(user.id);

        const decrypted = await Promise.all(msgs.map(async m => {
          const mid = m.message_id || m.id;
          if (!isEncrypted(m.body)) return { ...m, message_id: mid };
          if (!privJwk) return { ...m, message_id: mid, body: '🔒 Missing key' };
          const plain = await decryptMessage(m.body, privJwk, m.sender_id === user.id);
          return { ...m, message_id: mid, body: plain, _encrypted: true };
        }));

        setMessages(decrypted);
      } catch (err) {
        console.error('[DMs] Failed to fetch messages:', err);
      } finally {
        setLoadingMessages(false);
      }
    };

    fetchAndDecrypt();
  }, [id, user?.id, e2eeReady]);

  // ── Step 4: Merge incoming WS messages (decrypt on arrival) ──────────────
  const wsMessages = useChatStore(s => s.dmMessages[id ?? ''] ?? EMPTY_WS_MSGS);
  const wsLen = wsMessages.length;

  useEffect(() => {
    if (!id || wsLen === 0 || !user) return;
    const latest = wsMessages[wsLen - 1];
    if (!latest || latest.conversation_id !== id) return;

    // If we receive an encrypted message but our local state thinks the peer has no public key,
    // they must have just generated one. Refetch the DM list to get it!
    if (isEncrypted(latest.body)) {
      setDms((currentDms) => {
        const chat = currentDms.find(c => c.id === id);
        if (chat && !chat.peer_public_key) {
          api.getDMs().then(res => setDms(res.conversations || []));
        }
        return currentDms;
      });
    }

    setMessages(prev => {
      const mid = latest.message_id || (latest as any).id;
      if (prev.some(m => m.message_id === mid)) return prev; // already present

      // Decrypt async then re-set
      const privJwk = loadPrivateKey(user.id);
      (async () => {
        let body = latest.body;
        let encrypted = false;
        if (isEncrypted(latest.body) && privJwk) {
          body = await decryptMessage(latest.body, privJwk, latest.sender_id === user.id);
          encrypted = true;
        }
        setMessages(p => {
          if (p.some(m => m.message_id === mid)) return p;
          return [...p, { ...latest, message_id: mid, body, _encrypted: encrypted }];
        });
      })();

      return prev; // optimistic no-op until async completes
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsLen, id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Step 5: Send message (encrypt if both keys available) ─────────────────
  const activeChat = dms.find(c => c.id === id);

  const handleSend = useCallback(async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) e.preventDefault();
    if (!newMessage.trim() || !id || !user || !activeChat) return;

    const text = newMessage.trim();
    setNewMessage('');

    // Try to encrypt; fall back to plaintext if either party has no pubkey
    let body = text;
    const myPub = user.public_key;
    const peerPub = activeChat.peer_public_key;

    if (myPub && peerPub) {
      try {
        body = await encryptMessage(text, myPub, peerPub);
      } catch (err) {
        console.error('[E2EE] Encrypt failed, falling back to plaintext:', err);
        body = text;
      }
    }

    const sendMessage = getSendMessage();
    if (sendMessage) {
      sendMessage('dm.message', { recipient_id: activeChat.peer_id, body });
    } else {
      console.error('[DMs] WebSocket not connected');
    }
  }, [newMessage, id, user, activeChat]);

  // ── Render helpers ────────────────────────────────────────────────────────
  const fmt = (d: string) => {
    if (!d) return '';
    const date = new Date(d);
    const now = new Date();
    return date.toDateString() === now.toDateString()
      ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const peerHasKey = !!activeChat?.peer_public_key;
  const myHasKey = !!user?.public_key;
  const isE2EE = peerHasKey && myHasKey;

  return (
    <div style={{ flex: 1, display: 'flex', background: 'var(--blynx-900)', overflow: 'hidden' }}>

      {/* ── DM list sidebar ── */}
      <div style={{ width: '280px', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--blynx-850)', flexShrink: 0 }}>
        <div style={{ padding: '16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'white' }}>Direct Messages</h2>
          {/* E2EE indicator */}
          <div title="End-to-end encrypted" style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 7px', borderRadius: '4px', background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)' }}>
            <Lock size={10} color="#4ade80" />
            <span style={{ fontSize: '10px', color: '#4ade80', fontWeight: 700 }}>E2EE</span>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loadingDms ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '24px' }}>
              <Loader size={20} color="var(--accent)" style={{ animation: 'spin 1s linear infinite' }} />
            </div>
          ) : dms.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              <MessageSquare size={32} style={{ marginBottom: '8px', opacity: 0.3 }} />
              <p style={{ margin: 0 }}>No messages yet</p>
            </div>
          ) : dms.map(chat => {
            const isActive = chat.id === id;
            return (
              <div key={chat.id} onClick={() => navigate(`/app/dms/${chat.id}`)} style={{
                display: 'flex', alignItems: 'center', padding: '10px 14px', cursor: 'pointer',
                borderBottom: '1px solid var(--border)',
                background: isActive ? 'var(--blynx-750)' : 'transparent', transition: 'background 0.1s',
              }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--blynx-800)'; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{ width: '38px', height: '38px', borderRadius: '50%', flexShrink: 0, marginRight: '10px', background: 'linear-gradient(135deg, var(--accent), #7289da)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600, fontSize: '15px', overflow: 'hidden' }}>
                  {chat.peer_avatar ? <img src={chat.peer_avatar} alt="" style={{width:'100%', height:'100%', objectFit:'cover'}} /> : (chat.peer_name || 'U').charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ color: 'white', fontWeight: 600, fontSize: '13px' }}>{chat.peer_name}</span>
                      {chat.peer_public_key && <Lock size={9} color="#4ade80" />}
                    </div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '11px', flexShrink: 0, marginLeft: '6px' }}>
                      {fmt(chat.last_message_at)}
                    </span>
                  </div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                    {/* Don't show ciphertext in preview */}
                    {chat.last_message?.startsWith('{') ? '🔒 Encrypted message' : (chat.last_message || 'No messages yet')}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Chat area ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {id && activeChat ? (
          <>
            {/* Header */}
            <div style={{ height: '52px', padding: '0 16px', borderBottom: '1px solid var(--border)', background: 'var(--blynx-850)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent), #7289da)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600, fontSize: '13px', overflow: 'hidden' }}>
                  {activeChat.peer_avatar ? <img src={activeChat.peer_avatar} alt="" style={{width:'100%', height:'100%', objectFit:'cover'}} /> : (activeChat.peer_name || 'U').charAt(0).toUpperCase()}
                </div>
                <span style={{ fontWeight: 700, fontSize: '14px', color: 'white' }}>{activeChat.peer_name}</span>
                {/* E2EE status badge */}
                <div
                  title={isE2EE ? 'Messages in this conversation are end-to-end encrypted. TryBlynx cannot read them.' : 'End-to-end encryption not available — the other person needs to open their DMs first.'}
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '4px', background: isE2EE ? 'rgba(74,222,128,0.08)' : 'rgba(250,166,26,0.08)', border: `1px solid ${isE2EE ? 'rgba(74,222,128,0.2)' : 'rgba(250,166,26,0.2)'}`, cursor: 'help' }}>
                  {isE2EE ? <ShieldCheck size={11} color="#4ade80" /> : <Lock size={11} color="#faa61a" />}
                  <span style={{ fontSize: '10px', color: isE2EE ? '#4ade80' : '#faa61a', fontWeight: 700 }}>{isE2EE ? 'E2EE' : 'Pending'}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '4px', color: 'var(--text-muted)' }}>
                {[Phone, Video, MoreVertical].map((Icon, i) => (
                  <button key={i} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '7px', borderRadius: '8px', display: 'flex', transition: 'background 0.1s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--blynx-750)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                    <Icon size={17} />
                  </button>
                ))}
              </div>
            </div>

            {/* E2EE info banner — shown once at top of conversation */}
            {isE2EE ? (
              <div style={{ padding: '8px 16px', background: 'rgba(74,222,128,0.04)', borderBottom: '1px solid rgba(74,222,128,0.08)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'rgba(74,222,128,0.7)', flexShrink: 0 }}>
                <Lock size={11} />
                Messages are end-to-end encrypted. Only you and {activeChat.peer_name} can read them.
              </div>
            ) : (!window.crypto || !window.crypto.subtle) ? (
              <div style={{ padding: '8px 16px', background: 'rgba(239,68,68,0.04)', borderBottom: '1px solid rgba(239,68,68,0.08)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'rgba(239,68,68,0.8)', flexShrink: 0 }}>
                <Lock size={11} />
                End-to-end encryption is disabled. TryBlynx is running in an insecure context (HTTP). Please access via HTTPS or localhost.
              </div>
            ) : null}

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column' }}>
              {loadingMessages ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '32px' }}>
                  <Loader size={20} color="var(--accent)" style={{ animation: 'spin 1s linear infinite' }} />
                </div>
              ) : messages.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                  <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent), #7289da)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: '20px', overflow: 'hidden' }}>
                    {activeChat.peer_avatar ? <img src={activeChat.peer_avatar} alt="" style={{width:'100%', height:'100%', objectFit:'cover'}} /> : (activeChat.peer_name || 'U').charAt(0).toUpperCase()}
                  </div>
                  <p style={{ color: 'white', fontWeight: 600, margin: 0, fontSize: '15px' }}>{activeChat.peer_name}</p>
                  <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0 }}>This is the start of your conversation.</p>
                  {isE2EE && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 12px', borderRadius: '20px', background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.15)' }}>
                      <Lock size={11} color="#4ade80" />
                      <span style={{ fontSize: '11px', color: '#4ade80' }}>End-to-end encrypted</span>
                    </div>
                  )}
                </div>
              ) : (
                messages.map((msg, i) => {
                  const isMe = msg.sender_id === user?.id;
                  const prev = messages[i - 1];
                  const next = messages[i + 1];
                  const isGroupStart = !prev || prev.sender_id !== msg.sender_id;
                  const isGroupEnd   = !next || next.sender_id !== msg.sender_id;
                  const isSolo       = isGroupStart && isGroupEnd;
                  const r = '22px', s = '4px';
                  let borderRadius: string;
                  if (isMe) {
                    if (isSolo)             borderRadius = `${r} ${r} ${r} ${r}`;
                    else if (isGroupStart)  borderRadius = `${r} ${r} ${s} ${r}`;
                    else if (isGroupEnd)    borderRadius = `${r} ${s} ${r} ${r}`;
                    else                    borderRadius = `${r} ${s} ${s} ${r}`;
                  } else {
                    if (isSolo)             borderRadius = `${r} ${r} ${r} ${r}`;
                    else if (isGroupStart)  borderRadius = `${r} ${r} ${r} ${s}`;
                    else if (isGroupEnd)    borderRadius = `${s} ${r} ${r} ${r}`;
                    else                    borderRadius = `${s} ${r} ${r} ${s}`;
                  }
                  return (
                    <div key={msg.message_id} style={{ display: 'flex', flexDirection: isMe ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: '8px', marginTop: isGroupStart ? '12px' : '2px' }}>
                      {!isMe && (
                        <div style={{ width: '28px', flexShrink: 0, alignSelf: 'flex-end', marginBottom: isGroupEnd ? '18px' : '2px' }}>
                          {isGroupEnd ? (
                            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent), #7289da)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600, fontSize: '15px', overflow: 'hidden' }}>
                              {activeChat.peer_avatar ? <img src={activeChat.peer_avatar} alt="" style={{width:'100%', height:'100%', objectFit:'cover'}} /> : (activeChat.peer_name || 'U').charAt(0).toUpperCase()}
                            </div>
                          ) : <div style={{ width: '28px' }} />}
                        </div>
                      )}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', maxWidth: '70%' }}>
                        <div style={{ padding: '9px 14px', borderRadius, background: isMe ? 'linear-gradient(135deg, var(--accent) 0%, #7289da 100%)' : 'var(--blynx-750)', color: 'white', fontSize: '14px', lineHeight: 1.45, border: 'none', wordBreak: 'break-word', boxShadow: isMe ? '0 2px 8px rgba(88,101,242,0.2)' : 'none' }}>
                          {msg.body}
                        </div>
                        {isGroupEnd && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '3px', ...(isMe ? { marginRight: '2px' } : { marginLeft: '2px' }) }}>
                            {msg._encrypted && <Lock size={9} color="rgba(74,222,128,0.6)" />}
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{fmt(msg.created_at)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div style={{ padding: '12px 14px', background: 'var(--blynx-850)', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
              {/* Encryption hint */}
              {!isE2EE && (
                <p style={{ margin: '0 0 8px', fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Lock size={10} />
                  {!myHasKey ? 'Setting up encryption…' : `Waiting for ${activeChat.peer_name} to open DMs to enable E2EE`}
                </p>
              )}
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  ref={inputRef}
                  type="text" value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder={`Message ${activeChat.peer_name}${isE2EE ? ' 🔒' : ''}…`}
                  style={{ flex: 1, background: 'var(--blynx-750)', border: '1px solid var(--border)', borderRadius: '10px', padding: '10px 14px', color: 'white', fontSize: '14px', outline: 'none', fontFamily: 'inherit' }}
                  onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent-glow)'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
                />
                <button onClick={handleSend} disabled={!newMessage.trim()} style={{ width: '40px', height: '40px', borderRadius: '10px', flexShrink: 0, border: 'none', cursor: newMessage.trim() ? 'pointer' : 'not-allowed', background: newMessage.trim() ? 'var(--accent)' : 'var(--blynx-700)', color: newMessage.trim() ? 'white' : 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
                  <Send size={16} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '8px' }}>
            <MessageSquare size={40} color="var(--text-muted)" style={{ opacity: 0.3 }} />
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: 0 }}>Select a conversation</p>
          </div>
        )}
      </div>
    </div>
  );
}

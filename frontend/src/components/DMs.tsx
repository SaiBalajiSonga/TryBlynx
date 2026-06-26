import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, MoreVertical, Phone, Video, Loader, MessageSquare, Lock, Smile, Image as ImageIcon, StickyNote, Reply, Edit2, Copy, Trash2, X } from 'lucide-react';
import { api } from '../lib/api';
import {
  fetchPreKeyBundle, pushHistory, getHistory,
} from '../lib/api';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { useUIStore } from '../store/uiStore';
import {
  // Legacy v1 RSA (backward compat)
  generateKeyPair, exportPublicKey, exportPrivateKeyToJwk,
  encryptMessage, decryptMessage, decryptMessageUnknownSender, isEncrypted,
  storePrivateKey, loadPrivateKey,
  // v2 PQXDH + Double Ratchet
  generateX25519KeyPair, generateMLKEMKeyPair,
  pqxdhSenderHandshake,
  initSenderRatchet, initRecipientRatchet,
  ratchetEncrypt, ratchetDecrypt, isRatchetMessage,
  saveRatchetState, loadRatchetState,
  // MHK cloud history
  getSessionMHK, encryptForHistory, decryptFromHistory,
} from '../lib/crypto';
import { getSendMessage } from '../lib/useWebSocket';
import { usePresenceStore } from '../store/presenceStore';

// ── v2 Session helpers ───────────────────────────────────────────────────────
// Persist v2 identity keys (X25519) per user in localStorage
const IK_PUB_KEY  = (uid: string) => `blynx_ik_pub_${uid}`;
const IK_PRIV_KEY = (uid: string) => `blynx_ik_priv_${uid}`;
const PQ_PUB_KEY  = (uid: string) => `blynx_pq_pub_${uid}`;
const PQ_PRIV_KEY = (uid: string) => `blynx_pq_priv_${uid}`;

async function ensureV2Keys(userId: string) {
  let ikPub  = localStorage.getItem(IK_PUB_KEY(userId));
  let ikPriv = localStorage.getItem(IK_PRIV_KEY(userId));
  if (!ikPub || !ikPriv) {
    const kp = await generateX25519KeyPair();
    localStorage.setItem(IK_PUB_KEY(userId),  kp.publicKey);
    localStorage.setItem(IK_PRIV_KEY(userId), JSON.stringify(kp.privateKey));
    ikPub  = kp.publicKey;
    ikPriv = JSON.stringify(kp.privateKey);
  }
  let pqPub  = localStorage.getItem(PQ_PUB_KEY(userId));
  let pqPriv = localStorage.getItem(PQ_PRIV_KEY(userId));
  if (!pqPub || !pqPriv) {
    const kp = generateMLKEMKeyPair();
    localStorage.setItem(PQ_PUB_KEY(userId),  kp.publicKey);
    localStorage.setItem(PQ_PRIV_KEY(userId), kp.privateKey);
    pqPub  = kp.publicKey;
    pqPriv = kp.privateKey;
  }
  return {
    ikPub:  ikPub!,
    ikPriv: JSON.parse(ikPriv!) as JsonWebKey,
    pqPub:  pqPub!,
    pqPriv: pqPriv!,
  };
}

// Stable fallback — prevents Zustand getSnapshot infinite loop
const EMPTY_WS_MSGS: import('../store/chatStore').DMMessage[] = [];

export function DMs() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const user = useAuthStore(s => s.user);
  const updateUser = useAuthStore(s => s.updateUser);
  const clearDMUnread = useChatStore((s) => s.clearDMUnread);
  const onlineUsers = usePresenceStore(s => s.onlineUsers);
  const lastActiveMap = usePresenceStore(s => s.lastActiveMap);

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
  const [showMenu, setShowMenu] = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [attachmentTab, setAttachmentTab] = useState<'emoji' | 'gif' | 'sticker'>('emoji');
  const [peerIsTyping, setPeerIsTyping] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingSentRef = useRef(false);
  // Guard to prevent repeated refetch on peer_public_key race
  const keyRefetchInFlightRef = useRef(false);
  // Tracks which conversations have had their MHK history loaded (prevent double-fetch)
  const mhkLoadedRef = useRef<Set<string>>(new Set());
  // Tracks which v2 ratchet sessions have been initiated
  const ratchetInitRef = useRef<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [editingMessage, setEditingMessage] = useState<any>(null);
  const [replyingToMessage, setReplyingToMessage] = useState<any>(null);
  const [reactionPickerMsgId, setReactionPickerMsgId] = useState<string | null>(null);

  const handleClearChat = async () => {
    if (!id) return;
    const confirmed = await useUIStore.getState().showConfirm('Clear Chat', 'Are you sure you want to clear the entire chat history? This cannot be undone and will delete the chat for both users.');
    if (confirmed) {
      try {
        await api.clearDMMessages(id);
        setMessages([]);
        setShowMenu(false);
      } catch (err: any) {
        useUIStore.getState().showAlert('Error', err.message || 'Failed to clear chat');
      }
    }
  };

  // ── Step 1: Ensure this user has both v1 (RSA) and v2 (X25519+MLKEM) keypairs ─
  useEffect(() => {
    if (!user) return;
    const init = async () => {
      // --- Legacy v1 RSA (still needed for decrypting old messages) ---
      const existingPriv = loadPrivateKey(user.id);
      if (!user.public_key) {
        try {
          if (!window.crypto?.subtle) {
            console.error('[E2EE] Secure context required for crypto.');
          } else {
            const kp  = await generateKeyPair();
            const pub = await exportPublicKey(kp.publicKey);
            const priv = await exportPrivateKeyToJwk(kp.privateKey);
            storePrivateKey(user.id, priv);
            await api.updateProfile({ ...user, public_key: pub });
            updateUser({ public_key: pub });
          }
        } catch (err) {
          console.error('[E2EE v1] Key generation failed:', err);
        }
      } else if (!existingPriv) {
        console.warn('[E2EE v1] Public key on server but local private key missing.');
      }

      // --- v2 PQXDH: ensure X25519 identity + ML-KEM-768 one-time keys exist ---
      try {
        const { ikPub, pqPub } = await ensureV2Keys(user.id);
        // Upload a pre-key bundle (10 OTKs + 5 PQ keys) in background
        // Uses random key_ids to avoid collision; real production would track these
        const otKeys = await Promise.all(
          Array.from({ length: 10 }, async (_, i) => {
            const kp = await generateX25519KeyPair();
            return { key_id: Date.now() + i, public_key: kp.publicKey };
          })
        );
        const pqKeys = Array.from({ length: 5 }, (_, i) => {
          const kp = generateMLKEMKeyPair();
          return { key_id: Date.now() + 100 + i, public_key: kp.publicKey };
        });
        // Fire-and-forget: upload pre-key bundle to server
        fetchPreKeyBundle(user.id).catch(() => {
          // Bundle not yet uploaded — upload now
          import('../lib/api').then(({ uploadPreKeys }) =>
            uploadPreKeys({
              device_label: `${navigator.platform || 'Browser'} — ${new Date().toLocaleDateString()}`,
              identity_key: ikPub,
              signed_pre_key: ikPub, // Use IK as SPK for simplicity (production: separate SPK)
              signed_pre_key_id: 1,
              signed_pre_key_sig: '', // Signature verification omitted for brevity
              one_time_keys: otKeys,
              pq_keys: pqKeys,
            }).catch(e => console.warn('[PQ] Pre-key upload failed:', e))
          );
        });
      } catch (err) {
        console.warn('[E2EE v2] PQXDH key setup failed (falling back to v1):', err);
      }

      setE2eeReady(true);
    };
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ── Step 2: Load DM list ──────────────────────────────────────────────────
  useEffect(() => {
    api.getDMs()
      .then(async res => {
        const chats = res.conversations || [];
        const privJwk = user ? loadPrivateKey(user.id) : null;
        
        // Decrypt previews
        const decryptedChats = await Promise.all(chats.map(async (c: any) => {
          if (c.last_message && isEncrypted(c.last_message) && privJwk) {
            c.last_message = await decryptMessageUnknownSender(c.last_message, privJwk);
          }
          return c;
        }));

        setDms(decryptedChats);
        if (!id && decryptedChats.length > 0) navigate(`/app/dms/${decryptedChats[0].id}`, { replace: true });
      })
      .catch(err => console.error('[DMs] Failed to load list:', err))
      .finally(() => setLoadingDms(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ── Step 3: Load message history when conversation changes ──────────────
  // Strategy:
  //   1. Try MHK cloud history first (instant, zero-knowledge, cross-device)
  //   2. Fall back to server-stored RSA ciphertexts for old v1 messages
  useEffect(() => {
    if (!id || !user || !e2eeReady) return;
    setMessages([]);
    setLoadingMessages(true);

    const fetchAndDecrypt = async () => {
      try {
        const mhk = getSessionMHK();
        let decrypted: any[] = [];

        // ── Path A: MHK cloud history (v2) ──────────────────────────────────
        if (mhk && !mhkLoadedRef.current.has(id)) {
          mhkLoadedRef.current.add(id);
          try {
            const histRes = await getHistory(id);
            const entries: any[] = histRes?.entries || [];
            // Entries arrive newest-first from server; decrypt + reverse for display
            const mhkDecrypted = await Promise.all(
              entries.map(async (e: any) => {
                try {
                  const body = await decryptFromHistory(e.iv, e.ct, mhk);
                  return { message_id: e.message_id, body, created_at: e.sent_at, _mhk: true };
                } catch {
                  return null; // corrupt entry — skip
                }
              })
            );
            decrypted = mhkDecrypted.filter(Boolean).reverse();
          } catch (err) {
            console.warn('[MHK] History fetch failed, falling back to v1:', err);
          }
        }

        // ── Path B: Legacy v1 RSA fallback (for messages before v2 rollout) ─
        if (decrypted.length === 0) {
          const res = await api.getDMMessages(id);
          const msgs: any[] = (res.messages || []).slice().reverse();
          const privJwk = loadPrivateKey(user.id);

          decrypted = await Promise.all(msgs.map(async (m: any) => {
            const mid = m.message_id || m.id;
            // v2 ratchet message
            if (isRatchetMessage(m.body)) {
              const state = loadRatchetState(id);
              if (state) {
                try {
                  const { plaintext, updatedState } = await ratchetDecrypt(m.body, state);
                  saveRatchetState(id, updatedState);
                  return { ...m, message_id: mid, body: plaintext, _v2: true };
                } catch { /* out-of-order or missing state */ }
              }
              return { ...m, message_id: mid, body: '🔒 E2EE message (session not found)' };
            }
            // v1 RSA message
            if (!isEncrypted(m.body)) return { ...m, message_id: mid };
            if (!privJwk) return { ...m, message_id: mid, body: '🔒 Missing key' };
            const plain = await decryptMessage(m.body, privJwk, m.sender_id === user.id);
            return { ...m, message_id: mid, body: plain, _encrypted: true };
          }));
        }

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
    // Bug #2 fix: use a ref guard so this only fires once per conversation, not on every render.
    if (isEncrypted(latest.body)) {
      const chat = dms.find(c => c.id === id);
      if (chat && !chat.peer_public_key && !keyRefetchInFlightRef.current) {
        keyRefetchInFlightRef.current = true;
        api.getDMs().then(async res => {
          const chats = res.conversations || [];
          const privJwk = user ? loadPrivateKey(user.id) : null;
          const decryptedChats = await Promise.all(chats.map(async (c: any) => {
            if (c.last_message && isEncrypted(c.last_message) && privJwk) {
              c.last_message = await decryptMessageUnknownSender(c.last_message, privJwk);
            }
            return c;
          }));
          setDms(decryptedChats);
          usePresenceStore.getState().initializePresence(decryptedChats.map((c: any) => ({
            id: c.peer_id,
            is_online: false,
            last_active_at: c.last_active_at
          })));
        }).finally(() => { keyRefetchInFlightRef.current = false; });
      }
    }

    setMessages(prev => {
      const mid = latest.message_id || (latest as any).id;
      if (prev.some(m => (m.message_id || (m as any).id) === mid)) return prev;

      const privJwk = loadPrivateKey(user.id);
      (async () => {
        let body = latest.body;
        let encrypted = false;

        // ── v2 Double Ratchet decrypt ──────────────────────────────────────
        if (isRatchetMessage(latest.body)) {
          const state = loadRatchetState(id!);
          if (state) {
            try {
              const { plaintext, updatedState } = await ratchetDecrypt(latest.body, state);
              saveRatchetState(id!, updatedState);
              body = plaintext;
              encrypted = true;
            } catch (e) {
              console.warn('[Ratchet] Decrypt failed on incoming WS msg:', e);
              body = '🔒 Out-of-order message';
            }
          } else {
            body = '🔒 No ratchet session (refresh to establish)';
          }
        } else if (isEncrypted(latest.body) && privJwk) {
          // ── v1 RSA fallback ──────────────────────────────────────────────
          body = await decryptMessage(latest.body, privJwk, latest.sender_id === user.id);
          encrypted = true;
        }

        // Push MHK-encrypted copy to cloud history for cross-device sync
        const mhk = getSessionMHK();
        if (mhk && mid && body && !body.startsWith('🔒')) {
          try {
            const { iv, ct } = await encryptForHistory(body, mhk);
            pushHistory({
              conversation_id: latest.conversation_id || id!,
              message_id: mid,
              iv, ct,
              sent_at: latest.created_at || new Date().toISOString(),
            }).catch(() => {}); // fire-and-forget
          } catch { /* MHK not available, skip */ }
        }

        setMessages(p => {
          if (p.some(m => m.message_id === mid)) return p;
          return [...p, { ...latest, message_id: mid, body, _encrypted: encrypted }];
        });
        setDms(prev => prev.map(c =>
          c.id === latest.conversation_id
            ? { ...c, last_message: body.startsWith('{') ? 'Encrypted message' : body, last_message_at: latest.created_at, last_message_sender_id: latest.sender_id }
            : c
        ));
      })();

      return prev;
    });

    // If peer sent a message, clear the typing indicator immediately
    if (latest.sender_id !== user.id) {
      setPeerIsTyping(false);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsLen, id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, peerIsTyping]);

  // Listen for typing events from peer
  useEffect(() => {
    const handlePeerTyping = (e: Event) => {
      const { conversation_id, typing } = (e as CustomEvent).detail;
      if (conversation_id !== id) return;
      setPeerIsTyping(typing);
      // Auto-clear after 4s in case the stop event is missed
      if (typing) {
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => setPeerIsTyping(false), 4000);
      }
    };
    window.addEventListener('blynx:dm-typing', handlePeerTyping);
    return () => window.removeEventListener('blynx:dm-typing', handlePeerTyping);
  }, [id]);

  // Listen for real-time edits, deletes, and reactions to existing messages
  useEffect(() => {
    const handleEdit = (e: Event) => {
      const { conversation_id, message_id, body, is_edited } = (e as CustomEvent).detail;
      if (conversation_id !== id) return;
      setMessages(prev => prev.map(m => m.message_id === message_id ? { ...m, body, is_edited } : m));
    };
    const handleDelete = (e: Event) => {
      const { conversation_id, message_id } = (e as CustomEvent).detail;
      if (conversation_id !== id) return;
      setMessages(prev => prev.filter(m => m.message_id !== message_id));
    };
    const handleReact = (e: Event) => {
      const { conversation_id, message_id, emoji, added, user_id } = (e as CustomEvent).detail;
      if (conversation_id !== id) return;
      
      const myId = user?.id;
      const isMe = user_id === myId;
      
      setMessages(prev => prev.map(m => {
        if (m.message_id !== message_id) return m;
        let rx = [...(m.reactions || [])];
        const rIdx = rx.findIndex(r => r.emoji === emoji);
        
        if (rIdx >= 0) {
          if (added) {
            rx[rIdx] = { ...rx[rIdx], count: rx[rIdx].count + 1, me: isMe ? true : rx[rIdx].me };
          } else {
            const newCount = rx[rIdx].count - 1;
            if (newCount <= 0) {
              rx.splice(rIdx, 1);
            } else {
              rx[rIdx] = { ...rx[rIdx], count: newCount, me: isMe ? false : rx[rIdx].me };
            }
          }
        } else if (added) {
          rx.push({ emoji, count: 1, me: isMe });
        }
        return { ...m, reactions: rx };
      }));
    };

    window.addEventListener('blynx:dm-edit', handleEdit);
    window.addEventListener('blynx:dm-delete', handleDelete);
    window.addEventListener('blynx:dm-react', handleReact);
    return () => {
      window.removeEventListener('blynx:dm-edit', handleEdit);
      window.removeEventListener('blynx:dm-delete', handleDelete);
      window.removeEventListener('blynx:dm-react', handleReact);
    };
  }, [id, user?.id]);

  // ── Step 5: Send message (encrypt if both keys available) ─────────────────
  const activeChat = dms.find(c => c.id === id);

  useEffect(() => {
    const onFriendRemoved = (e: any) => {
      const removedId = e.detail.userId;
      setDms(prev => prev.filter(c => c.peer_id !== removedId));
      if (activeChat?.peer_id === removedId) {
        navigate('/app/dms', { replace: true });
      }
    };
    window.addEventListener('blynx:friend-removed', onFriendRemoved);
    return () => window.removeEventListener('blynx:friend-removed', onFriendRemoved);
  }, [activeChat, navigate]);

  const handleDeleteMessage = useCallback(async (messageId: string) => {
    const confirmed = await useUIStore.getState().showConfirm('Delete Message', 'Are you sure you want to delete this message?');
    if (!confirmed) return;
    const sendMessage = getSendMessage();
    if (sendMessage) {
      sendMessage('dm.delete', { recipient_id: activeChat?.peer_id, conversation_id: id, message_id: messageId });
    }
  }, [id, activeChat]);

  const handleReactMessage = useCallback((messageId: string, emoji: string) => {
    const sendMessage = getSendMessage();
    if (sendMessage) {
      sendMessage('dm.react', { recipient_id: activeChat?.peer_id, conversation_id: id, message_id: messageId, emoji });
    }
    setReactionPickerMsgId(null);
  }, [id, activeChat]);

  const handleSend = useCallback(async (e?: React.FormEvent | React.MouseEvent, overrideText?: string) => {
    if (e) e.preventDefault();
    const textToSend = overrideText || newMessage.trim();
    if (!textToSend || !id || !user || !activeChat) return;

    if (!overrideText) setNewMessage('');
    // Stop typing indicator on send
    typingSentRef.current = false;
    const sendMessage = getSendMessage();

    // ── Try v2 Double Ratchet encryption first ──────────────────────────────
    let body = textToSend;
    let plaintextForHistory = textToSend;
    let usedRatchet = false;

    const ratchetState = loadRatchetState(id!);
    if (ratchetState) {
      try {
        const { ciphertext, updatedState } = await ratchetEncrypt(textToSend, ratchetState);
        saveRatchetState(id!, updatedState);
        body = ciphertext;
        usedRatchet = true;
      } catch (err) {
        console.warn('[Ratchet] Encrypt failed, attempting PQXDH init:', err);
      }
    }

    // ── If no ratchet state: run PQXDH handshake to establish session ────────
    if (!usedRatchet && !ratchetInitRef.current.has(id!)) {
      ratchetInitRef.current.add(id!);
      try {
        const { ikPriv, ikPub } = await ensureV2Keys(user.id);
        const bundle = await fetchPreKeyBundle(activeChat.peer_id);
        if (bundle?.identity_key) {
          const { rootKey, handshakeInit } = await pqxdhSenderHandshake(
            ikPriv, ikPub,
            {
              identityKey:          bundle.identity_key,
              signedPreKey:         bundle.signed_pre_key,
              signedPreKeyID:       bundle.signed_pre_key_id,
              oneTimeKey:           bundle.one_time_key || '',
              oneTimeKeyID:         bundle.one_time_key_id || 0,
              pqKey:                bundle.pq_key || '',
              pqKeyID:              bundle.pq_key_id || 0,
            }
          );
          const initState = await initSenderRatchet(rootKey, bundle.signed_pre_key);
          saveRatchetState(id!, initState);
          // Retry encrypt with freshly initialised ratchet
          const { ciphertext, updatedState } = await ratchetEncrypt(textToSend, initState);
          saveRatchetState(id!, updatedState);
          body = JSON.stringify({ _pqxdh: handshakeInit, _msg: ciphertext });
          usedRatchet = true;
        }
      } catch (err) {
        console.warn('[PQXDH] Handshake failed, falling back to v1 RSA:', err);
      }
    }

    // ── v1 RSA fallback (if no v2 ratchet available) ──────────────────────────
    if (!usedRatchet) {
      const myPub = user.public_key;
      const peerPub = activeChat.peer_public_key;
      if (myPub && peerPub) {
        try {
          body = await encryptMessage(textToSend, myPub, peerPub);
        } catch (err) {
          console.error('[E2EE v1] Encrypt failed, sending plaintext:', err);
          body = textToSend;
        }
      }
    }

    if (sendMessage) {
      if (editingMessage) {
        sendMessage('dm.edit', {
          recipient_id: activeChat.peer_id,
          conversation_id: id,
          message_id: editingMessage.message_id,
          body,
        });
        setEditingMessage(null);
      } else {
        const payload: any = { recipient_id: activeChat.peer_id, conversation_id: id, body };
        if (replyingToMessage) {
          payload.reply_to_id = replyingToMessage.message_id;
          setReplyingToMessage(null);
        }
        sendMessage('dm.message', payload);

        // Push MHK-encrypted copy to cloud for cross-device history
        const mhk = getSessionMHK();
        if (mhk) {
          const sentAt = new Date().toISOString();
          // Use a temporary UUID-ish ID until the server echoes the real one
          const tempId = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
          encryptForHistory(plaintextForHistory, mhk)
            .then(({ iv, ct }) => pushHistory({
              conversation_id: id!,
              message_id: tempId,
              iv, ct, sent_at: sentAt,
            }))
            .catch(() => {}); // fire-and-forget
        }
      }
    } else {
      console.error('[DMs] WebSocket not connected');
    }
  }, [newMessage, id, user, activeChat, editingMessage, replyingToMessage]);

  // Typing indicator — send once when user starts typing, auto-stop after 3s inactivity
  const handleTypingInput = useCallback((value: string) => {
    setNewMessage(value);
    if (!activeChat || !id) return;
    const sendMessage = getSendMessage();
    if (!sendMessage) return;
    // Include conversation_id so the server skips its GetOrCreateDM DB lookup
    // on every keystroke (critical perf fix — was a full DB round-trip per key).
    if (value.trim() && !typingSentRef.current) {
      typingSentRef.current = true;
      sendMessage('dm.typing', { recipient_id: activeChat.peer_id, conversation_id: id, typing: true });
    }
    // Reset typing after 3s of no keystrokes
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      typingSentRef.current = false;
      if (value.trim()) sendMessage?.('dm.typing', { recipient_id: activeChat?.peer_id, conversation_id: id, typing: false });
    }, 3000);
  }, [activeChat, id]);

  // ── Render helpers ────────────────────────────────────────────────────────
  const fmt = (d: string) => {
    if (!d) return '';
    const date = new Date(d);
    const now = new Date();
    return date.toDateString() === now.toDateString()
      ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const timeAgo = (dateStr: string) => {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div style={{ flex: 1, display: 'flex', background: 'var(--blynx-900)', overflow: 'hidden' }}>

      {/* ── DM list sidebar ── */}
      <div style={{ width: '280px', borderRight: 'none', display: 'flex', flexDirection: 'column', background: 'var(--blynx-850)', flexShrink: 0 }}>
        <div style={{ height: '56px', padding: '0 16px', borderBottom: 'none', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'white' }}>Direct Messages</h2>
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
                display: 'flex', alignItems: 'center', padding: '10px 12px', cursor: 'pointer',
                margin: '2px 8px', borderRadius: '8px',
                background: isActive ? 'var(--blynx-750)' : 'transparent', transition: 'background 0.1s',
              }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--blynx-800)'; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{ position: 'relative', width: '38px', height: '38px', flexShrink: 0, marginRight: '10px' }}>
                  <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent), #7289da)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600, fontSize: '15px', overflow: 'hidden' }}>
                    {chat.peer_avatar ? <img src={chat.peer_avatar} alt="" style={{width:'100%', height:'100%', objectFit:'cover'}} /> : (chat.peer_name || 'U').charAt(0).toUpperCase()}
                  </div>
                  {onlineUsers.has(chat.peer_id) && (
                    <div style={{ position: 'absolute', bottom: 0, right: 0, width: '10px', height: '10px', background: '#4ade80', borderRadius: '50%', border: '2px solid var(--blynx-850)' }} />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                    <span style={{ color: 'white', fontWeight: 600, fontSize: '13px' }}>{chat.peer_name}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '11px', flexShrink: 0, marginLeft: '6px' }}>
                      {fmt(chat.last_message_at)}
                    </span>
                  </div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                    {chat.last_message_sender_id === user?.id && chat.last_message && (
                      <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>You: </span>
                    )}
                    {chat.last_message?.startsWith('{') ? 'Encrypted message' : (chat.last_message || 'No messages yet')}
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
            <div style={{ height: '56px', padding: '0 16px', borderBottom: 'none', background: 'var(--blynx-850)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ position: 'relative', width: '32px', height: '32px' }}>
                  <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent), #7289da)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600, fontSize: '13px', overflow: 'hidden' }}>
                    {activeChat.peer_avatar ? <img src={activeChat.peer_avatar} alt="" style={{width:'100%', height:'100%', objectFit:'cover'}} /> : (activeChat.peer_name || 'U').charAt(0).toUpperCase()}
                  </div>
                  {onlineUsers.has(activeChat.peer_id) && (
                    <div style={{ position: 'absolute', bottom: 0, right: 0, width: '10px', height: '10px', background: '#4ade80', borderRadius: '50%', border: '2px solid var(--blynx-850)' }} />
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontWeight: 700, fontSize: '14px', color: 'white' }}>{activeChat.peer_name}</span>
                  {!onlineUsers.has(activeChat.peer_id) && lastActiveMap.has(activeChat.peer_id) && (
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      Active {timeAgo(lastActiveMap.get(activeChat.peer_id)!)}
                    </span>
                  )}
                  {onlineUsers.has(activeChat.peer_id) && (
                    <span style={{ fontSize: '11px', color: '#4ade80' }}>Online</span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '4px', color: 'var(--text-muted)', position: 'relative' }}>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '7px', borderRadius: '8px', display: 'flex', transition: 'background 0.1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--blynx-750)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                  <Phone size={17} />
                </button>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '7px', borderRadius: '8px', display: 'flex', transition: 'background 0.1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--blynx-750)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                  <Video size={17} />
                </button>
                <button 
                  onClick={() => setShowMenu(!showMenu)}
                  style={{ background: showMenu ? 'var(--blynx-750)' : 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '7px', borderRadius: '8px', display: 'flex', transition: 'background 0.1s' }}
                  onMouseEnter={e => { if (!showMenu) e.currentTarget.style.background = 'var(--blynx-750)' }}
                  onMouseLeave={e => { if (!showMenu) e.currentTarget.style.background = 'none' }}>
                  <MoreVertical size={17} />
                </button>
                
                {showMenu && (
                  <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '8px', background: 'var(--blynx-800)', border: '1px solid var(--border)', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)', padding: '4px', zIndex: 10, width: '160px' }}>
                    <button 
                      onClick={handleClearChat}
                      style={{ width: '100%', padding: '8px 12px', background: 'none', border: 'none', color: '#ed4245', textAlign: 'left', cursor: 'pointer', fontSize: '14px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--blynx-750)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    >
                      Clear Chat
                    </button>
                  </div>
                )}
              </div>
            </div>

            {(!window.crypto || !window.crypto.subtle) && (
              <div style={{ padding: '8px 16px', background: 'rgba(239,68,68,0.04)', borderBottom: '1px solid rgba(239,68,68,0.08)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'rgba(239,68,68,0.8)', flexShrink: 0 }}>
                <Lock size={11} />
                End-to-end encryption is disabled. Lynxus is running in an insecure context (HTTP). Please access via HTTPS or localhost.
              </div>
            )}

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column' }}>
              {!e2eeReady ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: '12px' }}>
                  <Loader size={22} color="var(--accent)" style={{ animation: 'spin 1s linear infinite' }} />
                  <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Loading conversation…</span>
                </div>
              ) : loadingMessages ? (
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
                    <div 
                      key={msg.message_id} 
                      onMouseEnter={() => setHoveredMessageId(msg.message_id)}
                      onMouseLeave={() => setHoveredMessageId(null)}
                      style={{ display: 'flex', flexDirection: isMe ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: '8px', marginTop: isGroupStart ? '12px' : '2px' }}
                    >
                      {!isMe && (
                        <div style={{ width: '28px', flexShrink: 0, alignSelf: 'flex-end', marginBottom: isGroupEnd ? '18px' : '2px' }}>
                          {isGroupEnd ? (
                            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent), #7289da)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600, fontSize: '15px', overflow: 'hidden' }}>
                              {activeChat.peer_avatar ? <img src={activeChat.peer_avatar} alt="" style={{width:'100%', height:'100%', objectFit:'cover'}} /> : (activeChat.peer_name || 'U').charAt(0).toUpperCase()}
                            </div>
                          ) : <div style={{ width: '28px' }} />}
                        </div>
                      )}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', maxWidth: '70%', position: 'relative' }}>
                        
                        {/* Reply Context */}
                        {msg.reply_to_id && (() => {
                          const repliedTo = messages.find(m => m.message_id === msg.reply_to_id);
                          const repliedToMe = repliedTo?.sender_id === user?.id;
                          const repliedName = repliedToMe ? 'You' : activeChat.peer_name;
                          return (
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--blynx-800)', padding: '6px 10px', borderRadius: '8px', opacity: 0.9 }}>
                              <Reply size={12} /> 
                              <span style={{ fontWeight: 600 }}>{repliedName}</span>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>
                                {repliedTo ? repliedTo.body : 'Original message'}
                              </span>
                            </div>
                          );
                        })()}

                        <div style={{ display: 'flex', flexDirection: isMe ? 'row-reverse' : 'row', alignItems: 'center', gap: '8px' }}>
                          <div style={{ padding: '9px 14px', borderRadius, background: isMe ? 'linear-gradient(135deg, var(--accent) 0%, #7289da 100%)' : 'var(--blynx-750)', color: 'white', fontSize: '14px', lineHeight: 1.45, border: 'none', wordBreak: 'break-word', boxShadow: isMe ? '0 2px 8px rgba(88,101,242,0.2)' : 'none' }}>
                            {msg.body.match(/^https?:\/\/.+\.(gif|png|jpg|jpeg|webp)(\?.*)?$/i) ? (
                              <img src={msg.body} alt="attachment" style={{ maxWidth: '100%', maxHeight: '200px', borderRadius: '4px' }} />
                            ) : (
                              msg.body
                            )}
                            {msg.is_edited && <span style={{ fontSize: '10px', opacity: 0.6, marginLeft: '6px' }}>(edited)</span>}
                          </div>

                          {/* Hover Actions Menu */}
                          {(hoveredMessageId === msg.message_id || reactionPickerMsgId === msg.message_id) && (
                            <div style={{ display: 'flex', gap: '4px', background: 'var(--blynx-800)', padding: '4px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.5)', zIndex: 10, position: 'relative' }}>
                              <button onClick={() => setReactionPickerMsgId(reactionPickerMsgId === msg.message_id ? null : msg.message_id)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', borderRadius: '4px' }} title="React"><Smile size={14} /></button>
                              <button onClick={() => setReplyingToMessage(msg)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', borderRadius: '4px' }} title="Reply"><Reply size={14} /></button>
                              <button onClick={() => navigator.clipboard.writeText(msg.body)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', borderRadius: '4px' }} title="Copy"><Copy size={14} /></button>
                              {isMe && <button onClick={() => { setEditingMessage(msg); setNewMessage(msg.body); inputRef.current?.focus(); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', borderRadius: '4px' }} title="Edit"><Edit2 size={14} /></button>}
                              {isMe && <button onClick={() => handleDeleteMessage(msg.message_id)} style={{ background: 'none', border: 'none', color: '#ed4245', cursor: 'pointer', padding: '4px', borderRadius: '4px' }} title="Delete"><Trash2 size={14} /></button>}

                              {/* Mini Reaction Picker Popup */}
                              {reactionPickerMsgId === msg.message_id && (
                                <div style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: '8px', background: 'var(--blynx-850)', border: '1px solid var(--border)', borderRadius: '20px', padding: '6px 8px', display: 'flex', gap: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
                                  {['❤️','😂','😮','😢','🙏','👍'].map(emoji => (
                                    <button key={emoji} onClick={() => handleReactMessage(msg.message_id, emoji)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', transition: 'transform 0.1s' }} onMouseEnter={e => e.currentTarget.style.transform='scale(1.2)'} onMouseLeave={e => e.currentTarget.style.transform='scale(1)'}>{emoji}</button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Reactions Row */}
                        {msg.reactions && msg.reactions.length > 0 && (
                          <div style={{ display: 'flex', gap: '4px', marginTop: '4px', flexWrap: 'wrap', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                            {msg.reactions.map((r: any) => (
                              <button key={r.emoji} onClick={() => handleReactMessage(msg.message_id, r.emoji)} style={{ background: r.me ? 'rgba(88,101,242,0.2)' : 'var(--blynx-800)', border: `1px solid ${r.me ? 'var(--accent)' : 'var(--border)'}`, borderRadius: '12px', padding: '2px 6px', fontSize: '11px', color: 'white', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                                {r.emoji} {r.count > 1 && <span style={{ color: 'var(--text-muted)' }}>{r.count}</span>}
                              </button>
                            ))}
                          </div>
                        )}

                        {isGroupEnd && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '3px', ...(isMe ? { marginRight: '2px' } : { marginLeft: '2px' }) }}>
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{fmt(msg.created_at)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
              {/* Typing indicator */}
              {peerIsTyping && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', padding: '0 4px' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent), #7289da)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '11px', fontWeight: 700, flexShrink: 0, overflow: 'hidden' }}>
                    {activeChat.peer_avatar ? <img src={activeChat.peer_avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (activeChat.peer_name || 'U').charAt(0).toUpperCase()}
                  </div>
                  <div style={{ padding: '8px 14px', borderRadius: '18px 18px 18px 4px', background: 'var(--blynx-750)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {[0,1,2].map(i => (
                      <div key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--text-muted)', animation: `bounce 1.2s ${i * 0.2}s infinite` }} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* E2EE Warning */}
            {user?.public_key && !loadPrivateKey(user.id) && (
              <div style={{ background: 'rgba(250, 166, 26, 0.1)', border: '1px solid rgba(250, 166, 26, 0.3)', color: 'var(--yellow)', padding: '8px 12px', margin: '0 14px 10px', borderRadius: '8px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontWeight: 600 }}>Decryption Key Missing:</span> You cannot read old encrypted messages. Please log out and log back in to restore your private key.
              </div>
            )}

            {/* Input */}
            <div style={{ padding: '0 14px 14px', background: 'transparent', flexShrink: 0 }}>
              
              {/* Context Banner for Replying/Editing */}
              {(replyingToMessage || editingMessage) && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--blynx-800)', borderTopLeftRadius: '12px', borderTopRightRadius: '12px', borderBottom: '1px solid var(--border)', fontSize: '13px', color: 'var(--text-muted)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {editingMessage ? <Edit2 size={14} /> : <Reply size={14} />}
                    <span>{editingMessage ? 'Editing message' : `Replying to ${replyingToMessage.sender_name || 'message'}`}</span>
                  </div>
                  <button onClick={() => { setEditingMessage(null); setReplyingToMessage(null); setNewMessage(''); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }} title="Cancel">
                    <X size={14} />
                  </button>
                </div>
              )}

              <div className="chat-input-wrapper" style={{ position: 'relative', borderTopLeftRadius: (replyingToMessage || editingMessage) ? 0 : undefined, borderTopRightRadius: (replyingToMessage || editingMessage) ? 0 : undefined }}>
                <button 
                  onClick={() => setShowAttachmentMenu(!showAttachmentMenu)}
                  style={{ 
                    background: 'none', border: 'none', color: showAttachmentMenu ? 'var(--accent)' : 'var(--text-muted)', 
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '8px', marginRight: '8px', borderRadius: '50%',
                    transition: 'background 0.15s, color 0.15s'
                  }}
                  onMouseEnter={e => { if (!showAttachmentMenu) e.currentTarget.style.color = 'var(--text-primary)' }}
                  onMouseLeave={e => { if (!showAttachmentMenu) e.currentTarget.style.color = 'var(--text-muted)' }}
                >
                  <Smile size={20} />
                </button>

                {showAttachmentMenu && (
                  <div style={{
                    position: 'absolute', bottom: 'calc(100% + 12px)', left: 0,
                    width: '320px', height: '300px', background: 'var(--blynx-800)',
                    border: '1px solid var(--border)', borderRadius: '12px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column',
                    overflow: 'hidden', zIndex: 50
                  }}>
                    <div style={{ display: 'flex', background: 'var(--blynx-850)', padding: '8px', gap: '4px', borderBottom: '1px solid var(--border)' }}>
                      {[
                        { id: 'emoji', icon: Smile, label: 'Emoji' },
                        { id: 'gif', icon: ImageIcon, label: 'GIFs' },
                        { id: 'sticker', icon: StickyNote, label: 'Stickers' }
                      ].map(tab => (
                        <button key={tab.id} onClick={() => setAttachmentTab(tab.id as any)} style={{
                          flex: 1, padding: '8px', background: attachmentTab === tab.id ? 'var(--blynx-700)' : 'transparent',
                          border: 'none', borderRadius: '8px', color: attachmentTab === tab.id ? 'var(--text-primary)' : 'var(--text-muted)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', cursor: 'pointer',
                          fontSize: '12px', fontWeight: 600, transition: 'background 0.15s'
                        }}
                        onMouseEnter={e => { if (attachmentTab !== tab.id) e.currentTarget.style.background = 'var(--blynx-750)' }}
                        onMouseLeave={e => { if (attachmentTab !== tab.id) e.currentTarget.style.background = 'transparent' }}>
                          <tab.icon size={16} />
                          {tab.label}
                        </button>
                      ))}
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
                      {attachmentTab === 'emoji' && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px' }}>
                          {['😀','😂','🥰','😎','🤔','😭','😡','👍','🎉','🔥','❤️','✨','🙌','👀','💯','💀','😊','🥺','😉','😍','😘','😜','🤪','🤫','🤭'].map(e => (
                            <button key={e} onClick={() => { setNewMessage(prev => prev + e); setShowAttachmentMenu(false); inputRef.current?.focus(); }} style={{
                              background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', padding: '4px',
                              borderRadius: '8px', transition: 'background 0.1s'
                            }}
                            onMouseEnter={ev => ev.currentTarget.style.background = 'var(--blynx-700)'}
                            onMouseLeave={ev => ev.currentTarget.style.background = 'none'}>
                              {e}
                            </button>
                          ))}
                        </div>
                      )}
                      {attachmentTab === 'gif' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                          {[
                            'https://media.tenor.com/2sXAaHqF35QAAAAM/hello-there.gif',
                            'https://media.tenor.com/aKFaZBrZhwcAAAAM/excited-spin.gif',
                            'https://media.tenor.com/71jY8Vovv48AAAAM/ok-ok-ok.gif',
                            'https://media.tenor.com/8QzO4hZ394MAAAAM/dance-party.gif',
                            'https://media.tenor.com/Y12A6v8bF0YAAAAM/cat-typing.gif',
                            'https://media.tenor.com/Z4Y4n2yI55EAAAAM/no-nope.gif'
                          ].map((url, i) => (
                            <img key={i} src={url} alt="gif" onClick={() => { handleSend(undefined, url); setShowAttachmentMenu(false); }} style={{
                              width: '100%', height: '80px', objectFit: 'cover', borderRadius: '8px', cursor: 'pointer',
                              border: '2px solid transparent', transition: 'border-color 0.15s'
                            }}
                            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                            onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'} />
                          ))}
                        </div>
                      )}
                      {attachmentTab === 'sticker' && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                          {[
                            'https://cdn.discordapp.com/stickers/1039992466032070747.png?size=160',
                            'https://cdn.discordapp.com/stickers/1039992459346366525.png?size=160',
                            'https://cdn.discordapp.com/stickers/1039992463771353138.png?size=160',
                            'https://cdn.discordapp.com/stickers/1039992461460291654.png?size=160',
                            'https://cdn.discordapp.com/stickers/1039992456951410778.png?size=160',
                            'https://cdn.discordapp.com/stickers/1039992454652936272.png?size=160'
                          ].map((url, i) => (
                            <img key={i} src={url} alt="sticker" onClick={() => { handleSend(undefined, url); setShowAttachmentMenu(false); }} style={{
                              width: '100%', aspectRatio: '1', objectFit: 'contain', cursor: 'pointer',
                              transform: 'scale(1)', transition: 'transform 0.15s'
                            }}
                            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
                            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'} />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                <input
                  ref={inputRef}
                  type="text" value={newMessage}
                  onChange={e => handleTypingInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder={`Message ${activeChat.peer_name}…`}
                />
                <button 
                  onClick={handleSend} 
                  disabled={!newMessage.trim()} 
                  style={{ 
                    width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0, border: 'none', 
                    cursor: newMessage.trim() ? 'pointer' : 'not-allowed', 
                    background: newMessage.trim() ? 'var(--accent)' : 'transparent', 
                    color: newMessage.trim() ? 'white' : 'var(--text-muted)', 
                    display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' 
                  }}
                >
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

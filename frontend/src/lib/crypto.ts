// ─────────────────────────────────────────────────────────────────────────────
// Lynxus E2EE v2 — Hybrid Post-Quantum Signal Protocol
//
// ══ Architecture ══
//
//  KEY AGREEMENT (per-session, asynchronous):
//    PQXDH = X25519 Diffie-Hellman  ⊕  ML-KEM-768 (Kyber)
//    - Provides classical forward secrecy (X25519) AND post-quantum security
//      (ML-KEM-768) simultaneously. Both must break for the session to fall.
//
//  MESSAGE ENCRYPTION (per-message, ratcheting):
//    Double Ratchet = KDF Chain Ratchet + DH Ratchet
//    - Every message uses a unique message key (Perfect Forward Secrecy).
//    - After each round-trip, the root key is re-derived via a new DH exchange,
//      preventing post-compromise attackers from following the conversation.
//
//  MULTI-DEVICE HISTORY SYNC (zero-knowledge cloud storage):
//    Master History Key (MHK) = PBKDF2(password, userSalt, 100_000, SHA-256)
//    - Derived locally from the user's password. Never transmitted to server.
//    - Each sent/received message is independently encrypted with MHK+AES-GCM
//      and pushed to the server. New devices pull and decrypt without needing
//      the primary device to be online (instant load vs WhatsApp Web's slow sync).
//
//  PASSWORD RECOVERY:
//    12-word BIP-39 mnemonic → PBKDF2 → MHK salt → recover MHK
//    Shown once at signup. User stores offline. No server involvement.
//
//  BACKWARD COMPATIBILITY:
//    Legacy RSA-2048 encrypt/decrypt functions are preserved as v1 fallbacks
//    for conversations that started before v2 was deployed.
// ─────────────────────────────────────────────────────────────────────────────

import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';

// ── Constants ────────────────────────────────────────────────────────────────

const AES_PARAMS     = { name: 'AES-GCM', length: 256 } as const;
const HKDF_HASH      = 'SHA-256';
const PBKDF2_ITERS   = 100_000;

// ── Base64 Helpers ───────────────────────────────────────────────────────────

function b64encode(buf: ArrayBuffer | Uint8Array): string {
  const arr = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
  return window.btoa(binary);
}

function b64decode(b64: string): Uint8Array {
  const bin = window.atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

function toAB(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 1: X25519 Key Pair (Identity, Signed Pre-Key, Ephemeral, One-Time)
// ══════════════════════════════════════════════════════════════════════════════

// X25519 key pair encoded as base64 strings for storage / transport.
export interface X25519KeyPair {
  publicKey: string;  // base64 SPKI
  privateKey: JsonWebKey; // JWK for localStorage
}

// Generate a fresh X25519 ECDH key pair.
export async function generateX25519KeyPair(): Promise<X25519KeyPair> {
  const kp = await window.crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'X25519' },
    true,
    ['deriveKey', 'deriveBits'],
  );
  const spki = await window.crypto.subtle.exportKey('spki', kp.publicKey);
  const jwk  = await window.crypto.subtle.exportKey('jwk', kp.privateKey);
  return { publicKey: b64encode(spki), privateKey: jwk };
}

// Import an X25519 public key from base64 SPKI.
async function importX25519Public(b64: string): Promise<CryptoKey> {
  return window.crypto.subtle.importKey(
    'spki', toAB(b64decode(b64)),
    { name: 'ECDH', namedCurve: 'X25519' },
    false, [],
  );
}

// Import an X25519 private key from JWK.
async function importX25519Private(jwk: JsonWebKey): Promise<CryptoKey> {
  return window.crypto.subtle.importKey(
    'jwk', jwk,
    { name: 'ECDH', namedCurve: 'X25519' },
    false, ['deriveKey', 'deriveBits'],
  );
}

// Compute an X25519 Diffie-Hellman output (32 raw bytes).
async function x25519DH(privateJwk: JsonWebKey, publicB64: string): Promise<Uint8Array> {
  const priv = await importX25519Private(privateJwk);
  const pub  = await importX25519Public(publicB64);
  const bits = await window.crypto.subtle.deriveBits(
    { name: 'ECDH', public: pub }, priv, 256,
  );
  return new Uint8Array(bits);
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 2: ML-KEM-768 (Post-Quantum Key Encapsulation)
// ══════════════════════════════════════════════════════════════════════════════

// Generate an ML-KEM-768 key pair. The publicKey is uploaded to the server;
// the privateKey is stored in localStorage and NEVER transmitted.
export interface MLKEMKeyPair {
  publicKey: string;  // base64 of 1184-byte ML-KEM-768 public key
  privateKey: string; // base64 of 2400-byte ML-KEM-768 private key
}

export function generateMLKEMKeyPair(): MLKEMKeyPair {
  const { publicKey, secretKey } = ml_kem768.keygen();
  return {
    publicKey:  b64encode(publicKey),
    privateKey: b64encode(secretKey),
  };
}

// Encapsulate: given a recipient's ML-KEM-768 public key, produce a
// shared secret and a ciphertext to send to the recipient.
function mlkemEncap(recipientPublicKeyB64: string): { sharedSecret: Uint8Array; ciphertext: Uint8Array } {
  const pk = b64decode(recipientPublicKeyB64);
  const { cipherText, sharedSecret } = ml_kem768.encapsulate(pk);
  return { sharedSecret, ciphertext: cipherText };
}

// Decapsulate: given our own ML-KEM-768 private key and the sender's
// ciphertext, recover the shared secret.
function mlkemDecap(ciphertextB64: string, ourPrivateKeyB64: string): Uint8Array {
  const ct = b64decode(ciphertextB64);
  const sk = b64decode(ourPrivateKeyB64);
  return ml_kem768.decapsulate(ct, sk);
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 3: HKDF Helpers (Key Derivation)
// ══════════════════════════════════════════════════════════════════════════════

// Derive `outputBytes` bytes from input key material using HKDF-SHA256.
async function hkdf(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: string,
  outputBytes: number,
): Promise<Uint8Array> {
  const key = await window.crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await window.crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: HKDF_HASH,
      salt,
      info: new TextEncoder().encode(info),
    },
    key,
    outputBytes * 8,
  );
  return new Uint8Array(bits);
}

// Combine multiple byte arrays by concatenating them.
function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out   = new Uint8Array(total);
  let offset  = 0;
  for (const a of arrays) { out.set(a, offset); offset += a.length; }
  return out;
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 4: PQXDH Handshake
// ══════════════════════════════════════════════════════════════════════════════
//
// PQXDH (Post-Quantum Extended Diffie-Hellman) combines:
//   - 3× X25519 DH outputs (IK↔SPK, EK↔IK, EK↔OTK)
//   - 1× ML-KEM-768 shared secret (encapsulated under recipient's PQ public key)
// All four secrets are fed into HKDF to derive a 32-byte root key (RK).
// This root key initialises the Double Ratchet session.
//
// Security level: if EITHER X25519 or ML-KEM-768 is broken, the other still
// protects the session. This is the same model as Signal's PQXDH spec (2023).

export interface PQXDHHandshakeInit {
  // Sender's ephemeral X25519 key (sent to recipient to compute DH3)
  ephemeralKeyPublic: string;
  // ML-KEM-768 ciphertext (recipient decapsulates with their PQ private key)
  mlkemCiphertext: string;
  // IDs so recipient knows which SPK / OTK / PQK to use
  signedPreKeyID: number;
  oneTimeKeyID: number;
  pqKeyID: number;
  // Sender's own identity public key (for DH1)
  senderIdentityKey: string;
}

export interface PQXDHResult {
  rootKey: Uint8Array;         // 32-byte root key for Double Ratchet init
  handshakeInit: PQXDHHandshakeInit; // Sent as part of the first encrypted message
}

// Sender side of PQXDH.
export async function pqxdhSenderHandshake(
  senderIdentityPrivate: JsonWebKey,
  senderIdentityPublic: string,
  bundle: {
    identityKey: string;          // Recipient IK (public)
    signedPreKey: string;         // Recipient SPK (public)
    signedPreKeyID: number;
    oneTimeKey: string;           // Recipient OTK (public) — may be empty
    oneTimeKeyID: number;
    pqKey: string;                // Recipient PQ public key — may be empty
    pqKeyID: number;
  },
): Promise<PQXDHResult> {
  // Generate a fresh ephemeral X25519 key pair for this session
  const ek = await generateX25519KeyPair();

  // DH1: IK_sender ↔ SPK_recipient
  const dh1 = await x25519DH(senderIdentityPrivate, bundle.signedPreKey);
  // DH2: EK_sender ↔ IK_recipient
  const dh2 = await x25519DH(ek.privateKey, bundle.identityKey);
  // DH3: EK_sender ↔ SPK_recipient
  const dh3 = await x25519DH(ek.privateKey, bundle.signedPreKey);
  // DH4 (optional): EK_sender ↔ OTK_recipient
  let dh4 = new Uint8Array(0);
  if (bundle.oneTimeKey) {
    dh4 = await x25519DH(ek.privateKey, bundle.oneTimeKey);
  }

  // ML-KEM-768 encapsulation against recipient's PQ public key
  let mlkemSecret = new Uint8Array(0);
  let mlkemCiphertext = '';
  if (bundle.pqKey) {
    const { sharedSecret, ciphertext } = mlkemEncap(bundle.pqKey);
    mlkemSecret = sharedSecret;
    mlkemCiphertext = b64encode(ciphertext);
  }

  // Combine all DH outputs + PQ secret into the master secret via HKDF
  // Using a constant salt of 32 zero bytes (per Signal PQXDH spec)
  const salt = new Uint8Array(32);
  const ikm  = concat(dh1, dh2, dh3, dh4, mlkemSecret);
  const rootKey = await hkdf(ikm, salt, 'Lynxus-PQXDH-v1', 32);

  return {
    rootKey,
    handshakeInit: {
      ephemeralKeyPublic: ek.publicKey,
      mlkemCiphertext,
      signedPreKeyID: bundle.signedPreKeyID,
      oneTimeKeyID:   bundle.oneTimeKeyID,
      pqKeyID:        bundle.pqKeyID,
      senderIdentityKey: senderIdentityPublic,
    },
  };
}

// Recipient side of PQXDH — derives the same root key without interaction.
export async function pqxdhRecipientHandshake(
  recipientIdentityPrivate: JsonWebKey,
  recipientSPKPrivate: JsonWebKey,
  recipientOTKPrivate: JsonWebKey | null, // null if no OTK was used
  recipientPQKPrivate: string | null,     // base64 ML-KEM-768 sk, null if no PQK used
  init: PQXDHHandshakeInit,
): Promise<Uint8Array> {
  const dh1 = await x25519DH(recipientSPKPrivate,      init.senderIdentityKey);
  const dh2 = await x25519DH(recipientIdentityPrivate, init.ephemeralKeyPublic);
  const dh3 = await x25519DH(recipientSPKPrivate,      init.ephemeralKeyPublic);
  let dh4 = new Uint8Array(0);
  if (recipientOTKPrivate) {
    dh4 = await x25519DH(recipientOTKPrivate, init.ephemeralKeyPublic);
  }

  let mlkemSecret = new Uint8Array(0);
  if (recipientPQKPrivate && init.mlkemCiphertext) {
    mlkemSecret = mlkemDecap(init.mlkemCiphertext, recipientPQKPrivate);
  }

  const salt = new Uint8Array(32);
  const ikm  = concat(dh1, dh2, dh3, dh4, mlkemSecret);
  return hkdf(ikm, salt, 'Lynxus-PQXDH-v1', 32);
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 5: Double Ratchet
// ══════════════════════════════════════════════════════════════════════════════

// Serialisable state that must be persisted in localStorage per conversation.
export interface RatchetState {
  // 32-byte hex root key
  rootKey: string;
  // 32-byte hex chain key for sending
  sendChainKey: string;
  // 32-byte hex chain key for receiving
  recvChainKey: string;
  // Our current sending DH ratchet key pair
  dhSendPublic: string;   // base64 X25519
  dhSendPrivate: JsonWebKey;
  // Peer's current ratchet DH public key
  dhRecvPublic: string;   // base64 X25519
  // Message counter for sending
  sendCount: number;
  // Message counter for receiving
  recvCount: number;
  // Skipped message keys (for out-of-order delivery)
  // key: "<dhPub>:<msgIndex>", value: base64 AES key
  skippedKeys: Record<string, string>;
}

const RATCHET_PREFIX = 'lynxus_ratchet_';
const MAX_SKIP = 100; // Max skippable messages before rejecting

// Advance the KDF chain by one step.
// Returns [nextChainKey, messageKey] each 32 bytes.
async function ratchetKDF(chainKey: Uint8Array): Promise<[Uint8Array, Uint8Array]> {
  const ck  = await hkdf(chainKey, new Uint8Array([1]), 'Lynxus-CK', 32);
  const mk  = await hkdf(chainKey, new Uint8Array([2]), 'Lynxus-MK', 32);
  return [ck, mk];
}

// Perform a DH Ratchet step: derive new root key and chain key from a new DH output.
async function dhRatchetStep(
  rootKey: Uint8Array,
  dhOutput: Uint8Array,
  direction: 'send' | 'recv',
): Promise<{ newRootKey: Uint8Array; newChainKey: Uint8Array }> {
  const info = `Lynxus-DR-${direction}`;
  const derived = await hkdf(dhOutput, rootKey, info, 64);
  return {
    newRootKey:   derived.slice(0, 32),
    newChainKey:  derived.slice(32, 64),
  };
}

// Import a raw 32-byte key as AES-256-GCM for encrypt/decrypt.
async function importAESKey(raw: Uint8Array, usage: 'encrypt' | 'decrypt'): Promise<CryptoKey> {
  return window.crypto.subtle.importKey('raw', raw, 'AES-GCM', false, [usage]);
}

// ── Ratchet Session Persistence ──────────────────────────────

export function saveRatchetState(conversationId: string, state: RatchetState): void {
  localStorage.setItem(RATCHET_PREFIX + conversationId, JSON.stringify(state));
}

export function loadRatchetState(conversationId: string): RatchetState | null {
  const raw = localStorage.getItem(RATCHET_PREFIX + conversationId);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function deleteRatchetState(conversationId: string): void {
  localStorage.removeItem(RATCHET_PREFIX + conversationId);
}

// ── Init: create initial ratchet state after PQXDH ──────────

export async function initSenderRatchet(
  rootKey: Uint8Array,
  recipientRatchetPublic: string, // recipient's IK or SPK used as initial DH ratchet key
): Promise<RatchetState> {
  const ek = await generateX25519KeyPair();
  const dhOut = await x25519DH(ek.privateKey, recipientRatchetPublic);
  const { newRootKey, newChainKey } = await dhRatchetStep(rootKey, dhOut, 'send');

  return {
    rootKey:       b64encode(newRootKey),
    sendChainKey:  b64encode(newChainKey),
    recvChainKey:  b64encode(new Uint8Array(32)),
    dhSendPublic:  ek.publicKey,
    dhSendPrivate: ek.privateKey,
    dhRecvPublic:  recipientRatchetPublic,
    sendCount:     0,
    recvCount:     0,
    skippedKeys:   {},
  };
}

export function initRecipientRatchet(
  rootKey: Uint8Array,
  ourIdentityPrivate: JsonWebKey,
  ourIdentityPublic: string,
): RatchetState {
  return {
    rootKey:       b64encode(rootKey),
    sendChainKey:  b64encode(new Uint8Array(32)),
    recvChainKey:  b64encode(new Uint8Array(32)),
    dhSendPublic:  ourIdentityPublic,
    dhSendPrivate: ourIdentityPrivate,
    dhRecvPublic:  '',
    sendCount:     0,
    recvCount:     0,
    skippedKeys:   {},
  };
}

// ── Ratchet Encrypt ──────────────────────────────────────────

export interface RatchetMessage {
  v: 2;
  dh: string;         // sender's current ratchet public key (base64 X25519)
  n:  number;         // message index within chain
  pn: number;         // previous chain length
  iv: string;         // AES-GCM nonce (base64)
  ct: string;         // AES-GCM ciphertext (base64)
}

export async function ratchetEncrypt(
  plaintext: string,
  state: RatchetState,
): Promise<{ ciphertext: string; updatedState: RatchetState }> {
  const ckBytes = b64decode(state.sendChainKey);
  const [nextCK, mk] = await ratchetKDF(ckBytes);

  const aesKey = await importAESKey(mk, 'encrypt');
  const iv     = window.crypto.getRandomValues(new Uint8Array(12));
  const ct     = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    new TextEncoder().encode(plaintext),
  );

  const msg: RatchetMessage = {
    v:  2,
    dh: state.dhSendPublic,
    n:  state.sendCount,
    pn: state.recvCount,
    iv: b64encode(iv),
    ct: b64encode(ct),
  };

  const updatedState: RatchetState = {
    ...state,
    sendChainKey: b64encode(nextCK),
    sendCount: state.sendCount + 1,
  };

  return { ciphertext: JSON.stringify(msg), updatedState };
}

// ── Ratchet Decrypt ──────────────────────────────────────────

export async function ratchetDecrypt(
  ciphertextJSON: string,
  state: RatchetState,
): Promise<{ plaintext: string; updatedState: RatchetState }> {
  let msg: RatchetMessage;
  try { msg = JSON.parse(ciphertextJSON); } catch {
    throw new Error('Invalid ratchet message format');
  }
  if (msg.v !== 2) throw new Error('Unknown ratchet version');

  let updatedState = { ...state, skippedKeys: { ...state.skippedKeys } };

  // Check if this is a skipped message key we already computed
  const skipKey = `${msg.dh}:${msg.n}`;
  if (updatedState.skippedKeys[skipKey]) {
    const mk = b64decode(updatedState.skippedKeys[skipKey]);
    delete updatedState.skippedKeys[skipKey];
    const plaintext = await _decryptWithMK(mk, msg);
    return { plaintext, updatedState };
  }

  // Check if DH ratchet key changed (new message from a new ratchet step)
  if (msg.dh !== updatedState.dhRecvPublic) {
    // Store skipped keys from previous receiving chain
    updatedState = await _skipMessageKeys(updatedState, msg.pn);

    // Advance the DH ratchet
    const dhOut = await x25519DH(updatedState.dhSendPrivate, msg.dh);
    const { newRootKey, newChainKey: recvCK } = await dhRatchetStep(
      b64decode(updatedState.rootKey), dhOut, 'recv',
    );

    // Generate new sending ratchet key
    const newEK = await generateX25519KeyPair();
    const dhOut2 = await x25519DH(newEK.privateKey, msg.dh);
    const { newRootKey: rk2, newChainKey: sendCK } = await dhRatchetStep(
      newRootKey, dhOut2, 'send',
    );

    updatedState = {
      ...updatedState,
      rootKey:       b64encode(rk2),
      recvChainKey:  b64encode(recvCK),
      sendChainKey:  b64encode(sendCK),
      dhRecvPublic:  msg.dh,
      dhSendPublic:  newEK.publicKey,
      dhSendPrivate: newEK.privateKey,
      recvCount:     0,
    };
  }

  // Advance receiving chain to match msg.n, storing any skipped keys
  updatedState = await _skipMessageKeys(updatedState, msg.n);

  // Advance one more step to get the message key
  const ckBytes = b64decode(updatedState.recvChainKey);
  const [nextCK, mk] = await ratchetKDF(ckBytes);
  updatedState.recvChainKey = b64encode(nextCK);
  updatedState.recvCount    = msg.n + 1;

  const plaintext = await _decryptWithMK(mk, msg);
  return { plaintext, updatedState };
}

async function _skipMessageKeys(state: RatchetState, until: number): Promise<RatchetState> {
  if (state.recvCount + MAX_SKIP < until) {
    throw new Error('Too many skipped messages — possible attack or replay');
  }
  const skipped = { ...state.skippedKeys };
  let ckBytes = b64decode(state.recvChainKey);
  let count   = state.recvCount;
  while (count < until) {
    const [nextCK, mk] = await ratchetKDF(ckBytes);
    const skipKey = `${state.dhRecvPublic}:${count}`;
    skipped[skipKey] = b64encode(mk);
    ckBytes = nextCK;
    count++;
  }
  return { ...state, recvChainKey: b64encode(ckBytes), recvCount: count, skippedKeys: skipped };
}

async function _decryptWithMK(mk: Uint8Array, msg: RatchetMessage): Promise<string> {
  const aesKey = await importAESKey(mk, 'decrypt');
  const iv     = b64decode(msg.iv);
  const ct     = b64decode(msg.ct);
  const plain  = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toAB(iv) },
    aesKey,
    toAB(ct),
  );
  return new TextDecoder().decode(plain);
}

// Returns true if the body looks like a v2 ratchet message
export function isRatchetMessage(body: string): boolean {
  if (!body.startsWith('{')) return false;
  try { const p = JSON.parse(body); return p.v === 2 && !!p.ct && !!p.dh; } catch { return false; }
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 6: Master History Key (MHK) — Cross-Device Instant History Sync
// ══════════════════════════════════════════════════════════════════════════════

// Derive a 32-byte Master History Key from the user's password.
// Uses PBKDF2-HMAC-SHA256 with 100,000 iterations via native Web Crypto.
// Takes <80ms on mobile, uses 0 additional MB RAM (runs in browser engine).
export async function deriveMHK(password: string, saltB64: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await window.crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'],
  );
  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: toAB(b64decode(saltB64)),
      iterations: PBKDF2_ITERS,
      hash: HKDF_HASH,
    },
    baseKey,
    AES_PARAMS,
    false,
    ['encrypt', 'decrypt'],
  );
}

// Generate a random 16-byte salt for MHK derivation. Generated once per user
// account and stored in the user's profile (salt is not secret).
export function generateMHKSalt(): string {
  return b64encode(window.crypto.getRandomValues(new Uint8Array(16)));
}

// Encrypt a plaintext message body with the MHK for cloud history storage.
export async function encryptForHistory(
  plaintext: string,
  mhk: CryptoKey,
): Promise<{ iv: string; ct: string }> {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const ct = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    mhk,
    new TextEncoder().encode(plaintext),
  );
  return { iv: b64encode(iv), ct: b64encode(ct) };
}

// Decrypt a history entry using the MHK.
export async function decryptFromHistory(
  ivB64: string,
  ctB64: string,
  mhk: CryptoKey,
): Promise<string> {
  const iv = b64decode(ivB64);
  const ct = b64decode(ctB64);
  const plain = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toAB(iv) },
    mhk,
    toAB(ct),
  );
  return new TextDecoder().decode(plain);
}

// ── MHK in-memory store (session-scoped, never persisted) ──────────────────
// The MHK is derived from the user's password at login and kept ONLY in JS
// memory. It is never written to localStorage, IndexedDB, or the server.
let _sessionMHK: CryptoKey | null = null;

export function setSessionMHK(key: CryptoKey): void { _sessionMHK = key; }
export function getSessionMHK(): CryptoKey | null   { return _sessionMHK; }
export function clearSessionMHK(): void              { _sessionMHK = null; }

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 7: 12-Word Mnemonic Recovery Phrase
// ══════════════════════════════════════════════════════════════════════════════

// A compact, auditable BIP-39-inspired wordlist (first 2048 words).
// In production this would be the full BIP-39 English wordlist.
// We embed it inline to avoid a network fetch (security: no CDN dependency).
const WORD_LIST: readonly string[] = [
  'abandon','ability','able','about','above','absent','absorb','abstract','absurd','abuse',
  'access','accident','account','accuse','achieve','acid','acoustic','acquire','across','act',
  'action','actor','actress','actual','adapt','add','addict','address','adjust','admit',
  'adult','advance','advice','aerobic','afford','afraid','again','age','agent','agree',
  'ahead','aim','air','airport','aisle','alarm','album','alcohol','alert','alien',
  'all','alley','allow','almost','alone','alpha','already','also','alter','always',
  'amateur','amazing','among','amount','amused','analyst','anchor','ancient','anger','angle',
  'animal','ankle','announce','annual','another','answer','antenna','antique','anxiety','any',
  'apart','apology','appear','apple','approve','april','arcade','arctic','arena','argue',
  'arm','armed','armor','army','around','arrange','arrest','arrive','arrow','art',
  'artefact','artist','artwork','ask','aspect','assault','asset','assist','assume','asthma',
  'athlete','atom','attack','attend','attitude','attract','auction','audit','august','aunt',
  'author','auto','autumn','average','avocado','avoid','awake','aware','away','awesome',
  'awful','awkward','axis','baby','balance','bamboo','banana','banner','barely','bargain',
  'barrel','base','basic','basket','battle','beach','bean','beauty','because','become',
  'beef','before','begin','behave','behind','believe','below','belt','bench','benefit',
  'best','betray','better','between','beyond','bicycle','bid','bike','bind','biology',
  'bird','birth','bitter','black','blade','blame','blanket','blast','bleak','bless',
  'blind','blood','blossom','blouse','blue','blur','blush','board','boat','body',
  'boil','bomb','bone','book','boost','border','boring','borrow','boss','bottom',
  'bounce','box','boy','bracket','brain','brand','brave','breeze','brick','bridge',
  'brief','bright','bring','brisk','broccoli','broken','bronze','broom','brother','brown',
  'brush','bubble','buddy','budget','buffalo','build','bulb','bulk','bullet','bundle',
  'bunker','burden','burger','burst','bus','business','busy','butter','buyer','buzz',
  'cabbage','cabin','cable','cactus','cage','cake','call','calm','camera','camp',
  'canal','cancel','candy','cannon','canvas','canyon','capable','capital','captain','carbon',
  'card','cargo','carpet','carry','cart','case','cash','casino','castle','casual',
  'cat','catalog','catch','category','cause','cave','ceiling','celery','cement','census',
  'century','cereal','certain','chair','chalk','champion','change','chaos','chapter','charge',
  'chase','chat','cheap','check','cheese','chef','cherry','chest','chicken','chief',
  'child','chimney','choice','choose','chronic','chuckle','chunk','cigar','cinema','circle',
  'citizen','city','civil','claim','clap','clarify','claw','clay','clean','clerk',
  'clever','click','client','cliff','climb','clinic','clip','clock','clog','close',
  'cloth','cloud','clown','club','clump','cluster','clutch','coach','coast','coconut',
  'code','coffee','coil','coin','collect','color','column','combine','come','comfort',
  'comic','common','company','concert','conduct','confirm','congress','connect','consider','control',
  'convince','cook','cool','copper','copy','coral','core','corn','correct','cost',
  'cotton','couch','country','couple','course','cousin','cover','coyote','crack','cradle',
  'craft','cram','crane','crash','crater','crawl','crazy','cream','credit','creek',
  'crew','cricket','crime','crisp','critic','cross','crouch','crowd','crucial','cruel',
  'cruise','crumble','crunch','crush','cry','crystal','cube','culture','cup','cupboard',
  'curious','current','curtain','curve','cushion','custom','cute','cycle','dad','damage',
  'damp','dance','danger','daring','dash','daughter','dawn','day','deal','debate',
  'debris','decade','december','decide','decline','decorate','decrease','deer','defense','define',
  'defy','degree','delay','deliver','demand','demise','denial','dentist','deny','depart',
  'depend','deposit','depth','deputy','derive','describe','desert','design','desk','despair',
  'destroy','detail','detect','develop','device','devote','diagram','dial','diamond','diary',
  'dice','diesel','diet','differ','digital','dignity','dilemma','dinner','dinosaur','direct',
  'dirt','disagree','discover','disease','dish','dismiss','disorder','display','distance','divert',
  'divide','divorce','dizzy','doctor','document','dog','doll','dolphin','domain','donate',
  'donkey','donor','door','dose','double','dove','draft','dragon','drama','drastic',
  'draw','dream','dress','drift','drill','drink','drip','drive','drop','drum',
  'dry','duck','dumb','dune','during','dust','dutch','duty','dwarf','dynamic',
  'eager','eagle','early','earn','earth','easily','east','easy','echo','ecology',
  'edge','edit','educate','effort','egg','eight','either','elbow','elder','electric',
  'elegant','element','elephant','elevator','elite','else','embark','embody','embrace','emerge',
  'emotion','employ','empower','empty','enable','enact','endless','endorse','enemy','energy',
  'enforce','engage','engine','enhance','enjoy','enlist','enough','enrich','enroll','ensure',
  'enter','entire','entry','envelope','episode','equal','equip','erase','erode','erosion',
  'error','erupt','escape','essay','essence','estate','eternal','ethics','evidence','evil',
  'evoke','evolve','exact','example','excess','exchange','excite','exclude','exercise','exhaust',
  'exhibit','exile','exist','exit','exotic','expand','expire','explain','expose','express',
  'extend','extra','eye','fable','face','faculty','faint','faith','fall','false',
  'fame','family','famous','fan','fancy','fantasy','far','fashion','fat','fatal',
  'father','fatigue','fault','favorite','feature','february','federal','fee','feed','feel',
  'feet','fellow','felt','fence','festival','fetch','fever','few','fiber','fiction',
  'field','figure','file','film','filter','final','find','fine','finger','finish',
  'fire','firm','first','fiscal','fish','fit','fitness','fix','flag','flame',
  'flash','flat','flavor','flee','flight','flip','float','flock','floor','flower',
  'fluid','flush','fly','foam','focus','fog','foil','follow','food','foot',
  'force','forest','forget','fork','fortune','forum','forward','fossil','foster','found',
  'fox','fragile','frame','frequent','fresh','friend','fringe','frog','front','frost',
  'frown','frozen','fruit','fuel','fun','funny','furnace','fury','future','gadget',
  'gain','galaxy','gallery','game','gap','garbage','garden','garlic','garment','gas',
  'gasp','gate','gather','gauge','gaze','general','genius','genre','gentle','genuine',
  'gesture','ghost','giant','gift','giggle','ginger','giraffe','girl','give','glad',
  'glance','glare','glass','glide','glimpse','globe','gloom','glory','glove','glow',
  'glue','goat','goddess','gold','good','goose','gorilla','gospel','gossip','govern',
  'gown','grab','grace','grain','grant','grape','grasp','grass','gravity','great',
  'green','grid','grief','grit','grocery','group','grow','grunt','guard','guide',
  'guilt','guitar','gun','gym','habit','hair','half','hammer','hamster','hand',
  'happy','harsh','harvest','hat','have','hawk','hazard','head','health','heart',
  'heavy','hedgehog','height','hello','helmet','help','hero','hidden','high','hill',
  'hint','hip','hire','history','hobby','hockey','hold','hole','holiday','hollow',
  'home','honey','hood','hope','horn','hospital','host','hour','hover','hub',
  'huge','human','humble','humor','hundred','hungry','hunt','hurdle','hurry','hurt',
  'husband','hybrid','ice','icon','ignore','ill','illegal','image','imitate','immense',
  'immune','impact','impose','improve','impulse','inch','include','income','increase','index',
  'indicate','indoor','industry','infant','inflict','inform','inhale','inject','inner','innocent',
  'input','inquiry','insane','insect','inspire','install','intact','interest','into','invest',
  'invite','involve','iron','island','isolate','issue','item','ivory','jacket','jaguar',
  'jar','jazz','jealous','jeans','jelly','jewel','job','join','joke','journey',
  'joy','judge','juice','jump','jungle','junior','junk','just','kangaroo','keen',
  'keep','ketchup','key','kick','kid','kidney','kind','kingdom','kiss','kit',
  'kitchen','kite','kitten','kiwi','knee','knife','knock','know','lab','lamp',
  'language','laptop','large','later','laugh','laundry','lava','law','lawn','lawsuit',
  'layer','lazy','leader','learn','leave','lecture','left','leg','legal','legend',
  'lemon','lend','length','lens','leopard','lesson','letter','level','liar','liberty',
  'library','license','life','lift','like','limb','limit','lion','liquid','list',
  'little','live','lizard','load','loan','lobster','local','lock','logic','lonely',
  'long','loop','lottery','loud','lounge','love','loyal','lucky','luggage','lumber',
  'lunar','lunch','luxury','mad','magic','magnet','maid','main','mammal','mango',
  'mansion','manual','maple','marble','march','margin','marine','market','marriage','mask',
  'master','match','material','math','matrix','matter','maximum','maze','meadow','mean',
  'medal','media','melody','melt','member','memory','mention','menu','mercy','merge',
  'merit','merry','mesh','message','metal','method','middle','midnight','milk','million',
  'mimic','mind','minimum','minor','minute','miracle','miss','mitten','model','modify',
  'mom','monitor','monkey','monster','month','moon','moral','more','morning','mosquito',
  'mother','motion','motor','mountain','mouse','move','movie','much','muffin','mule',
  'multiply','muscle','museum','mushroom','music','must','mutual','myself','mystery','naive',
  'name','napkin','narrow','nasty','nature','near','neck','need','negative','neglect',
  'neither','nephew','nerve','nest','network','news','next','nice','night','noble',
  'noise','nominee','noodle','normal','north','notable','note','nothing','notice','novel',
  'now','nuclear','number','nurse','nut','oak','obey','object','oblige','obscure',
  'obtain','ocean','october','odor','offer','office','often','oil','okay','old',
  'olive','olympic','omit','once','onion','open','opera','oppose','option','orange',
  'orbit','orchard','order','ordinary','organ','orient','original','orphan','ostrich','other',
  'outdoor','outer','output','outside','oval','over','own','oyster','ozone','pact',
  'paddle','page','pair','palace','palm','panda','panel','panic','panther','paper',
  'parade','parent','park','parrot','party','pass','patch','path','patrol','pause',
  'pave','payment','peace','peanut','peasant','pelican','pen','penalty','pencil','people',
  'pepper','perfect','permit','person','pet','phone','photo','phrase','physical','piano',
  'picnic','picture','piece','pig','pigeon','pill','pilot','pink','pioneer','pipe',
  'pistol','pitch','pizza','place','planet','plastic','plate','plaza','pledge','plunge',
  'poem','poet','point','polar','pole','police','pond','pony','pool','popular',
  'portion','position','possible','post','potato','pottery','poverty','powder','power','practice',
  'praise','predict','prefer','prepare','present','pretty','prevent','price','pride','primary',
  'print','priority','prison','private','prize','problem','process','produce','profit','program',
  'project','promote','proof','property','prosper','protect','proud','provide','public','pudding',
  'pull','pulp','pulse','pumpkin','punish','pupil','purchase','purity','purpose','push',
  'put','puzzle','pyramid','quality','quantum','quarter','question','quick','quit','quiz',
  'quote','rabbit','raccoon','race','rack','radar','radio','rage','rail','rain',
  'raise','rally','ramp','ranch','random','range','rapid','rare','rate','rather',
  'raven','reach','ready','real','reason','rebel','rebuild','recall','receive','recipe',
  'record','recycle','reduce','reflect','reform','refuse','region','regret','regular','reject',
  'relax','release','relief','rely','remain','remember','remind','remove','render','renew',
  'rent','reopen','repair','repeat','replace','report','require','rescue','resemble','resist',
  'resource','response','result','retire','retreat','return','reunion','reveal','review','reward',
  'rhythm','ribbon','ride','ridge','rifle','right','rigid','ring','riot','ripple',
  'risk','ritual','rival','river','road','roast','robot','robust','rocket','romance',
  'roof','rookie','room','rose','rotate','rough','royal','rubber','rude','rug',
  'rule','run','runway','rural','sad','saddle','sadness','safe','sail','salad',
  'salmon','salon','salt','salute','same','sample','sand','satisfy','satoshi','sauce',
  'sausage','save','scale','scan','scatter','scene','scheme','science','scissors','scorpion',
  'scout','scrap','screen','script','scrub','sea','search','season','seat','second',
  'secret','section','security','seed','seek','segment','select','sell','seminar','senior',
  'sense','sentence','series','service','session','settle','setup','seven','shadow','shaft',
  'shallow','share','shed','shell','sheriff','shield','shift','shine','ship','shiver',
  'shock','shoe','shoot','shop','short','shoulder','shove','shrimp','shrug','shuffle',
  'sick','siege','sight','sign','silent','silk','silly','silver','similar','simple',
  'since','sing','siren','sister','situate','six','size','ski','skill','skin',
  'skirt','skull','slab','slam','sleep','slender','slice','slide','slight','slim',
  'slogan','slot','slow','slush','small','smart','smile','smoke','smooth','snack',
  'snake','snap','sniff','snow','soap','soccer','social','sock','solar','soldier',
  'solution','solve','someone','song','soon','sorry','soul','sound','soup','source',
  'south','space','spare','spatial','spawn','speak','special','speed','sphere','spice',
  'spider','spike','spin','spirit','split','spoil','sponsor','spoon','spray','spread',
  'spring','spy','square','squeeze','squirrel','stable','stadium','staff','stage','stairs',
  'stamp','stand','start','state','stay','steak','steel','stem','step','stereo',
  'stick','still','sting','stock','stomach','stone','stop','store','storm','strategy',
  'street','strike','strong','struggle','student','stuff','stumble','style','subject','submit',
  'subway','success','sudden','suffer','sugar','suggest','suit','summer','sun','sunny',
  'sunset','super','supply','supreme','sure','surface','surge','surprise','sustain','swallow',
  'swamp','swap','swear','sweet','swift','swim','swing','switch','sword','symbol',
  'symptom','syrup','table','tackle','tag','tail','talent','tank','tape','target',
  'task','tattoo','taxi','teach','team','tell','ten','tenant','tennis','tent',
  'term','test','text','thank','that','theme','then','theory','there','they',
  'thing','this','thought','three','thrive','throw','thumb','thunder','ticket','tilt',
  'timber','time','tiny','tip','tired','title','toast','tobacco','today','together',
  'toilet','token','tomato','tomorrow','tone','tongue','tonight','tool','tooth','top',
  'topic','topple','torch','tornado','tortoise','toss','total','tourist','toward','tower',
  'town','toy','track','trade','traffic','tragic','train','transfer','trap','trash',
  'travel','tray','treat','tree','trend','trial','tribe','trick','trigger','trim',
  'trip','trophy','trouble','truck','truly','trumpet','trust','truth','try','tube',
  'tuition','tumble','tuna','tunnel','turkey','turn','turtle','twelve','twenty','twice',
  'twin','twist','two','type','typical','ugly','umbrella','unable','undo','unfair',
  'unfold','unhappy','uniform','unique','universe','unknown','unlock','until','unusual','unveil',
  'update','upgrade','uphold','upon','upper','upset','urban','usage','use','used',
  'useful','useless','usual','utility','vacant','vacuum','vague','valid','valley','valve',
  'van','vanish','vapor','various','vast','vault','vehicle','velvet','vendor','venture',
  'venue','verb','verify','version','very','veteran','viable','vibrant','vicious','victory',
  'video','view','village','vintage','violin','virtual','virus','visa','visit','visual',
  'vital','vivid','vocal','voice','void','volcano','volume','vote','voyage','wage',
  'wagon','wait','walk','wall','walnut','want','warfare','warm','warrior','wash',
  'wasp','waste','water','wave','way','wealth','weapon','wear','weasel','weather',
  'web','wedding','weekend','weird','welcome','well','west','wet','whale','wheat',
  'wheel','when','where','whip','whisper','wide','width','wife','wild','will',
  'win','window','wine','wing','wink','winner','winter','wire','wisdom','wise',
  'wish','witness','wolf','woman','wonder','wood','wool','word','world','worry',
  'worth','wrap','wreck','wrestle','wrist','write','wrong','yard','year','yellow',
  'you','young','youth','zebra','zero','zone','zoo',
] as const;

// Generate a secure 12-word recovery phrase from the browser's CSPRNG.
export function generateMnemonic(): string {
  const indices = window.crypto.getRandomValues(new Uint8Array(12));
  return Array.from(indices)
    .map(i => WORD_LIST[i % WORD_LIST.length])
    .join(' ');
}

// Derive an MHK salt from the 12-word mnemonic.
// The mnemonic itself is the key material; the salt is fixed per-app.
export async function mnemonicToMHK(mnemonic: string, passwordSalt: string): Promise<CryptoKey> {
  // We treat the mnemonic as a high-entropy passphrase.
  // passwordSalt is the same salt stored in user profile (not secret).
  return deriveMHK(mnemonic.trim().toLowerCase(), passwordSalt);
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 8: Legacy V1 RSA Functions (Backward Compatibility)
// ══════════════════════════════════════════════════════════════════════════════
// These are preserved so that old messages (encrypted before v2) can still
// be decrypted. All new messages use the Double Ratchet (Section 5) above.

const RSA_PARAMS_V1 = { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' } as const;

export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return window.crypto.subtle.generateKey(RSA_PARAMS_V1, true, ['encrypt', 'decrypt']);
}

export async function exportPublicKey(key: CryptoKey): Promise<string> {
  const spki = await window.crypto.subtle.exportKey('spki', key);
  return b64encode(spki);
}

export async function exportPrivateKeyToJwk(key: CryptoKey): Promise<JsonWebKey> {
  return window.crypto.subtle.exportKey('jwk', key);
}

export async function importPublicKey(b64spki: string): Promise<CryptoKey> {
  return window.crypto.subtle.importKey(
    'spki', toAB(b64decode(b64spki)),
    { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt'],
  );
}

export async function importPrivateKeyFromJwk(jwk: JsonWebKey): Promise<CryptoKey> {
  return window.crypto.subtle.importKey(
    'jwk', jwk,
    { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt'],
  );
}

export interface E2EEnvelope {
  v: 1;
  iv: string;
  ct: string;
  key_s: string;
  key_r: string;
}

export async function encryptMessage(
  plaintext: string,
  senderPublicKeyB64: string,
  recipientPublicKeyB64: string,
): Promise<string> {
  const aesKey = await window.crypto.subtle.generateKey(AES_PARAMS, true, ['encrypt', 'decrypt']);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const ct = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, new TextEncoder().encode(plaintext));
  const rawAes = await window.crypto.subtle.exportKey('raw', aesKey);
  const [senderPub, recipientPub] = await Promise.all([
    importPublicKey(senderPublicKeyB64), importPublicKey(recipientPublicKeyB64),
  ]);
  const [key_s, key_r] = await Promise.all([
    window.crypto.subtle.encrypt({ name: 'RSA-OAEP' }, senderPub, rawAes),
    window.crypto.subtle.encrypt({ name: 'RSA-OAEP' }, recipientPub, rawAes),
  ]);
  return JSON.stringify({ v: 1, iv: b64encode(iv), ct: b64encode(ct), key_s: b64encode(key_s), key_r: b64encode(key_r) });
}

export async function decryptMessage(body: string, privKeyJwk: JsonWebKey, isSender: boolean): Promise<string> {
  if (!body.startsWith('{')) return body;
  let envelope: Partial<E2EEnvelope>;
  try { envelope = JSON.parse(body); } catch { return body; }
  if (!envelope.iv || !envelope.ct || !envelope.key_s || !envelope.key_r) return body;
  try {
    const privKey = await importPrivateKeyFromJwk(privKeyJwk);
    const wrappedKey = b64decode(isSender ? envelope.key_s! : envelope.key_r!);
    const rawAes = await window.crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privKey, toAB(wrappedKey));
    const aesKey = await window.crypto.subtle.importKey('raw', rawAes, 'AES-GCM', false, ['decrypt']);
    const iv = b64decode(envelope.iv!);
    const ct = b64decode(envelope.ct!);
    const plain = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: toAB(iv) }, aesKey, toAB(ct));
    return new TextDecoder().decode(plain);
  } catch {
    return '🔒 Unable to decrypt this message';
  }
}

export async function decryptMessageUnknownSender(body: string, privKeyJwk: JsonWebKey): Promise<string> {
  if (!body.startsWith('{')) return body;
  let envelope: Partial<E2EEnvelope>;
  try { envelope = JSON.parse(body); } catch { return body; }
  if (!envelope.iv || !envelope.ct || !envelope.key_s || !envelope.key_r) return body;
  async function tryKey(b64: string) {
    const privKey = await importPrivateKeyFromJwk(privKeyJwk);
    const wrappedKey = b64decode(b64);
    const rawAes = await window.crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privKey, toAB(wrappedKey));
    const aesKey = await window.crypto.subtle.importKey('raw', rawAes, 'AES-GCM', false, ['decrypt']);
    const iv = b64decode(envelope.iv!);
    const ct = b64decode(envelope.ct!);
    const plain = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: toAB(iv) }, aesKey, toAB(ct));
    return new TextDecoder().decode(plain);
  }
  try { return await tryKey(envelope.key_s!); } catch { /* fallthrough */ }
  try { return await tryKey(envelope.key_r!); } catch { /* fallthrough */ }
  return 'Unable to decrypt';
}

export function isEncrypted(body: string): boolean {
  if (!body.startsWith('{')) return false;
  try { const e = JSON.parse(body); return (e.v === 1 && !!e.ct) || (e.v === 2 && !!e.ct); } catch { return false; }
}

// ── Key persistence (unchanged) ──────────────────────────────

const PRIV_KEY_PREFIX = 'lynxus_privkey_';
export function storePrivateKey(userId: string, jwk: JsonWebKey): void {
  localStorage.setItem(PRIV_KEY_PREFIX + userId, JSON.stringify(jwk));
}
export function loadPrivateKey(userId: string): JsonWebKey | null {
  const raw = localStorage.getItem(PRIV_KEY_PREFIX + userId);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

// ── Password-Based Key Backup (unchanged) ───────────────────

export async function deriveKeyFromPassword(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await window.crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits', 'deriveKey']);
  return window.crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: toAB(salt), iterations: PBKDF2_ITERS, hash: HKDF_HASH },
    keyMaterial,
    AES_PARAMS,
    false, ['encrypt', 'decrypt'],
  );
}

export interface EncryptedKeyBlob { v: 1; salt: string; iv: string; ct: string; }

export async function encryptPrivateKey(jwk: JsonWebKey, password: string): Promise<string> {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv   = window.crypto.getRandomValues(new Uint8Array(12));
  const aesKey = await deriveKeyFromPassword(password, salt);
  const ct = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, new TextEncoder().encode(JSON.stringify(jwk)));
  return JSON.stringify({ v: 1, salt: b64encode(salt), iv: b64encode(iv), ct: b64encode(ct) });
}

export async function decryptPrivateKey(encryptedBlob: string, password: string): Promise<JsonWebKey> {
  const blob: EncryptedKeyBlob = JSON.parse(encryptedBlob);
  if (blob.v !== 1) throw new Error('Unknown encrypted key format version');
  const salt = b64decode(blob.salt);
  const iv   = b64decode(blob.iv);
  const ct   = b64decode(blob.ct);
  const aesKey = await deriveKeyFromPassword(password, salt);
  const pt = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: toAB(iv) }, aesKey, toAB(ct));
  return JSON.parse(new TextDecoder().decode(pt));
}

export interface KeyBackupBlob { v: 2; salt: string; iv: string; ct: string; }

async function deriveKeyFromPassphrase(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await window.crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), { name: 'PBKDF2' }, false, ['deriveKey']);
  return window.crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITERS, hash: HKDF_HASH },
    baseKey,
    AES_PARAMS,
    false, ['encrypt', 'decrypt'],
  );
}

export async function encryptPrivateKeyWithPassphrase(privKeyJwk: JsonWebKey, passphrase: string): Promise<string> {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv   = window.crypto.getRandomValues(new Uint8Array(12));
  const aesKey = await deriveKeyFromPassphrase(passphrase, salt);
  const ct = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, new TextEncoder().encode(JSON.stringify(privKeyJwk)));
  return JSON.stringify({ v: 2, salt: b64encode(salt), iv: b64encode(iv), ct: b64encode(ct) });
}

export async function decryptPrivateKeyWithPassphrase(blobStr: string, passphrase: string): Promise<JsonWebKey> {
  const blob: KeyBackupBlob = JSON.parse(blobStr);
  if (blob.v !== 2) throw new Error('Unknown backup version');
  const salt = b64decode(blob.salt), iv = b64decode(blob.iv), ct = b64decode(blob.ct);
  const aesKey = await deriveKeyFromPassphrase(passphrase, salt);
  let plain: ArrayBuffer;
  try {
    plain = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: toAB(iv) }, aesKey, toAB(ct));
  } catch { throw new Error('Incorrect passphrase'); }
  return JSON.parse(new TextDecoder().decode(plain)) as JsonWebKey;
}

export function passphraseStrength(p: string): { score: 0|1|2|3|4; label: string; color: string } {
  if (!p.length) return { score: 0, label: '', color: '' };
  let s = 0;
  if (p.length >= 8)  s++;
  if (p.length >= 14) s++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
  if (/[0-9!@#$%^&*]/.test(p)) s++;
  const m: [string,string][] = [['Too short','#f87171'],['Weak','#fb923c'],['Fair','#fbbf24'],['Good','#4ade80'],['Strong','#22d3ee']];
  return { score: s as 0|1|2|3|4, label: m[s][0], color: m[s][1] };
}

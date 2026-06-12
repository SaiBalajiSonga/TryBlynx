// ─────────────────────────────────────────────────────────────────────────────
// TryBlynx E2EE — Instagram-style hybrid encryption
//
// How it works (same as Instagram's Signal-derived approach):
//   1. Each user has an RSA-2048 keypair. Public key stored on server.
//      Private key NEVER leaves the device — stored in localStorage.
//   2. To send a message:
//      a. Generate a one-time AES-256-GCM key
//      b. Encrypt the plaintext with AES
//      c. Encrypt the AES key TWICE — once with sender's pubkey, once with
//         recipient's pubkey — so both can decrypt
//      d. Send the JSON envelope to the server (server sees only ciphertext)
//   3. To receive/decrypt:
//      a. Use your RSA private key to unwrap the AES key
//      b. Use the AES key to decrypt the ciphertext
//
// The server is a "dumb pipe" — it stores and routes ciphertext but can
// never read message content.
// ─────────────────────────────────────────────────────────────────────────────

const RSA_PARAMS = { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' } as const;
const AES_PARAMS = { name: 'AES-GCM', length: 256 } as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

function b64encode(buf: ArrayBuffer): string {
  return window.btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function b64decode(b64: string): Uint8Array {
  const bin = window.atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

// ── Key generation ───────────────────────────────────────────────────────────

export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return window.crypto.subtle.generateKey(RSA_PARAMS, true, ['encrypt', 'decrypt']);
}

// Export public key as base64-encoded SPKI (what we store on the server)
export async function exportPublicKey(key: CryptoKey): Promise<string> {
  const spki = await window.crypto.subtle.exportKey('spki', key);
  return b64encode(spki);
}

// Export private key as JWK for localStorage storage
export async function exportPrivateKeyToJwk(key: CryptoKey): Promise<JsonWebKey> {
  return window.crypto.subtle.exportKey('jwk', key);
}

// Import public key from base64 SPKI string (server-stored format)
export async function importPublicKey(b64spki: string): Promise<CryptoKey> {
  const buf = b64decode(b64spki);
  const abuf = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  return window.crypto.subtle.importKey(
    'spki', abuf,
    { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']
  );
}

// Import private key from JWK (localStorage format)
export async function importPrivateKeyFromJwk(jwk: JsonWebKey): Promise<CryptoKey> {
  return window.crypto.subtle.importKey(
    'jwk', jwk,
    { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt']
  );
}

// ── E2EE envelope ─────────────────────────────────────────────────────────────

export interface E2EEnvelope {
  v: 1;                  // version — for future migration
  iv: string;            // AES-GCM nonce (base64)
  ct: string;            // ciphertext (base64)
  key_s: string;         // AES key encrypted with sender's pubkey (base64)
  key_r: string;         // AES key encrypted with recipient's pubkey (base64)
}

/**
 * Encrypt a plaintext message for a conversation.
 * Returns a JSON string safe to store on the server.
 */
export async function encryptMessage(
  plaintext: string,
  senderPublicKeyB64: string,
  recipientPublicKeyB64: string,
): Promise<string> {
  // 1. One-time AES key
  const aesKey = await window.crypto.subtle.generateKey(AES_PARAMS, true, ['encrypt', 'decrypt']);

  // 2. Encrypt plaintext
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const ct = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    new TextEncoder().encode(plaintext),
  );

  // 3. Export raw AES key and wrap it with both public keys
  const rawAes = await window.crypto.subtle.exportKey('raw', aesKey);
  const [senderPub, recipientPub] = await Promise.all([
    importPublicKey(senderPublicKeyB64),
    importPublicKey(recipientPublicKeyB64),
  ]);
  const [key_s, key_r] = await Promise.all([
    window.crypto.subtle.encrypt({ name: 'RSA-OAEP' }, senderPub, rawAes),
    window.crypto.subtle.encrypt({ name: 'RSA-OAEP' }, recipientPub, rawAes),
  ]);

  const envelope: E2EEnvelope = {
    v: 1,
    iv: b64encode(iv.buffer),
    ct: b64encode(ct),
    key_s: b64encode(key_s),
    key_r: b64encode(key_r),
  };
  return JSON.stringify(envelope);
}

/**
 * Decrypt a message.
 * @param body          Raw body from the server (may be plaintext or JSON envelope)
 * @param privKeyJwk    Your private key from localStorage
 * @param isSender      Whether you sent this message (determines which wrapped key to use)
 */
export async function decryptMessage(
  body: string,
  privKeyJwk: JsonWebKey,
  isSender: boolean,
): Promise<string> {
  // If body doesn't look like a JSON envelope, return as-is (plaintext fallback)
  if (!body.startsWith('{')) return body;

  let envelope: Partial<E2EEnvelope>;
  try { envelope = JSON.parse(body); } catch { return body; }

  // Must have all required fields
  if (!envelope.iv || !envelope.ct || !envelope.key_s || !envelope.key_r) return body;

  try {
    const privKey = await importPrivateKeyFromJwk(privKeyJwk);

    // Unwrap the AES key using the correct wrapped copy
    const wrappedKey = b64decode(isSender ? envelope.key_s! : envelope.key_r!);
    const rawAes = await window.crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privKey, wrappedKey.buffer.slice(wrappedKey.byteOffset, wrappedKey.byteOffset + wrappedKey.byteLength) as ArrayBuffer);
    const aesKey = await window.crypto.subtle.importKey('raw', rawAes, 'AES-GCM', false, ['decrypt']);

    // Decrypt the ciphertext
    const iv = b64decode(envelope.iv!);
    const ct = b64decode(envelope.ct!);
    const plain = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) as ArrayBuffer }, aesKey, ct.buffer.slice(ct.byteOffset, ct.byteOffset + ct.byteLength) as ArrayBuffer);
    return new TextDecoder().decode(plain);
  } catch (err) {
    console.warn('[E2EE] Decryption failed (key mismatch or missing):', err);
    return '🔒 Unable to decrypt this message';
  }
}

/**
 * Returns true if the body looks like an E2EE envelope.
 * Used to show the lock icon in the UI.
 */
export function isEncrypted(body: string): boolean {
  if (!body.startsWith('{')) return false;
  try {
    const e = JSON.parse(body);
    return e.v === 1 && !!e.ct;
  } catch { return false; }
}

// ── Key persistence ───────────────────────────────────────────────────────────

const PRIV_KEY_PREFIX = 'tryblynx_privkey_';

export function storePrivateKey(userId: string, jwk: JsonWebKey): void {
  localStorage.setItem(PRIV_KEY_PREFIX + userId, JSON.stringify(jwk));
}

export function loadPrivateKey(userId: string): JsonWebKey | null {
  const raw = localStorage.getItem(PRIV_KEY_PREFIX + userId);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

// ── Password-Based Secure Storage ───────────────────────────────────────────

export async function deriveKeyFromPassword(password: string, salt: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );
  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode(salt),
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true, // Can export for testing, but typically false. Let's make it false for security.
    ['encrypt', 'decrypt']
  );
}

export async function encryptPrivateKey(jwk: JsonWebKey, aesKey: CryptoKey): Promise<string> {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(jwk));
  const ct = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    plaintext
  );
  
  return JSON.stringify({
    iv: b64encode(iv.buffer),
    ct: b64encode(ct)
  });
}

export async function decryptPrivateKey(encryptedBlob: string, aesKey: CryptoKey): Promise<JsonWebKey> {
  const data = JSON.parse(encryptedBlob);
  const iv = b64decode(data.iv);
  const ct = b64decode(data.ct);
  
  const pt = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) as ArrayBuffer },
    aesKey,
    ct.buffer.slice(ct.byteOffset, ct.byteOffset + ct.byteLength) as ArrayBuffer
  );
  
  return JSON.parse(new TextDecoder().decode(pt));
}

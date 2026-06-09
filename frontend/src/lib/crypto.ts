export async function generateKeyPair() {
  return await window.crypto.subtle.generateKey(
    { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['encrypt', 'decrypt']
  );
}

export async function exportPublicKey(key: CryptoKey) {
  const exported = await window.crypto.subtle.exportKey('spki', key);
  return window.btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(exported))));
}

export async function importPublicKey(pem: string) {
  const binaryDerString = window.atob(pem);
  const binaryDer = new Uint8Array(binaryDerString.length);
  for (let i = 0; i < binaryDerString.length; i++) binaryDer[i] = binaryDerString.charCodeAt(i);
  return window.crypto.subtle.importKey('spki', binaryDer, { name: 'RSA-OAEP', hash: 'SHA-256' }, true, ['encrypt']);
}

export async function exportPrivateKeyToJwk(key: CryptoKey) {
  return await window.crypto.subtle.exportKey('jwk', key);
}

export async function importPrivateKeyFromJwk(jwk: any) {
  return await window.crypto.subtle.importKey('jwk', jwk, { name: 'RSA-OAEP', hash: 'SHA-256' }, true, ['decrypt']);
}

// AES-GCM symmetric encryption for messages
export async function encryptE2EPayload(message: string, myPubKeyStr: string, peerPubKeyStr: string) {
  // 1. Generate AES key
  const aesKey = await window.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  
  // 2. Encrypt message with AES
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encodedMsg = new TextEncoder().encode(message);
  const ciphertext = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, encodedMsg);
  
  // 3. Export AES key to encrypt it
  const rawAesKey = await window.crypto.subtle.exportKey('raw', aesKey);
  
  // 4. Encrypt AES key with both public keys
  const myPubKey = await importPublicKey(myPubKeyStr);
  const peerPubKey = await importPublicKey(peerPubKeyStr);
  
  const encKeyMine = await window.crypto.subtle.encrypt({ name: 'RSA-OAEP' }, myPubKey, rawAesKey);
  const encKeyPeer = await window.crypto.subtle.encrypt({ name: 'RSA-OAEP' }, peerPubKey, rawAesKey);
  
  return JSON.stringify({
    iv: window.btoa(String.fromCharCode.apply(null, Array.from(iv))),
    cipher: window.btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(ciphertext)))),
    key_mine: window.btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(encKeyMine)))),
    key_peer: window.btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(encKeyPeer))))
  });
}

// AES-GCM symmetric decryption
export async function decryptE2EPayload(payloadStr: string, myPrivKeyJwk: any, isSender: boolean) {
  try {
    const payload = JSON.parse(payloadStr);
    if (!payload.iv || !payload.cipher) return payloadStr; // not E2EE encrypted
    
    // 1. Decrypt AES key with my private RSA key
    const privKey = await importPrivateKeyFromJwk(myPrivKeyJwk);
    const encKeyStr = window.atob(isSender ? payload.key_mine : payload.key_peer);
    const encKey = new Uint8Array(encKeyStr.length);
    for (let i = 0; i < encKeyStr.length; i++) encKey[i] = encKeyStr.charCodeAt(i);
    
    const rawAesKey = await window.crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privKey, encKey);
    const aesKey = await window.crypto.subtle.importKey('raw', rawAesKey, { name: 'AES-GCM' }, false, ['decrypt']);
    
    // 2. Decrypt message
    const ivStr = window.atob(payload.iv);
    const iv = new Uint8Array(ivStr.length);
    for (let i = 0; i < ivStr.length; i++) iv[i] = ivStr.charCodeAt(i);
    
    const cipherStr = window.atob(payload.cipher);
    const cipher = new Uint8Array(cipherStr.length);
    for (let i = 0; i < cipherStr.length; i++) cipher[i] = cipherStr.charCodeAt(i);
    
    const decrypted = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, cipher);
    return new TextDecoder().decode(decrypted);
  } catch (err) {
    console.error("Decryption failed", err);
    return "[Encrypted Message - Unable to Decrypt]";
  }
}


-- ═══════════════════════════════════════════════════════════════
-- Migration 019: Master History Key (MHK) Encrypted Message Archive
-- Purpose: Enables instant, zero-knowledge cross-device history
--          sync. When a client sends or receives a message, it
--          uploads an AES-256-GCM ciphertext encrypted with its
--          Master History Key (MHK) — a key derived client-side
--          from the user's password that NEVER touches the server.
--          Any of the user's devices can retrieve and decrypt
--          their own history independently without requiring the
--          primary device to be online (unlike WhatsApp Web).
--
-- Design decisions:
--   - The server stores opaque blobs. It cannot read content.
--   - One row per (user, conversation, message). sender_user_id
--     and recipient_user_id each upload their own encrypted copy
--     (encrypted under their respective MHKs), since different
--     users have different MHKs.
--   - 30-day lazy-loading window: clients request history in
--     paginated batches as the user scrolls up.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS mhk_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Owner of this encrypted history entry (only this user can fetch it)
    owner_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    -- Original message ID for deduplication and ordering
    message_id      UUID NOT NULL,
    -- AES-256-GCM nonce (12 bytes, base64)
    iv              TEXT NOT NULL,
    -- AES-256-GCM ciphertext of the plaintext message body (base64).
    -- Encrypted under the owner's Master History Key.
    ct              TEXT NOT NULL,
    -- Original message timestamp (used for ordering WITHOUT decryption)
    sent_at         TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enforce: one encrypted copy per (owner, message) — prevents duplicate uploads
CREATE UNIQUE INDEX IF NOT EXISTS idx_mhk_history_unique
    ON mhk_history(owner_id, message_id);

-- Index for paginated history fetch (newest first, by conversation)
CREATE INDEX IF NOT EXISTS idx_mhk_history_fetch
    ON mhk_history(owner_id, conversation_id, sent_at DESC);

-- ── Mnemonic Recovery Blob ────────────────────────────────────
-- Stores the 12-word recovery phrase salt/iv/ciphertext blob.
-- The blob is encrypted with a key derived from the user's
-- recovery phrase — the server cannot reverse it without the phrase.
-- It is used ONLY when all devices are logged out and password
-- is forgotten (Scenario B in the recovery flow).
CREATE TABLE IF NOT EXISTS user_recovery_blobs (
    user_id    UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    -- JSON blob: { v: 2, salt: base64, iv: base64, ct: base64 }
    -- ct encrypts the MHK salt (16 bytes) under a key derived from the
    -- 12-word mnemonic phrase via PBKDF2.
    blob       TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

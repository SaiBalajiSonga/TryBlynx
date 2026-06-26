-- ═══════════════════════════════════════════════════════════════
-- Migration 018: PQXDH Pre-Key Bundle Tables
-- Purpose: Stores cryptographic material for the hybrid post-quantum
--          Signal Protocol (PQXDH) handshake. Each user registers a
--          bundle of public keys; senders fetch this bundle to
--          establish a Double Ratchet session without the recipient
--          being online (asynchronous key agreement).
--
-- Tables:
--   user_devices   — Tracks registered devices per user account.
--   user_prekeys   — Long-term Identity Key + medium-term Signed Pre-Key
--                    per device. Rotated periodically.
--   user_otkeys    — Pool of one-time X25519 pre-keys per device.
--                    Each key is claimed (deleted) exactly once.
--   user_pqkeys    — Pool of one-time ML-KEM-768 post-quantum keys
--                    per device. Each key is claimed (deleted) exactly once.
-- ═══════════════════════════════════════════════════════════════

-- ── Registered Devices ──────────────────────────────────────────
-- Each row represents one linked device (browser, mobile, desktop).
-- device_label is a human-readable name shown in "Linked Devices" UI.
CREATE TABLE IF NOT EXISTS user_devices (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_label TEXT NOT NULL DEFAULT 'Unknown Device',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_devices_user_id ON user_devices(user_id);

-- ── Pre-Key Bundle (Identity + Signed Pre-Key) ──────────────────
-- One row per device. The identity_key is a long-term X25519 public key.
-- The spk (Signed Pre-Key) is a medium-term X25519 key rotated weekly.
-- spk_signature is the EdDSA signature of the SPK by the identity key,
-- allowing recipients to verify key authenticity.
CREATE TABLE IF NOT EXISTS user_prekeys (
    device_id     UUID NOT NULL REFERENCES user_devices(id) ON DELETE CASCADE,
    identity_key  TEXT NOT NULL,  -- Base64 X25519 public key (32 bytes)
    spk           TEXT NOT NULL,  -- Base64 X25519 Signed Pre-Key public key
    spk_id        INT  NOT NULL,  -- Numeric ID to reference in handshakes
    spk_signature TEXT NOT NULL,  -- Base64 EdDSA signature of SPK
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (device_id)
);

-- ── One-Time X25519 Pre-Keys (OTKs) ────────────────────────────
-- A pool of ephemeral X25519 public keys. Claimed one-per-session:
-- when a sender initiates a PQXDH handshake, they consume one OTK
-- (deleting it from this table) for forward secrecy.
CREATE TABLE IF NOT EXISTS user_otkeys (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id  UUID NOT NULL REFERENCES user_devices(id) ON DELETE CASCADE,
    key_id     INT  NOT NULL,   -- Numeric ID referenced in the handshake message
    public_key TEXT NOT NULL,   -- Base64 X25519 public key
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_otkeys_device_id ON user_otkeys(device_id);

-- ── One-Time ML-KEM-768 Post-Quantum Keys (PQKs) ───────────────
-- A pool of one-time ML-KEM-768 public keys providing post-quantum
-- resistance ("harvest now, decrypt later" protection). One key is
-- consumed per session initiation, just like OTKs.
CREATE TABLE IF NOT EXISTS user_pqkeys (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id  UUID NOT NULL REFERENCES user_devices(id) ON DELETE CASCADE,
    key_id     INT  NOT NULL,   -- Numeric ID referenced in the handshake message
    public_key TEXT NOT NULL,   -- Base64 ML-KEM-768 public key (~1184 bytes)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_pqkeys_device_id ON user_pqkeys(device_id);

-- ═══════════════════════════════════════════════════════════════
-- Migration:    010_moderation_strikes.sql
-- Description:  Adds AI moderation strikes, bans, and device fingerprint tracking
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- Add tracking fields to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS device_fingerprint VARCHAR(255) DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS strike_count INT DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_until TIMESTAMP WITH TIME ZONE;

-- Create a table specifically for hard-banning devices to prevent multi-account circumvention
CREATE TABLE IF NOT EXISTS device_bans (
    fingerprint VARCHAR(255) PRIMARY KEY,
    banned_until TIMESTAMP WITH TIME ZONE NOT NULL,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMIT;

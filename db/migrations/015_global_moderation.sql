-- ═══════════════════════════════════════════════════════════════
-- Migration:    015_global_moderation.sql
-- Description:  Adds global message and user moderation tables for strict liability protection.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- 1. Message Moderation
-- Tracks the AI safety score of every single message
CREATE TABLE IF NOT EXISTS message_moderation (
    message_id UUID PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
    ai_safety_score FLOAT NOT NULL,
    flagged_categories TEXT[] DEFAULT '{}',
    action_taken VARCHAR(50) DEFAULT 'none',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. User Moderation Profile
-- Tracks the long-term trust score of a user and stealth shadowbans
CREATE TABLE IF NOT EXISTS user_moderation (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    trust_score FLOAT DEFAULT 100.0,
    total_reports INT DEFAULT 0,
    is_shadowbanned BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger to auto-update updated_at for user_moderation
CREATE TRIGGER trg_user_moderation_updated_at
    BEFORE UPDATE ON user_moderation
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 3. Report Enhancements
-- Allow optional screenshot/proof uploads in reports
ALTER TABLE user_reports ADD COLUMN IF NOT EXISTS proof_url TEXT;

COMMIT;

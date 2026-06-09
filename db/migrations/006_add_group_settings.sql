-- ═══════════════════════════════════════════════════════════════
-- Migration 006: Add Group Settings
-- Adds Discord-style settings to conversations (description, nsfw, slowmode)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE conversations
    ADD COLUMN description TEXT DEFAULT '',
    ADD COLUMN is_nsfw BOOLEAN DEFAULT false,
    ADD COLUMN slowmode_seconds INTEGER DEFAULT 0;

-- ═══════════════════════════════════════════════════════════════
-- Migration 007: Message Editing
-- Adds is_edited flag to messages table
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE messages
ADD COLUMN is_edited BOOLEAN DEFAULT false;

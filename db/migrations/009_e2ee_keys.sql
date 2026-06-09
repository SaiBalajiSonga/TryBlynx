-- ═══════════════════════════════════════════════════════════════
-- Migration 009: End-to-End Encryption Keys
-- Adds public_key to users table
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE users ADD COLUMN IF NOT EXISTS public_key TEXT DEFAULT '';

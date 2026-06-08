-- ═══════════════════════════════════════════════════════════════
-- Migration 005: Discord-style Roles and Group Seed
-- Adds new role flags to users table and creates default groups
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Roles ───────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_moderator BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_developer BOOLEAN DEFAULT FALSE;

-- Automatically grant all roles to the current registered users so the user can test them
UPDATE users SET is_admin = TRUE, is_moderator = TRUE, is_developer = TRUE, is_vip = TRUE;

-- ── 2. Seed Default Groups ─────────────────────────────────────
-- Only insert if they don't already exist to prevent duplicates
INSERT INTO conversations (type, name)
SELECT 'group', 'General'
WHERE NOT EXISTS (SELECT 1 FROM conversations WHERE name = 'General' AND type = 'group');

INSERT INTO conversations (type, name)
SELECT 'group', 'Ice Squad'
WHERE NOT EXISTS (SELECT 1 FROM conversations WHERE name = 'Ice Squad' AND type = 'group');

INSERT INTO conversations (type, name)
SELECT 'group', 'Roleplay'
WHERE NOT EXISTS (SELECT 1 FROM conversations WHERE name = 'Roleplay' AND type = 'group');

INSERT INTO conversations (type, name)
SELECT 'group', 'Fire Squad'
WHERE NOT EXISTS (SELECT 1 FROM conversations WHERE name = 'Fire Squad' AND type = 'group');

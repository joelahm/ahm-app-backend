-- 002_add_user_columns_example.sql
-- Pattern: add nullable first, backfill, then enforce non-null for safe rollout.

-- Step 1: add nullable columns (backward compatible).
ALTER TABLE users
  ADD COLUMN phone_number VARCHAR(32) NULL,
  ADD COLUMN timezone VARCHAR(64) NULL,
  ADD COLUMN locale VARCHAR(16) NULL;

-- Step 2: optional backfill.
UPDATE users
SET timezone = 'UTC', locale = 'en-US'
WHERE timezone IS NULL OR locale IS NULL;

-- Step 3: enforce non-null only after app writes these columns reliably.
ALTER TABLE users
  MODIFY COLUMN timezone VARCHAR(64) NOT NULL,
  MODIFY COLUMN locale VARCHAR(16) NOT NULL;

-- Step 4: add indexes only when query patterns need them.
CREATE INDEX idx_users_timezone ON users(timezone);

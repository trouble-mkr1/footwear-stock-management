-- HAWA TRADERS milestone 7.4: track dates without falsifying historic data.
-- Run ONLY after a backup and SELECT current_database() check.
-- Existing historical rows retain NULL timestamps; newly created/completed
-- orders will have accurate dates from this point forward.
BEGIN;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
ALTER TABLE orders ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE orders ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS orders_completed_at_idx
    ON orders (completed_at DESC) WHERE LOWER(BTRIM(status)) = 'completed';
COMMIT;

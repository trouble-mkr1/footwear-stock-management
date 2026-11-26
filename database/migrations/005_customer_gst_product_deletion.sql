-- HAWA TRADERS: optional GSTIN and safe removal of live product catalogue records.
-- Back up the chosen database, run SELECT current_database(), and apply to test DB first.
BEGIN;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS gst_number VARCHAR(15);
-- GSTIN is optional; when supplied, validate its basic 15-character structure.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='customers_gst_format_check') THEN
    ALTER TABLE customers ADD CONSTRAINT customers_gst_format_check CHECK (
      gst_number IS NULL OR gst_number ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$'
    );
  END IF;
END $$;
-- Keep a small, non-live historical record for brand analytics and prevent old
-- article numbers from being silently reused for different footwear.
CREATE TABLE IF NOT EXISTS deleted_products (
  art_number VARCHAR(80) PRIMARY KEY,
  brand TEXT,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMIT;

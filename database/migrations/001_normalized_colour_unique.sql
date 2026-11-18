-- Milestone 4: normalized colour uniqueness.
-- IMPORTANT: Run the read-only duplicate-colour and missing-variant checks first.
-- Do NOT run this migration until those checks return zero rows.
-- Run in pgAdmin Query Tool against the intended database (not the backup file).
BEGIN;

-- Fail with a clear message rather than silently ignoring duplicate variants.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM product_variant
        GROUP BY art_number, LOWER(BTRIM(colour))
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Duplicate art number / normalized colour variants exist. Resolve them before creating the unique index.';
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS product_variant_art_colour_normalized_uidx
ON product_variant (art_number, LOWER(BTRIM(colour)));

COMMIT;

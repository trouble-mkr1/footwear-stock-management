-- Milestone 7.1: brand and flexible tags. Additive; preserves existing products/orders.
-- Back up the database and confirm SELECT current_database() before running.
BEGIN;
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand TEXT;
CREATE TABLE IF NOT EXISTS product_tags (
    art_number VARCHAR NOT NULL REFERENCES products(art_number) ON DELETE CASCADE,
    tag TEXT NOT NULL,
    CONSTRAINT product_tag_not_blank CHECK (char_length(btrim(tag)) BETWEEN 1 AND 40)
);
CREATE UNIQUE INDEX IF NOT EXISTS product_tags_art_normalized_tag_uidx
    ON product_tags (art_number, lower(btrim(tag)));
CREATE INDEX IF NOT EXISTS products_brand_normalized_idx
    ON products (lower(btrim(brand)));
COMMIT;

-- Milestone 6: customer identity and ownership of newly created orders.
-- BACK UP THE DATABASE before running. Run separately on the development DB,
-- then on the isolated test DB. DO NOT drop or overwrite any historical records.
BEGIN;

-- Existing `customers` table already includes id, phone, name, shop_name,
-- address, password_hash. Reject duplicates before enforcing normalized phones.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM customers
        GROUP BY regexp_replace(phone, '[^0-9]', '', 'g')
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Duplicate customer phone numbers (after removing formatting) exist. Resolve them before applying migration 002.';
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS customers_phone_digits_unique_idx
ON customers ((regexp_replace(phone, '[^0-9]', '', 'g')));

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES customers(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS orders_customer_id_id_idx
    ON orders (customer_id, id DESC);

-- Historical/admin-created orders remain customer_id NULL by design.
-- Admin Completed = customer Delivered; no new delivery-status field yet.
COMMIT;

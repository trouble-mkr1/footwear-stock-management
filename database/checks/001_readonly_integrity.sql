-- HAWA TRADERS: READ-ONLY DATA INTEGRITY AUDIT
-- Run in pgAdmin against the intended database. This file performs NO writes.
-- Historical completed orders can legitimately refer to variants no longer on sale;
-- prioritize pending-order mismatches as current operational risks.

-- A: Confirm which database and user are active.
SELECT current_database() AS database_name, current_user AS db_user;

-- B: Variant normalized colour collisions (expect no rows, index should prevent these).
SELECT art_number, LOWER(BTRIM(colour)) AS normalized_colour,
       COUNT(*) AS matching_rows
FROM product_variant
GROUP BY art_number, LOWER(BTRIM(colour))
HAVING COUNT(*) > 1;

-- C: Pending-order items with missing/ambiguous variants (expect no rows).
SELECT o.id AS order_id, oi.id AS item_id, oi.art_number, oi.colour,
       oi.size, oi.quantity, COUNT(pv.id) AS matching_variants
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
LEFT JOIN product_variant pv ON pv.art_number = oi.art_number
    AND LOWER(BTRIM(pv.colour)) = LOWER(BTRIM(oi.colour))
WHERE o.status = 'Pending'
GROUP BY o.id, oi.id, oi.art_number, oi.colour, oi.size, oi.quantity
HAVING COUNT(pv.id) <> 1;

-- D: Missing historical selling prices (expect no rows; can break invoice rendering).
SELECT o.id AS order_id, o.status, oi.id AS item_id,
       oi.art_number, oi.colour, oi.unit_price
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
WHERE oi.unit_price IS NULL OR oi.unit_price <= 0;

-- E: Missing MRP snapshots (historical records may have NULL;
-- do NOT invent past prices to make this query return zero).
SELECT o.id AS order_id, o.status, oi.id AS item_id,
       oi.art_number, oi.colour, oi.mrp
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
WHERE oi.mrp IS NULL OR oi.mrp <= 0;

-- F: Negative stock or invalid size (expect no rows).
SELECT variant_id, size, quantity
FROM stock WHERE quantity < 0 OR size <= 0;

-- G: Invalid order quantities / size (expect no rows).
SELECT id, order_id, art_number, colour, size, quantity
FROM order_items WHERE quantity <= 0 OR size <= 0;

-- H: Orders without items (investigate any rows).
SELECT o.id, o.company_name, o.status
FROM orders o LEFT JOIN order_items oi ON oi.order_id=o.id
WHERE oi.id IS NULL;

-- I: Pending and completed order totals.
SELECT status, COUNT(*) AS total_orders FROM orders
GROUP BY status ORDER BY status;

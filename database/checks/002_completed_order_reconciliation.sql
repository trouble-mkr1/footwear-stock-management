-- READ ONLY. Run in the database you intend to inspect.
-- Identifies Completed orders without item lines (included in Dashboard count,
-- but previously omitted from Analytics due to an INNER JOIN).
SELECT o.id AS order_id, o.company_name, o.status, o.completed_at,
       COUNT(oi.id) AS saved_item_lines
FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id
WHERE LOWER(BTRIM(o.status)) = 'completed'
GROUP BY o.id, o.company_name, o.status, o.completed_at
HAVING COUNT(oi.id) = 0
ORDER BY o.id;

-- Delivery dates were introduced by migration 004; no date can be inferred for
-- older completed orders. They remain in all-time totals, not weekly trends.
SELECT COUNT(*) FILTER (WHERE completed_at IS NULL) AS completed_without_date,
       COUNT(*) AS all_completed
FROM orders WHERE LOWER(BTRIM(status)) = 'completed';

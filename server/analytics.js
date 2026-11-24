"use strict";

// Every ranking uses DELIVERED orders only. Values come from historical order
// snapshots, never from today's editable product price.
const delivered = "LOWER(BTRIM(o.status)) = 'completed'";
const ordersFromItems = `FROM orders o JOIN order_items oi ON oi.order_id = o.id WHERE ${delivered}`;

async function getSalesAnalytics(pool) {
    const summary = await pool.query(`
        SELECT COUNT(DISTINCT o.id) AS delivered_orders,
               COALESCE(SUM(oi.quantity),0) AS pairs_delivered,
               COALESCE(SUM(oi.quantity * oi.unit_price) FILTER
                   (WHERE oi.unit_price IS NOT NULL AND oi.unit_price > 0),0) AS known_sales_value,
               COUNT(*) FILTER (WHERE oi.unit_price IS NULL OR oi.unit_price <= 0) AS unpriced_lines,
               COUNT(DISTINCT o.id) FILTER (WHERE o.completed_at IS NULL) AS undated_orders
        ${ordersFromItems}
    `);
    const brands = await pool.query(`
        WITH grouped AS (
            SELECT COALESCE(NULLIF(BTRIM(p.brand), ''), 'Unspecified brand') AS brand,
                   o.id AS order_id, oi.quantity, oi.unit_price
            FROM orders o JOIN order_items oi ON oi.order_id=o.id
            LEFT JOIN products p ON p.art_number=oi.art_number
            WHERE ${delivered}
        )
        SELECT MIN(brand) AS brand, SUM(quantity) AS units,
               COUNT(DISTINCT order_id) AS orders,
               COALESCE(SUM(quantity * unit_price) FILTER
                   (WHERE unit_price IS NOT NULL AND unit_price > 0),0) AS value
        FROM grouped GROUP BY LOWER(brand)
        ORDER BY units DESC, brand LIMIT 10
    `);
    const articles = await pool.query(`
        SELECT oi.art_number, COALESCE(NULLIF(BTRIM(p.brand),''),'Unspecified brand') AS brand,
               SUM(oi.quantity) AS units, COUNT(DISTINCT o.id) AS orders,
               COALESCE(SUM(oi.quantity * oi.unit_price) FILTER
                   (WHERE oi.unit_price IS NOT NULL AND oi.unit_price > 0),0) AS value
        FROM orders o JOIN order_items oi ON oi.order_id=o.id
        LEFT JOIN products p ON p.art_number=oi.art_number
        WHERE ${delivered}
        GROUP BY oi.art_number, p.brand
        ORDER BY units DESC, oi.art_number LIMIT 10
    `);
    const sizes = await pool.query(`
        SELECT oi.size, SUM(oi.quantity) AS units, COUNT(DISTINCT o.id) AS orders
        ${ordersFromItems}
        GROUP BY oi.size ORDER BY units DESC, oi.size LIMIT 10
    `);
    // Old manually-entered shop names are deliberately kept separate from
    // verified customer accounts: a matching name does not prove identity.
    const shops = await pool.query(`
        WITH per_article AS (
            SELECT CASE WHEN o.customer_id IS NOT NULL THEN 'customer:' || o.customer_id::text
                        ELSE 'manual:' || LOWER(BTRIM(o.company_name)) END AS shop_key,
                   MAX(COALESCE(NULLIF(BTRIM(c.shop_name),''),
                       NULLIF(BTRIM(o.company_name),''),'Unnamed shop')) AS shop,
                   oi.art_number, SUM(oi.quantity) AS units,
                   COUNT(DISTINCT o.id) AS orders
            FROM orders o JOIN order_items oi ON oi.order_id=o.id
            LEFT JOIN customers c ON c.id=o.customer_id
            WHERE ${delivered}
            GROUP BY 1, oi.art_number
        ), ranked AS (
            SELECT *, ROW_NUMBER() OVER (PARTITION BY shop_key ORDER BY units DESC, art_number) AS rank,
                   SUM(units) OVER (PARTITION BY shop_key) AS shop_total
            FROM per_article
        )
        SELECT shop, art_number AS top_art_number, units AS top_article_units, shop_total
        FROM ranked WHERE rank=1 ORDER BY shop_total DESC, shop LIMIT 10
    `);
    // Only future deliveries have completed_at. Historical nulls must not
    // silently be treated as if delivery happened when the migration ran.
    const trends = await pool.query(`
        SELECT TO_CHAR(w.week_start,'DD Mon') AS week_label,
               w.week_start::date AS week_start,
               COUNT(DISTINCT o.id) AS orders,
               COALESCE(SUM(oi.quantity),0) AS units
        FROM GENERATE_SERIES(DATE_TRUNC('week',NOW()) - INTERVAL '7 weeks',
                             DATE_TRUNC('week',NOW()), INTERVAL '1 week') AS w(week_start)
        LEFT JOIN orders o ON ${delivered}
            AND o.completed_at >= w.week_start
            AND o.completed_at < w.week_start + INTERVAL '1 week'
        LEFT JOIN order_items oi ON oi.order_id=o.id
        GROUP BY w.week_start ORDER BY w.week_start
    `);

    const s = summary.rows[0];
    return {
        summary: {
            deliveredOrders: Number(s.delivered_orders),
            pairsDelivered: Number(s.pairs_delivered),
            knownSalesValue: Number(s.known_sales_value),
            unpricedLines: Number(s.unpriced_lines),
            undatedOrders: Number(s.undated_orders)
        },
        brands: brands.rows.map(row => ({brand:row.brand,units:Number(row.units),orders:Number(row.orders),value:Number(row.value)})),
        articles: articles.rows.map(row => ({artNumber:row.art_number,brand:row.brand,units:Number(row.units),orders:Number(row.orders),value:Number(row.value)})),
        sizes: sizes.rows.map(row => ({size:Number(row.size),units:Number(row.units),orders:Number(row.orders)})),
        shops: shops.rows.map(row => ({shop:row.shop,topArtNumber:row.top_art_number,topArticleUnits:Number(row.top_article_units),shopTotal:Number(row.shop_total)})),
        trends: trends.rows.map(row => ({weekLabel:row.week_label,orders:Number(row.orders),units:Number(row.units)}))
    };
}

module.exports = { getSalesAnalytics };

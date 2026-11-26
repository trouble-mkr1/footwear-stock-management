"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), {spawnSync} = require("node:child_process");
const root = path.resolve(__dirname, "..");
const read = p => fs.readFileSync(path.join(root, p), "utf8");
for (const filename of ["public/js/customers-admin.js", "public/js/signup.js", "public/js/product-edit.js", "public/js/script.js", "public/js/customer.js", "server/server.js", "server/analytics.js"]) {
    test(`New customer/project JavaScript parses: ${filename}`, () => {
        const result = spawnSync(process.execPath, ["--check", path.join(root, filename)], {encoding:"utf8"});
        assert.equal(result.status, 0, result.stderr);
    });
}
test("Brand filter chips appear below both catalogue searches", () => {
    assert.match(read("public/index.html"), /id="admin-brand-filters"/);
    assert.match(read("public/customer.html"), /id="customer-brand-filters"/);
    assert.match(read("public/js/script.js"), /renderAdminBrandFilters/);
    assert.match(read("public/js/customer.js"), /renderBrandFilters/);
    assert.match(read("public/css/client-updates.css"), /overflow-x:\s*auto/);
    assert.match(read("public/css/client-updates.css"), /aria-pressed/);
});
test("Product deletion is transactional, blocked for pending orders, and preserves invoice history", () => {
    const code = read("server/server.js");
    const start = code.indexOf('app.delete("/api/products/:artNumber"');
    const stop = code.indexOf('app.get("/api/products"', start);
    assert.ok(start > code.indexOf('app.use("/api", requireAdmin)'));
    const route = code.slice(start, stop);
    assert.match(route, /BEGIN/);
    assert.match(route, /FOR UPDATE/);
    assert.match(route, /pending/);
    assert.match(route, /DELETE FROM stock/);
    assert.match(route, /DELETE FROM product_variant/);
    assert.match(route, /DELETE FROM products/);
    assert.match(route, /deleted_products/);
    assert.doesNotMatch(route, /DELETE FROM order_items|DELETE FROM orders/);
    assert.match(read("public/js/product-edit.js"), /HawaUI\.confirm/);
    assert.match(read("public/js/product-edit.js"), /destructive:\s*true/);
    assert.match(read("server/analytics.js"), /LEFT JOIN deleted_products/);
});
test("Customer signup accepts an optional validated GSTIN and directory never returns password hashes", () => {
    const server = read("server/server.js");
    assert.match(read("public/signup.html"), /id="signup-gst"/);
    assert.match(read("public/js/signup.js"), /gst_number/);
    assert.match(server, /INSERT INTO customers \(phone, name, shop_name, address, password_hash, gst_number\)/);
    const start = server.indexOf('app.get("/api/admin/customers"');
    const end = server.indexOf('// Dashboard summary', start);
    assert.ok(start > server.indexOf('app.use("/api", requireAdmin)'));
    assert.doesNotMatch(server.slice(start,end), /password_hash/);
    assert.match(server.slice(start,end), /gst_number/);
    assert.match(read("public/index.html"), /id="customers-button"/);
    assert.match(read("public/index.html"), /id="customers-page"/);
});
test("Migration is additive and archives deleted product identifiers", () => {
    const sql = read("database/migrations/005_customer_gst_product_deletion.sql");
    assert.match(sql, /ADD COLUMN IF NOT EXISTS gst_number/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS deleted_products/);
    assert.doesNotMatch(sql, /DROP TABLE|DELETE FROM customers|DELETE FROM orders/);
});

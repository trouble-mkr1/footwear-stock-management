"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {spawnSync} = require("node:child_process");
const root = path.resolve(__dirname, "..");
const read = filename => fs.readFileSync(path.join(root, filename), "utf8");
const scripts = ["public/js/signup.js", "public/js/customer.js"];
for (const file of scripts) {
    test(`Customer JavaScript syntax: ${file}`, () => {
        const checked = spawnSync(process.execPath, ["--check", path.join(root, file)], {encoding:"utf8"});
        assert.equal(checked.status, 0, checked.stderr || checked.stdout);
    });
}
for (const file of ["public/customer.html", "public/signup.html"]) {
    test(`Customer HTML has unique IDs and valid local assets: ${file}`, () => {
        const content = read(file);
        const ids = [...content.matchAll(/\bid\s*=\s*["']([^"']+)["']/g)].map(x => x[1]);
        assert.equal(ids.length, new Set(ids).size, "Duplicate IDs");
        for (const match of content.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)=["'](\/[^"']+)["']/g)) {
            assert.ok(fs.existsSync(path.join(root,"public",match[1])), `Missing ${match[1]}`);
        }
    });
}
test("Shared login has neutral Username / Phone No. label", () => {
    const html = read("public/login.html");
    assert.match(html, /Username \/ Phone No\./);
    assert.doesNotMatch(html, /Admin Login|Admin Username/i);
});
test("Customer APIs and pages precede global admin API guard", () => {
    const src = read("server/server.js");
    const global = src.indexOf('app.use("/api", requireAdmin)');
    assert.ok(src.indexOf('app.use("/api/customer", requireCustomer)') < global);
    assert.ok(src.indexOf('app.get("/api/customer/products"') < global);
    assert.ok(src.indexOf('app.get("/api/customer/orders"') < global);
    assert.ok(src.indexOf('app.post("/api/customer/orders"') < global);
    assert.ok(src.indexOf('app.post("/api/auth/signup"') < global);
});
test("Customer catalogue responds without quantity fields", () => {
    const src = read("server/server.js");
    const start = src.indexOf('app.get("/api/customer/products"');
    const stop = src.indexOf('function customerOrderStatus', start);
    const route = src.slice(start, stop);
    assert.ok(start >= 0 && stop > start);
    assert.doesNotMatch(route, /s\.quantity|row\.quantity|quantity:\s*row\./);
    assert.match(route, /sizes:\s*row\.sizes/);
});
test("Additive migration keeps old orders and has customer ownership", () => {
    const sql = read("database/migrations/002_customer_accounts.sql");
    assert.match(sql, /ADD COLUMN IF NOT EXISTS customer_id/);
    assert.match(sql, /REFERENCES customers\(id\)/);
    assert.match(sql, /customers_phone_digits_unique_idx/);
    assert.doesNotMatch(sql, /DROP TABLE|DELETE FROM orders/i);
});

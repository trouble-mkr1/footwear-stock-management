"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const publicDir = path.join(root, "public");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

const scripts = [
    "server/server.js", "server/db.js",
    "public/js/auth.js", "public/js/billing.js", "public/js/hawa-ui.js",
    "public/js/login.js", "public/js/orders.js", "public/js/script.js"
];

for (const file of scripts) {
    test(`JavaScript syntax: ${file}`, () => {
        const checked = spawnSync(process.execPath, ["--check", path.join(root, file)], {
            encoding: "utf8"
        });
        assert.equal(checked.status, 0, (checked.stderr || checked.stdout));
    });
}

for (const file of ["public/index.html", "public/billing.html", "public/login.html"]) {
    test(`HTML references exist and IDs are unique: ${file}`, () => {
        const html = read(file);
        const ids = [...html.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map(m => m[1]);
        const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
        assert.deepEqual(duplicates, [], "Duplicate HTML IDs");
        for (const tag of html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)\s*=\s*["'](\/[^"']+)["'][^>]*>/gi)) {
            const asset = tag[1].split(/[?#]/)[0];
            const local = path.resolve(publicDir, `.${asset}`);
            assert.ok(local.startsWith(publicDir + path.sep), "Unsafe asset path");
            assert.ok(fs.existsSync(local), `Missing referenced asset: ${asset}`);
        }
        assert.doesNotMatch(html, /^(?:<<<<<<< |>>>>>>> |=======\s*$)/m, "Git merge marker found");
    });
}

test("Inventory and order forms have exactly one opening and closing form tag", () => {
    const html = read("public/index.html");
    for (const id of ["matrix-form", "order-form"]) {
        assert.equal([...html.matchAll(new RegExp(`<form\\b[^>]*\\bid\\s*=\\s*["']${id}["']`, "g"))].length, 1,
            `Expected one form with ID ${id}`);
    }
    assert.equal([...html.matchAll(/<form\b/gi)].length,
        [...html.matchAll(/<\/form\s*>/gi)].length, "Form opening/closing tags are unbalanced");
});

test("Order filter, product actions and dashboard drill-down elements exist", () => {
    const html = read("public/index.html");
    for (const id of [
        "order-status-filter", "orders-container", "order-items-container", "add-order-item",
        "add-stock-button", "add-new-product-button", "add-new-variant-button",
        "pending-orders-card", "completed-orders-card", "low-stock-card", "low-stock-table-body"
    ]) {
        assert.match(html, new RegExp(`\\bid\\s*=\\s*["']${id}["']`), `Missing ${id}`);
    }
});

test("Authentication guards precede private API routes", () => {
    const server = read("server/server.js");
    const guard = server.indexOf('app.use("/api", requireAdmin)');
    const firstPrivate = server.indexOf('app.get("/api/products"');
    const login = server.indexOf('app.post("/api/auth/login"');
    assert.ok(login >= 0 && guard > login && firstPrivate > guard,
        "Authentication middleware must protect product/order API routes");
});

test("Database migration is checked in", () => {
    assert.ok(fs.existsSync(path.join(root, "database/migrations/001_normalized_colour_unique.sql")));
});

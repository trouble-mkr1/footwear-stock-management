"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = rel => fs.readFileSync(path.join(root, rel), "utf8");

test("Customer cart has desktop panel and accessible mobile drawer controls", () => {
    const html = read("public/customer.html");
    for (const id of ["customer-shopping-layout", "customer-cart-panel", "mobile-cart-toggle", "close-cart-button", "customer-cart-backdrop", "cart-stock-error"]) {
        assert.match(html, new RegExp(`(?:id|class)="[^"]*\\b${id}\\b`), `Missing ${id}`);
    }
    assert.match(html, /aria-controls="customer-cart-panel"/);
    assert.match(html, /role="alert"/);
});

test("Customer order page provides sticky cart and fixed mobile View Order", () => {
    const css = read("public/css/customer.css");
    assert.match(css, /\.customer-shopping-layout/);
    assert.match(css, /position:sticky/);
    assert.match(css, /\.mobile-cart-toggle\{position:fixed/);
    assert.match(css, /\.cart-item-stock-issue/);
});

test("Customer checkout highlights the exact unavailable cart item", () => {
    const js = read("public/js/customer.js");
    assert.match(js, /INSUFFICIENT_STOCK/);
    assert.match(js, /sameCartItem/);
    assert.match(js, /setCartOpen\(true\)/);
    assert.match(js, /cart-stock-error/);
});

test("Customer insufficient-stock API reports art, colour and size but not stock number", () => {
    const server = read("server/server.js");
    const start = server.indexOf('app.post("/api/customer/orders"');
    const end = server.indexOf('// All API routes below this point', start);
    assert.ok(start >= 0 && end > start);
    const route = server.slice(start, end);
    assert.match(route, /INSUFFICIENT_STOCK/);
    assert.match(route, /art_number: item\.artNumber, colour: item\.colour, size: item\.size/);
    assert.match(route, /quantity >= \$1/);
    assert.doesNotMatch(route, /available_quantity|remaining_quantity|response\.quantity/);
    assert.match(route, /rollbackQuietly\(client\)/);
});

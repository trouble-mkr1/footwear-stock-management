"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = name => fs.readFileSync(path.join(root, name), "utf8");

test("Billing sidebar links to Analytics and Customers", () => {
    const html = read("public/billing.html");
    assert.match(html, /\?page=analytics/);
    assert.match(html, /\?page=customers/);
    const index = read("public/index.html");
    assert.match(index, /\/js\/admin-deeplink\.js/);
    assert.ok(index.indexOf("/js/admin-deeplink.js") > index.indexOf("/js/customers-admin.js"));
});

test("Customer account editor has accessible initials button, fields and CSS", () => {
    const html = read("public/customer.html");
    for (const id of ["customer-profile-button", "customer-initials", "customer-profile-dialog", "customer-profile-form", "profile-name", "profile-phone", "profile-shop", "profile-address", "profile-gst", "profile-save"]) {
        assert.match(html, new RegExp(`id="${id}"`));
    }
    assert.match(html, /customer-account\.css/);
    const css = read("public/css/customer-account.css");
    assert.match(css, /\.welcome-banner \.welcome-mark/);
    const js = read("public/js/customer.js");
    assert.match(js, /function shopInitials/);
    assert.match(js, /showModal\(/);
    assert.match(js, /method: "PUT"/);
});

test("Only logged-in customer can update name shop address GST, not identity", () => {
    const server = read("server/server.js");
    assert.ok(server.indexOf('app.put("/api/customer/profile"') > server.indexOf('app.use("/api/customer", requireCustomer)'));
    const route = server.slice(server.indexOf('app.put("/api/customer/profile"'), server.indexOf('app.get("/api/customer/contact"'));
    assert.match(route, /WHERE id=\$5 RETURNING name, shop_name, phone, address, gst_number/);
    assert.doesNotMatch(route, /UPDATE customers SET.*password_hash/);
    assert.match(route, /gst_number/);
});

test("Signup redirects to unified login and allows eight-character passwords", () => {
    assert.match(read("public/js/signup.js"), /window\.location\.replace\("\/\?signup=success"\)/);
    assert.match(read("public/js/login.js"), /login-success/);
    assert.match(read("public/signup.html"), /minlength="8"/);
    assert.match(read("server/server.js"), /password\.length < 8/);
});

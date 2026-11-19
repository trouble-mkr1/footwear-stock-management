"use strict";

// EXPLICIT OPT-IN. This file writes test records into a disposable PostgreSQL database.
// Never run it against your normal footwear_inventory_new database.
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");

require("dotenv").config({ path: path.join(__dirname, "../.env") });
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

const root = path.resolve(__dirname, "..");
const testDb = process.env.TEST_DB_NAME;

function requireDedicatedDatabase() {
    if (process.env.RUN_DB_TESTS !== "YES_I_WANT_TO_TEST") {
        throw new Error("Integration tests are disabled. Set RUN_DB_TESTS=YES_I_WANT_TO_TEST explicitly.");
    }
    if (!testDb || !/^[a-z][a-z0-9_]*_test$/i.test(testDb) ||
        testDb === process.env.DB_NAME) {
        throw new Error("Set TEST_DB_NAME to a dedicated database ending with _test (different from DB_NAME).");
    }
}

async function findUnusedPort() {
    const server = net.createServer();
    return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
            const port = server.address().port;
            server.close(() => resolve(port));
        });
    });
}

async function pollUntilReady(url, child) {
    for (let n = 0; n < 80; n++) {
        if (child.exitCode !== null) throw new Error(`Server exited with code ${child.exitCode}`);
        try {
            const response = await fetch(`${url}/api/auth/session`);
            if (response.ok) return;
        } catch (_) { /* Server still starting */ }
        await new Promise(resolve => setTimeout(resolve, 150));
    }
    throw new Error("Test server did not become ready");
}

// One test sequence keeps state changes deterministic and always cleans up fixtures.
test("Order API lifecycle against an isolated PostgreSQL test database", { timeout: 90000 }, async t => {
    requireDedicatedDatabase();

    const pool = new Pool({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 5432),
        database: testDb,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD
    });
    let child;
    const suffix = crypto.randomBytes(5).toString("hex");
    const art = `TEST_${suffix}`;
    const company = `Automated fixture ${suffix}`;
    let variantId;
    let cookie;
    let base;
    let output = "";

    async function currentQty() {
        const r = await pool.query("SELECT quantity FROM stock WHERE variant_id=$1 AND size=8", [variantId]);
        return Number(r.rows[0]?.quantity);
    }
    async function api(method, route, payload, authenticated = true) {
        const headers = {};
        if (authenticated && cookie) headers.Cookie = cookie;
        if (payload !== undefined) headers["Content-Type"] = "application/json";
        const response = await fetch(base + route, {
            method, headers, body: payload === undefined ? undefined : JSON.stringify(payload)
        });
        let body;
        try { body = await response.json(); } catch (_) { body = null; }
        return { status: response.status, body, headers: response.headers };
    }
    const item = quantity => [{ art_number: art, colour: "Blue", size: 8, quantity }];

    try {
        // Verify what PostgreSQL actually connected to BEFORE any test writes.
        const identity = await pool.query("SELECT current_database() AS name");
        assert.equal(identity.rows[0].name, testDb, "Unexpected DB connection — refusing writes");
        assert.ok(testDb.endsWith("_test"));

        // Seed unique records in dedicated DB only.
        await pool.query("INSERT INTO products (art_number, price, mrp) VALUES ($1, $2, $3)",
            [art, 499.99, 799.99]);
        const vr = await pool.query(
            "INSERT INTO product_variant (art_number, colour, image) VALUES ($1,$2,$3) RETURNING id",
            [art, "Blue", "test-fixture.jpg"]);
        variantId = vr.rows[0].id;
        await pool.query("INSERT INTO stock (variant_id, size, quantity) VALUES ($1,8,20)", [variantId]);

        const port = await findUnusedPort();
        base = `http://127.0.0.1:${port}`;
        const adminUser = "integration_admin";
        const adminPassword = `Test-${crypto.randomBytes(16).toString("hex")}`;
        const hash = await bcrypt.hash(adminPassword, 10);
        child = spawn(process.execPath, [path.join(root, "server/server.js")], {
            cwd: root,
            env: {
                ...process.env,
                DB_NAME: testDb,
                ADMIN_USERNAME: adminUser,
                ADMIN_PASSWORD_HASH: hash,
                SESSION_SECRET: crypto.randomBytes(32).toString("hex"),
                NODE_ENV: "test", PORT: String(port)
            },
            stdio: ["ignore", "pipe", "pipe"]
        });
        child.stdout.on("data", data => { output = (output + data.toString()).slice(-4000); });
        child.stderr.on("data", data => { output = (output + data.toString()).slice(-4000); });
        await pollUntilReady(base, child);

        await t.test("Health endpoint reports PostgreSQL readiness without authentication", async () => {
            const r = await api("GET", "/healthz", undefined, false);
            assert.equal(r.status, 200, JSON.stringify(r.body));
            assert.deepEqual(r.body, { status: "ok" });
        });
        await t.test("Private API requires login", async () => {
            assert.equal((await api("GET", "/api/products", undefined, false)).status, 401);
            assert.equal((await api("POST", "/api/orders", {
                company_name: company, address: "test", items: item(1)
            }, false)).status, 401);
        });
        await t.test("Login validates credentials and saves session", async () => {
            assert.equal((await api("POST", "/api/auth/login", {
                username: adminUser, password: "wrong"
            }, false)).status, 401);
            const result = await api("POST", "/api/auth/login", {
                username: adminUser, password: adminPassword
            }, false);
            assert.equal(result.status, 200, JSON.stringify(result.body));
            cookie = result.headers.get("set-cookie")?.split(";")[0];
            assert.ok(cookie?.startsWith("footwear.sid="), "Session cookie not returned");
            assert.equal((await api("GET", "/api/auth/session")).body.authenticated, true);
        });
        await t.test("Invalid and over-stock order requests do not change stock", async () => {
            assert.equal((await api("POST", "/api/orders", {
                company_name: company, address: "test", items: []
            })).status, 400);
            const bad = await api("POST", "/api/orders", {
                company_name: company, address: "test", items: item(50)
            });
            assert.equal(bad.status, 409, JSON.stringify(bad.body));
            assert.equal(await currentQty(), 20);
        });

        let orderId;
        await t.test("Create order deducts stock and captures price", async () => {
            const r = await api("POST", "/api/orders", {
                company_name: company, address: "test", items: item(3)
            });
            assert.equal(r.status, 201, JSON.stringify(r.body));
            orderId = r.body.order_id;
            assert.ok(Number.isInteger(Number(orderId)));
            assert.equal(await currentQty(), 17);
            const details = await api("GET", `/api/orders/${orderId}`);
            assert.equal(details.status, 200);
            assert.equal(Number(details.body.items[0].unit_price), 499.99);
        });
        await t.test("Edit changes stock, but keeps historical unit price", async () => {
            await pool.query("UPDATE products SET price = 600 WHERE art_number=$1", [art]);
            const r = await api("PUT", `/api/orders/${orderId}`, {
                company_name: company, address: "revised", items: item(5)
            });
            assert.equal(r.status, 200, JSON.stringify(r.body));
            assert.equal(await currentQty(), 15);
            const details = await api("GET", `/api/orders/${orderId}`);
            assert.equal(Number(details.body.items[0].unit_price), 499.99);
        });
        await t.test("Failed edit rolls back quantities and original order", async () => {
            const r = await api("PUT", `/api/orders/${orderId}`, {
                company_name: company, address: "invalid", items: item(999)
            });
            assert.equal(r.status, 409, JSON.stringify(r.body));
            assert.equal(await currentQty(), 15);
            const details = await api("GET", `/api/orders/${orderId}`);
            assert.equal(Number(details.body.items[0].quantity), 5);
            assert.equal(details.body.address, "revised");
        });
        await t.test("Delete pending order restores stock", async () => {
            const r = await api("DELETE", `/api/orders/${orderId}`);
            assert.equal(r.status, 200, JSON.stringify(r.body));
            assert.equal(await currentQty(), 20);
        });
        await t.test("Completed order cannot be edited or deleted", async () => {
            const c = await api("POST", "/api/orders", {
                company_name: company, address: "test", items: item(2)
            });
            assert.equal(c.status, 201, JSON.stringify(c.body));
            const id = c.body.order_id;
            assert.equal(await currentQty(), 18);
            assert.equal((await api("PUT", `/api/orders/${id}/complete`)).status, 200);
            assert.equal((await api("DELETE", `/api/orders/${id}`)).status, 409);
            assert.equal((await api("PUT", `/api/orders/${id}`, {
                company_name: company, address: "test", items: item(1)
            })).status, 409);
            assert.equal(await currentQty(), 18);
        });
    } catch (err) {
        err.message += `\nTest server output:\n${output}`;
        throw err;
    } finally {
        if (child && child.exitCode === null) child.kill();
        // Clean up ONLY our isolated fixture, even after a failed assertion.
        // Test order IDs are located using their unique company name.
        try {
            if (variantId !== undefined) {
                await pool.query("DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE company_name=$1)", [company]);
                await pool.query("DELETE FROM orders WHERE company_name=$1", [company]);
                await pool.query("DELETE FROM stock WHERE variant_id=$1", [variantId]);
                await pool.query("DELETE FROM product_variant WHERE id=$1", [variantId]);
                await pool.query("DELETE FROM products WHERE art_number=$1", [art]);
            } else {
                await pool.query("DELETE FROM products WHERE art_number=$1", [art]);
            }
        } catch (cleanupError) {
            console.error("Test fixture cleanup failed:", cleanupError);
        }
        await pool.end();
    }
});

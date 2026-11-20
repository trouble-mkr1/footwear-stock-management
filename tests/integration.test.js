"use strict";

// EXPLICIT OPT-IN. This file writes test records into a disposable PostgreSQL database.
// Never run it against your normal footwear_inventory_new database.
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const net = require("node:net");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
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
    const matrixArt = `TESTM_${suffix}`;
    const tempImageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hawa-inventory-test-'));
    const company = `Automated fixture ${suffix}`;
    let variantId;
    let cookie;
    let customerCookie;
    let otherCustomerCookie;
    const customerPhone = String(crypto.randomInt(1000000000, 9999999999));
    const otherPhone = String(crypto.randomInt(1000000000, 9999999999));
    let customerId;
    let otherCustomerId;
    const shopName = `${company} customer shop`;
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
    async function customerApi(method, route, payload, useOtherCustomer = false) {
        const headers = { Cookie: useOtherCustomer ? otherCustomerCookie : customerCookie };
        if (payload !== undefined) headers["Content-Type"] = "application/json";
        const response = await fetch(base + route, {
            method, headers, body: payload === undefined ? undefined : JSON.stringify(payload)
        });
        return {
            status: response.status,
            body: await response.json().catch(() => null),
            headers: response.headers
        };
    }

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
                NODE_ENV: "test", PORT: String(port), IMAGE_UPLOAD_DIR: tempImageDir
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
        async function bulk(mode, data, numberOfImages = 0) {
            const form = new FormData();
            form.append('data', JSON.stringify({ mode, ...data }));
            const jpg = fs.readFileSync(path.join(root, 'public/images/Blue-1001.jpg'));
            for (let n = 0; n < numberOfImages; n++) {
                form.append('images', new Blob([jpg], { type:'image/jpeg' }), `test-${n}.jpg`);
            }
            const response = await fetch(base + '/api/inventory/bulk', {
                method:'POST', headers: {Cookie:cookie}, body:form
            });
            return {status:response.status, body:await response.json()};
        }
        await t.test('Bulk inventory rejects duplicates and rolls back without leaving uploads', async () => {
            const bad = await bulk('product', {
                art_number:matrixArt,brand:'Test Brand',price:499,mrp:799,tags:['Men'],
                variants:[{colour:'Black',sizes:[{size:8,quantity:10},{size:8,quantity:2}]}]
            }, 1);
            assert.equal(bad.status, 400, JSON.stringify(bad.body));
            assert.equal((await pool.query('SELECT * FROM products WHERE art_number=$1',[matrixArt])).rowCount,0);
            // Image unlink is asynchronous; allow it to complete before asserting.
            for (let n=0; n<25 && fs.readdirSync(tempImageDir).length; n++)
                await new Promise(resolve => setTimeout(resolve,20));
            assert.equal(fs.readdirSync(tempImageDir).length,0);
        });
        await t.test('Bulk new product persists multi-colour sizes, brand and tags', async () => {
            const result = await bulk('product', {
                art_number:matrixArt,brand:'Test Brand',price:499,mrp:799,tags:['Men','Sports'],
                variants:[
                    {colour:'Black',sizes:[{size:6,quantity:10},{size:9,quantity:5}]},
                    {colour:'Brown',sizes:[{size:8,quantity:3}]}
                ]
            }, 2);
            assert.equal(result.status,201,JSON.stringify(result.body));
            const admin = await api('GET','/api/products');
            const found=admin.body.find(p=>p.art_number===matrixArt);
            assert.equal(found.brand,'Test Brand');
            assert.deepEqual(found.tags,['Men','Sports']);
            assert.equal(found.variants.length,2);
            assert.equal(found.variants.find(v=>v.colour==='Black').stock.length,2);
        });
        await t.test('Bulk stock increments sizes and a new colour can be added', async () => {
            const stock = await bulk('stock',{
                art_number:matrixArt,variants:[{colour:'Black',sizes:[{size:6,quantity:2},{size:7,quantity:9}]}]
            });
            assert.equal(stock.status,200,JSON.stringify(stock.body));
            const colour = await bulk('colour', {
                art_number:matrixArt,variants:[{colour:'Green',sizes:[{size:8,quantity:4}]}]
            },1);
            assert.equal(colour.status,201,JSON.stringify(colour.body));
            const rows=await pool.query(`SELECT pv.colour,s.size,s.quantity FROM stock s
                JOIN product_variant pv ON pv.id=s.variant_id WHERE pv.art_number=$1`,[matrixArt]);
            assert.equal(Number(rows.rows.find(r=>r.colour==='Black' && r.size===6).quantity),12);
            assert.equal(Number(rows.rows.find(r=>r.colour==='Black' && r.size===7).quantity),9);
            assert.equal(Number(rows.rows.find(r=>r.colour==='Green' && r.size===8).quantity),4);
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

        await t.test("Customers can sign up by phone and cannot pick an admin role", async () => {
            const sign = await api("POST", "/api/auth/signup", {
                phone: customerPhone, name: "Test Customer", shop_name: shopName,
                address: "Test customer address", password: "CustomerPassword-123", role: "admin"
            }, false);
            assert.equal(sign.status, 201, JSON.stringify(sign.body));
            const dbCustomer = await pool.query("SELECT id, password_hash FROM customers WHERE phone=$1", [customerPhone]);
            customerId = dbCustomer.rows[0].id;
            assert.ok(dbCustomer.rows[0].password_hash.startsWith("$2"));
            const secondSignup = await api("POST", "/api/auth/signup", {
                phone: customerPhone, name: "Duplicate", shop_name: shopName,
                address: "Test", password: "CustomerPassword-123"
            }, false);
            assert.equal(secondSignup.status, 409);
        });
        await t.test("Shared login creates a customer session and rejects bad passwords", async () => {
            const bad = await api("POST", "/api/auth/login", {
                username: customerPhone, password: "incorrect-password"
            }, false);
            assert.equal(bad.status, 401);
            const logged = await api("POST", "/api/auth/login", {
                username: customerPhone, password: "CustomerPassword-123"
            }, false);
            assert.equal(logged.status, 200, JSON.stringify(logged.body));
            assert.equal(logged.body.role, "customer");
            assert.equal(logged.body.redirect, "/customer");
            customerCookie = logged.headers.get("set-cookie")?.split(";")[0];
            assert.ok(customerCookie?.startsWith("footwear.sid="));
            const status = await customerApi("GET", "/api/auth/session");
            assert.equal(status.body.role, "customer");
            assert.equal(status.body.authenticated, true);
        });
        await t.test("Customer can only access customer APIs and never sees stock numbers", async () => {
            assert.equal((await customerApi("GET", "/api/products")).status, 401);
            assert.equal((await customerApi("GET", "/api/orders")).status, 401);
            assert.equal((await customerApi("GET", "/api/dashboard")).status, 401);
            assert.equal((await api("GET", "/api/customer/products")).status, 401,
                "Admin must not be treated as customer");
            const products = await customerApi("GET", "/api/customer/products");
            assert.equal(products.status, 200, JSON.stringify(products.body));
            const testProduct = products.body.find(p => p.art_number === art);
            assert.ok(testProduct, "Test product missing from catalogue");
            assert.deepEqual(testProduct.variants[0].sizes, [8]);
            assert.equal(JSON.stringify(products.body).includes('"quantity"'), false);
            assert.equal(JSON.stringify(products.body).includes('"stock"'), false);
        });
        await t.test("Over-stock customer order rolls back without exposing the stock count", async () => {
            const before = await currentQty();
            const r = await customerApi("POST", "/api/customer/orders", {items: item(999)});
            assert.equal(r.status, 409, JSON.stringify(r.body));
            assert.match(r.body.error, /Not enough stock/);
            assert.equal(await currentQty(), before);
            const partial = await customerApi("POST", "/api/customer/orders", {
                items: [...item(1), ...item(999)]
            });
            assert.equal(partial.status, 409);
            assert.equal(await currentQty(), before);
        });
        await t.test("Customer order uses account identity and is not editable by customer", async () => {
            const r = await customerApi("POST", "/api/customer/orders", {
                company_name: "Spoofed shop", address: "Spoofed address", items: item(3)
            });
            assert.equal(r.status, 201, JSON.stringify(r.body));
            const data = await pool.query("SELECT customer_id, company_name, address, status FROM orders WHERE id=$1", [r.body.order_id]);
            assert.equal(data.rows[0].customer_id, customerId);
            assert.equal(data.rows[0].company_name, shopName);
            assert.equal(data.rows[0].address, "Test customer address");
            assert.equal(await currentQty(), 15);
            const listing = await customerApi("GET", "/api/customer/orders");
            assert.equal(listing.status, 200);
            assert.equal(listing.body.find(o => o.id === r.body.order_id).status, "Yet to Receive");
            assert.equal((await customerApi("PUT", `/api/orders/${r.body.order_id}`, {
                company_name: shopName, address: "x", items: item(1)
            })).status, 401);
            assert.equal((await customerApi("DELETE", `/api/orders/${r.body.order_id}`)).status, 401);
        });
        await t.test("Other customers cannot see someone else's order history", async () => {
            const sign = await api("POST", "/api/auth/signup", {
                phone: otherPhone, name: "Other Customer", shop_name: "Unrelated Shop",
                address: "Somewhere else", password: "CustomerPassword-456"
            }, false);
            assert.equal(sign.status, 201, JSON.stringify(sign.body));
            otherCustomerId = (await pool.query("SELECT id FROM customers WHERE phone=$1", [otherPhone])).rows[0].id;
            const login = await api("POST", "/api/auth/login", {
                username: otherPhone, password: "CustomerPassword-456"
            }, false);
            assert.equal(login.status, 200, JSON.stringify(login.body));
            otherCustomerCookie = login.headers.get("set-cookie")?.split(";")[0];
            const orders = await customerApi("GET", "/api/customer/orders", undefined, true);
            assert.equal(orders.status, 200);
            assert.deepEqual(orders.body, []);
        });
        await t.test("Admin completion displays as Received; reorder is a NEW order", async () => {
            const before = await customerApi("GET", "/api/customer/orders");
            const id = before.body[0].id;
            assert.equal((await api("PUT", `/api/orders/${id}/complete`)).status, 200);
            const delivered = await customerApi("GET", "/api/customer/orders");
            assert.equal(delivered.body.find(o => o.id === id).status, "Received");
            const reorder = await customerApi("POST", "/api/customer/orders", {items: item(2)});
            assert.equal(reorder.status, 201, JSON.stringify(reorder.body));
            assert.notEqual(reorder.body.order_id, id);
            assert.equal(await currentQty(), 13);
        });
    } catch (err) {
        err.message += `\nTest server output:\n${output}`;
        throw err;
    } finally {
        if (child && child.exitCode === null) child.kill();
        // Clean up ONLY our isolated fixture, even after a failed assertion.
        // Test order IDs are located using their unique company name.
        try {
            // Delete customer fixture orders before the customer rows (FK restrict).
            for (const phone of [customerPhone, otherPhone]) {
                const customers = await pool.query("SELECT id FROM customers WHERE phone=$1", [phone]);
                for (const row of customers.rows) {
                    await pool.query("DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE customer_id=$1)", [row.id]);
                    await pool.query("DELETE FROM orders WHERE customer_id=$1", [row.id]);
                    await pool.query("DELETE FROM customers WHERE id=$1", [row.id]);
                }
            }
            // Bulk matrix fixture and its tags/images are separate from the order fixture.
            await pool.query('DELETE FROM stock WHERE variant_id IN (SELECT id FROM product_variant WHERE art_number=$1)',[matrixArt]);
            await pool.query('DELETE FROM product_variant WHERE art_number=$1',[matrixArt]);
            await pool.query('DELETE FROM product_tags WHERE art_number=$1',[matrixArt]);
            await pool.query('DELETE FROM products WHERE art_number=$1',[matrixArt]);
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
        fs.rmSync(tempImageDir,{recursive:true,force:true});
    }
});

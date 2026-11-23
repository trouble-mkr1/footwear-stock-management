"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = name => fs.readFileSync(path.join(root, name), "utf8");
const { buildInvoicePdf } = require("../server/invoice-pdf");

test("Checkout prechecks all cart lines and groups repeated variant/size quantities", () => {
    const server = read("server/server.js");
    const route = server.slice(server.indexOf('app.post("/api/customer/orders"'), server.indexOf("// All API routes below this point"));
    assert.match(route, /const problems = \[\]/);
    assert.match(route, /grouped\.get\(key\)\.required \+= item\.quantity/);
    assert.match(route, /FOR UPDATE/);
    assert.match(route, /if \(problems\.length\)/);
    assert.match(route, /response\.issues = error\.issues/);
    assert.match(route, /rollbackQuietly\(client\)/);
    assert.doesNotMatch(route, /available_quantity|remaining_quantity/);
});

test("Customer cart displays every returned issue without revealing stock counts", () => {
    const customer = read("public/js/customer.js");
    assert.match(customer, /Array\.isArray\(error\.issues\)/);
    assert.match(customer, /state\.stockIssues\.some\(/);
    assert.match(customer, /state\.stockIssues = issues\.map/);
    assert.match(customer, /clearStockIssue\(item\)/);
    assert.match(customer, /cart-stock-issue-list/);
});

test("Share PDF is preloaded after choosing an order and supports native share or download", () => {
    const html = read("public/billing.html");
    const js = read("public/js/billing.js");
    assert.match(html, /id="share-invoice-pdf"/);
    assert.match(js, /\.canShare\?\.\(\{ files: \[file\] \}\)/);
    assert.match(js, /await navigator\.share/);
    assert.match(js, /downloadPreparedPdf/);
    assert.match(js, /preparedPdf = new File/);
});

test("PDF generator produces valid PDF bytes with preserved unit price and totals", () => {
    const invoice = {
        id: 145, company_name: "Test Shop", address: "South Market Road", status: "Pending",
        items: [{art_number:"1001", colour:"Blue", size:8, quantity:2, unit_price:"499.00", mrp:"699.00"}]
    };
    const pdf = buildInvoicePdf(invoice);
    assert.ok(Buffer.isBuffer(pdf));
    assert.ok(pdf.subarray(0, 8).toString("ascii").startsWith("%PDF-1.4"));
    assert.ok(pdf.includes(Buffer.from("HAWA TRADERS")));
    assert.ok(pdf.includes(Buffer.from("998.00")));
    assert.ok(pdf.includes(Buffer.from("/Count 1")));
    assert.ok(pdf.includes(Buffer.from("startxref")));
    assert.ok(pdf.length > 1500);
});

test("PDF generator rejects missing historical prices rather than printing Rs. 0", () => {
    assert.throws(() => buildInvoicePdf({id:1, items:[
        {art_number:"1001",colour:"Blue",size:8,quantity:2,unit_price:null,mrp:null}
    ]}), /missing or invalid/);
});

test("Invoice PDF endpoint is behind admin API guard and does not cache files", () => {
    const server = read("server/server.js");
    const guard = server.indexOf('app.use("/api", requireAdmin)');
    const invoice = server.indexOf('app.get("/api/billing/orders/:id/pdf"');
    assert.ok(invoice > guard, "Invoice PDF must require admin authentication");
    assert.match(server.slice(invoice, invoice + 1500), /Content-Disposition/);
    assert.match(server.slice(invoice, invoice + 1500), /private, no-store/);
});

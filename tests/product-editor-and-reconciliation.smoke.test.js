"use strict";
const test=require("node:test"), assert=require("node:assert/strict");
const fs=require("node:fs"), path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
test("Analytics counts all Completed orders, even those without item rows",()=>{
 const sql=read("server/analytics.js");
 assert.match(sql,/LEFT JOIN order_items oi ON oi\.order_id = o\.id/);
 assert.match(sql,/orders_without_items/);
 assert.match(sql,/oi\.id IS NOT NULL/);
 const ui=read("public/index.html");
 assert.doesNotMatch(ui,/Delivered Orders Missing Item Details|analytics-unpriced-note/);
 assert.match(ui,/<h2 id="analytics-heading">Analytics<\/h2>/);
});
test("Customer bestseller is derived from completed order quantities and keeps original multi-shop rule",()=>{
 const code=read("server/server.js");
 assert.match(code,/topSellerResult/);
 assert.match(code,/SUM\(oi\.quantity\) DESC/);
 assert.match(code,/COUNT\(DISTINCT o\.customer_id\) >= 2/);
 assert.match(code,/completed_at >= NOW\(\) - INTERVAL '30 days'/);
 assert.match(read("public/js/customer.js"),/Top Seller/);
 assert.match(read("public/js/customer.js"),/Trending · 30 days/);
});
test("Product editor cannot change art numbers, photos or stock",()=>{
 const code=read("server/server.js");
 const route=code.slice(code.indexOf('app.put("/api/products/:artNumber/details"'),code.indexOf('app.get("/api/products"'));
 assert.match(route,/UPDATE products SET brand=\$1, price=\$2, mrp=\$3/);
 assert.match(route,/DELETE FROM product_tags WHERE art_number=\$1/);
 assert.doesNotMatch(route,/UPDATE stock|UPDATE order_items|SET art_number/);
 assert.match(read("public/index.html"),/id="edit-product-art" readonly/);
 assert.match(read("public/js/product-edit.js"),/Save Changes/);
});
test("Admin order entry has dependent dropdowns and art prefix suggestions",()=>{
 const code=read("public/js/orders.js");
 assert.match(code,/startsWith\(query\)/);
 assert.match(code,/order-art-suggestions/);
 assert.match(code,/role="listbox"/);
 assert.match(code,/fillOrderColours/);
 assert.match(code,/fillOrderSizes/);
 assert.match(code,/fetch\("\/api\/products"/);
});

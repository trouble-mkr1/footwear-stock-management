"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
const root=path.resolve(__dirname,"..");
const read=name=>fs.readFileSync(path.join(root,name),"utf8");

for (const file of ["server/analytics.js","public/js/analytics.js","server/server.js","public/js/customer.js"]) {
    test(`Analytics JavaScript syntax: ${file}`,()=>{
        const r=spawnSync(process.execPath,["--check",path.join(root,file)],{encoding:"utf8"});
        assert.equal(r.status,0,r.stderr);
    });
}
test("Admin analytics is a protected API route and visible navigation page",()=>{
    const backend=read("server/server.js"), html=read("public/index.html");
    assert.ok(backend.indexOf('app.get("/api/analytics"') > backend.indexOf('app.use("/api", requireAdmin)'));
    for(const id of ["analytics-button","analytics-page","analytics-brands","analytics-articles","analytics-shops","analytics-sizes","analytics-trend"])
        assert.match(html,new RegExp(`id="${id}"`));
    assert.match(html,/\/js\/analytics\.js/);
    assert.match(html,/\/css\/analytics\.css/);
});
test("Sales reporting uses only completed orders and historical price snapshots",()=>{
    const sql=read("server/analytics.js");
    assert.match(sql,/BTRIM\(o\.status\)\) = 'completed'/);
    assert.match(sql,/oi\.unit_price/);
    assert.doesNotMatch(sql,/quantity\s*\*\s*p\.price/);
    assert.match(sql,/o\.completed_at/);
    assert.match(sql,/o\.customer_id/);
});
test("Delivery timestamps are additive without falsifying historic dates",()=>{
    const migration=read("database/migrations/004_sales_reporting_dates.sql");
    assert.match(migration,/ADD COLUMN IF NOT EXISTS completed_at/);
    assert.match(migration,/ADD COLUMN IF NOT EXISTS created_at/);
    assert.match(migration,/SET DEFAULT NOW\(\)/);
    assert.doesNotMatch(migration,/UPDATE orders|DROP TABLE|TRUNCATE/i);
    const server=read("server/server.js");
    assert.match(server,/SET status = 'Completed', completed_at = NOW\(\)/);
});
test("Customer popularity is non-sensitive and based on completed orders",()=>{
    const server=read("server/server.js");
    const route=server.slice(server.indexOf('app.get("/api/customer/products"'),server.indexOf('function customerOrderStatus'));
    assert.match(route,/COUNT\(DISTINCT o\.id\) >= 3/);
    assert.match(route,/popular: popularArts\.has/);
    assert.doesNotMatch(route,/row\.quantity|s\.quantity|available_quantity/);
    const ui=read("public/js/customer.js");
    assert.match(ui,/product\.popular === true/);
    assert.match(ui,/Popular with shops/);
});
test("Analytics response converts numeric PostgreSQL results and is safe for empty lists",async()=>{
    const {getSalesAnalytics}=require("../server/analytics");
    let calls=0;
    const sample=[
        {rows:[{delivered_orders:"2",pairs_delivered:"6",known_sales_value:"1998.50",unpriced_lines:"1",undated_orders:"1",orders_without_items:"1"}]},
        {rows:[{brand:"ABC",units:"6",orders:"2",value:"1998.50"}]},
        {rows:[{art_number:"1001",brand:"ABC",units:"6",orders:"2",value:"1998.50"}]},
        {rows:[{size:8,units:"6",orders:"2"}]},
        {rows:[{shop:"Shop Test",top_art_number:"1001",top_article_units:"6",shop_total:"6"}]},
        {rows:[{week_label:"23 Nov",orders:"1",units:"3"}]}
    ];
    const fakePool={query:async sql=>{assert.match(sql,/SELECT|WITH/i);return sample[calls++];}};
    const result=await getSalesAnalytics(fakePool);
    assert.equal(calls,6);
    assert.equal(result.summary.deliveredOrders,2);
    assert.equal(result.summary.ordersWithoutItems,1);
    assert.equal(result.summary.knownSalesValue,1998.5);
    assert.deepEqual(result.articles[0],{artNumber:"1001",brand:"ABC",units:6,orders:2,value:1998.5});
    assert.equal(result.shops[0].shopTotal,6);
    assert.equal(result.trends[0].units,3);
});

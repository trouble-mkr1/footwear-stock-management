"use strict";
const test=require("node:test"), assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");
test("Analytics shows only three concise KPIs",()=>{
 const html=read("public/index.html");
 assert.match(html,/<h2 id="analytics-heading">Analytics<\/h2>/);
 assert.doesNotMatch(html,/Delivered Orders Missing Item Details|analytics-unpriced-note|analytics-subtitle/);
 assert.match(read("public/css/analytics.css"),/repeat\(3,minmax\(0,1fr\)\)/);
});
test("Low stock and out of stock have separate cards and lists",()=>{
 const html=read("public/index.html");
 for(const id of ["out-stock-card","out-stock","out-stock-panel","out-stock-table-body","close-out-stock"]) {
  assert.match(html,new RegExp(`id="${id}"`));
 }
 const code=read("public/js/script.js");
 assert.match(code,/renderStockTable\(data\.outStockProducts/);
 assert.match(code,/connectStockPanel\("out-stock-card"/);
 const backend=read("server/server.js");
 assert.match(backend,/product\.total_stock === 0/);
 assert.match(backend,/outStock: outStockProducts\.length/);
 assert.match(backend,/lowStock: lowStockProducts\.length/);
});

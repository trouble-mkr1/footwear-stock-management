'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('Backend accepts new colour and stock in one transaction and validates image count', () => {
    const s = read('server/server.js');
    const route = s.slice(s.indexOf("app.post('/api/inventory/bulk'"), s.indexOf('app.get("/api/products"'));
    assert.match(route, /newColour: mode === 'stock' && v\.new_colour === true/);
    assert.match(route, /variants\.filter\(v => v\.newColour\)\.length/);
    assert.match(route, /nextNewColourImage\+\+/);
    assert.match(route, /await client\.query\('BEGIN'\)/);
    assert.match(route, /await client\.query\('COMMIT'\)/);
});
test('Stock form requests image only for new colours; arbitrary sizes preserved', () => {
    const s = read('public/js/inventory-matrix.js');
    assert.match(s, /function updateColourCard/);
    assert.match(s, /imageFields\.classList\.toggle\('hidden', !shouldShowImage\)/);
    assert.match(s, /new_colour: newColour/);
    assert.match(s, /matrix-add-size/);
});
test('Admin product search covers art, brand, tags and colour', () => {
    const s=read('public/js/script.js');
    assert.match(s, /function filterAdminProducts/);
    assert.match(s, /product\.tags/);
    assert.match(s, /variant\.colour/);
});
test('Customer product card displays price and MRP without quantities', () => {
    const s=read('public/js/customer.js');
    assert.match(s, /Unit:.*money\(product\.price\)/);
    assert.match(s, /MRP:.*money\(product\.mrp\)/);
    const backend=read('server/server.js');
    const route = backend.slice(backend.indexOf('app.get("/api/customer/products"'), backend.indexOf('function customerOrderStatus'));
    assert.doesNotMatch(route, /row\.quantity|s\.quantity/);
});
test('Updated JavaScript syntax and local HTML structure', () => {
    for(const rel of ['public/js/script.js','public/js/customer.js','public/js/inventory-matrix.js','server/server.js']) {
        const r=spawnSync(process.execPath,['--check',path.join(root,rel)],{encoding:'utf8'});
        assert.equal(r.status,0,`${rel}: ${r.stderr}`);
    }
    const html=read('public/index.html');
    assert.match(html,/id="details-tags"/);
    assert.doesNotMatch(html,/id="add-new-variant-button"/);
});

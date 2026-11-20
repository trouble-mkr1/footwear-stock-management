'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

test('New matrix JavaScript parses', () => {
    const checked = spawnSync(process.execPath, ['--check', path.join(root, 'public/js/inventory-matrix.js')], {encoding:'utf8'});
    assert.equal(checked.status, 0, checked.stderr || checked.stdout);
});
test('Matrix has one form, arbitrary size controls and mobile stylesheet', () => {
    const html = read('public/index.html');
    assert.match(html, /id="inventory-matrix-page"/);
    assert.match(html, /id="matrix-form"/);
    assert.match(html, /id="matrix-add-colour"/);
    assert.match(html, /inventory-matrix\.js/);
    assert.match(html, /inventory-matrix\.css/);
    const js = read('public/js/inventory-matrix.js');
    assert.match(js, /matrix-add-size/);
    assert.match(js, /matrix-remove-size/);
    assert.match(js, /matrix-remove-colour/);
    assert.doesNotMatch(js, /size.*=\s*\[6,\s*7,\s*8,\s*9/);
});
test('Bulk API requires admin and has transactional writes', () => {
    const js = read('server/server.js');
    const guard = js.indexOf('app.use("/api", requireAdmin)');
    const bulk = js.indexOf("app.post('/api/inventory/bulk'");
    assert.ok(guard >= 0 && bulk > guard);
    assert.match(js.slice(bulk, js.indexOf('app.get("/api/products"',bulk)), /await client\.query\('BEGIN'\)/);
    assert.match(js.slice(bulk, js.indexOf('app.get("/api/products"',bulk)), /await client\.query\('COMMIT'\)/);
    assert.match(js.slice(bulk, js.indexOf('app.get("/api/products"',bulk)), /rollbackQuietly/);
});
test('Upload validation cleans files after failed bulk transaction', () => {
    const js = read('server/server.js');
    assert.match(js, /upload\.array\('images', 12\)/);
    assert.match(js, /detectImageExtension\(file\.path\)/);
    assert.match(js, /for \(const file of files\) deleteUploadedImage\(file\)/);
});
test('Brand/tag migration does not destroy historical data', () => {
    const sql = read('database/migrations/003_inventory_matrix_brand_tags.sql');
    assert.match(sql, /ALTER TABLE products ADD COLUMN IF NOT EXISTS brand/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS product_tags/);
    assert.match(sql, /UNIQUE INDEX IF NOT EXISTS product_tags_art_normalized_tag_uidx/);
    assert.doesNotMatch(sql, /DROP TABLE|TRUNCATE|DELETE FROM (products|orders)/i);
});
test('Customer catalogue is still not exposing stock quantity', () => {
    const js = read('server/server.js');
    const start = js.indexOf('app.get("/api/customer/products"');
    const end = js.indexOf('function customerOrderStatus',start);
    const route = js.slice(start,end);
    assert.doesNotMatch(route, /s\.quantity|row\.quantity|quantity:\s*row\./);
    assert.match(route, /p\.brand/);
    assert.match(route, /pt\.tag/);
});

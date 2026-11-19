"use strict";

// Non-destructive checks for configuration and deployment prerequisites.
// These do not require a database, npm dependencies, or a web server.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = filename => fs.readFileSync(path.join(root, filename), "utf8");

test("Hosted PostgreSQL supports verified TLS and a bounded connection pool", () => {
    const source = read("server/db.js");
    assert.match(source, /DB_SSL_MODE/);
    assert.match(source, /rejectUnauthorized:\s*true/);
    assert.doesNotMatch(source, /rejectUnauthorized:\s*false/);
    assert.match(source, /DB_POOL_MAX/);
    assert.match(source, /connectionTimeoutMillis/);
});

test("Image uploads can use a persistent storage directory", () => {
    const source = read("server/server.js");
    assert.match(source, /process\.env\.IMAGE_UPLOAD_DIR/);
    assert.match(source, /Production requires an absolute IMAGE_UPLOAD_DIR/);
    assert.match(source, /cb\(null, imageUploadDir\)/);
    assert.match(source, /express\.static\(imageUploadDir\)/);
    assert.match(source, /express\.static\(bundledImagesDir\)/);
});

test("Unauthenticated health endpoint checks the database without exposing secrets", () => {
    const source = read("server/server.js");
    const health = source.indexOf('app.get("/healthz"');
    const auth = source.indexOf('app.use("/api", requireAdmin)');
    assert.ok(health >= 0 && auth > health, "Health check should precede the private API guard");
    assert.match(source.slice(health, auth), /pool\.query\("SELECT 1"\)/);
    assert.match(source.slice(health, auth), /status:\s*"unavailable"/);
});

test("Local configuration example and Git ignore rules protect secrets and uploads", () => {
    const example = read(".env.example");
    const ignore = read(".gitignore");
    assert.match(example, /DB_SSL_MODE=disable/);
    assert.match(example, /IMAGE_UPLOAD_DIR/);
    assert.match(ignore, /(^|\n)\.env(\r?\n|$)/);
    assert.match(ignore, /(^|\n)storage\/(\r?\n|$)/);
});

test("Deployment and recovery instructions are documented", () => {
    const guide = read("docs/DEPLOYMENT_READINESS.md");
    for (const essential of ["HTTPS", "IMAGE_UPLOAD_DIR", "pg_dump", "pg_restore", "/healthz"]) {
        assert.ok(guide.includes(essential), `Guide missing ${essential}`);
    }
});

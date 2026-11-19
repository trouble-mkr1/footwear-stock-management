const { Pool } = require("pg");
require("dotenv").config();

// Local PostgreSQL normally needs no SSL. Hosted PostgreSQL may require TLS.
// Certificate verification remains ON when TLS is enabled.
const sslMode = (process.env.DB_SSL_MODE || "disable").trim().toLowerCase();
if (!["disable", "require"].includes(sslMode)) {
    throw new Error("DB_SSL_MODE must be 'disable' or 'require'.");
}

let ssl = false;
if (sslMode === "require") {
    ssl = { rejectUnauthorized: true };

    // Optional CA certificate provided by the host, encoded as Base64.
    if (process.env.DB_SSL_CA_BASE64) {
        ssl.ca = Buffer.from(process.env.DB_SSL_CA_BASE64, "base64").toString("utf8");
    }
}

const pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl,
    max: Number(process.env.DB_POOL_MAX || 10),
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000
});

pool.on("error", error => {
    console.error("Unexpected idle PostgreSQL client error:", error.message);
});

module.exports = pool;

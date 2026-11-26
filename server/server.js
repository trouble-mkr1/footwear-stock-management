require("dotenv").config();

const express = require("express");
const pool = require("./db");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { buildInvoicePdf } = require("./invoice-pdf");
const { getSalesAnalytics } = require("./analytics");

const session = require("express-session");
const PgSession = require("connect-pg-simple")(session);
const bcrypt = require("bcryptjs");
const { rateLimit } = require("express-rate-limit");

const app = express();

const publicDir = path.join(__dirname, "../public");

// A persistent mount can be configured by IMAGE_UPLOAD_DIR on the hosting provider.
// Without it, local development continues using the existing public/images folder.
const bundledImagesDir = path.join(publicDir, "images");
const imageUploadDir = process.env.IMAGE_UPLOAD_DIR
    ? path.resolve(process.env.IMAGE_UPLOAD_DIR)
    : bundledImagesDir;

// A production mount must already exist and be writable; do not silently
// create a directory on an ephemeral filesystem when the mount is missing.
if (process.env.NODE_ENV === "production") {
    if (!process.env.IMAGE_UPLOAD_DIR || !path.isAbsolute(process.env.IMAGE_UPLOAD_DIR)) {
        throw new Error("Production requires an absolute IMAGE_UPLOAD_DIR on a persistent mount.");
    }
    fs.accessSync(imageUploadDir, fs.constants.R_OK | fs.constants.W_OK);
} else {
    // Preserve the existing localhost behavior; create custom local folders.
    fs.mkdirSync(imageUploadDir, { recursive: true });
}

if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET is missing from .env");
}

if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD_HASH) {
    throw new Error("Admin credentials are missing from .env");
}

if (process.env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, imageUploadDir);
    },

    filename: (req, file, cb) => {
        const filename = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
        cb(null, filename);
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // its 5 mb, increase/decrease if needed later
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

        if (!allowedTypes.includes(file.mimetype)) {
            return cb(new Error("Only JPG, PNG and WEBP images are allowed"));
        }

        cb(null, true);
    }
}); 

const uploadProductImage = (req, res, next) => {
    upload.single("image")(req, res, async (error) => {
        if (error) {
            return res.status(400).json({
                error: error.code === "LIMIT_FILE_SIZE"
                    ? "Image must be smaller than 5 MB."
                    : error.message
            });
        }

        // No image was uploaded.
        // The route itself will handle the required-image validation.
        if (!req.file) {
            return next();
        }

        try {
            const extension = await detectImageExtension(req.file.path);

            if (!extension) {
                deleteUploadedImage(req.file);

                return res.status(400).json({
                    error: "The uploaded file is not a valid JPG, PNG or WEBP image."
                });
            }

            // Give the image a server-controlled extension.
            const safeFilename = `${path.basename(req.file.filename)}.${extension}`;

            const safePath = path.join(
                path.dirname(req.file.path),
                safeFilename
            );

            await fs.promises.rename(req.file.path, safePath);

            req.file.filename = safeFilename;
            req.file.path = safePath;

            next();

        } catch (verificationError) {
            console.error("Image verification error:", verificationError);

            deleteUploadedImage(req.file);

            return res.status(500).json({
                error: "Unable to verify the uploaded image."
            });
        }
    });
};


// function to verify if the uploaded image is a propper one(.png, webp, etc etc)
async function detectImageExtension(filePath) {
    const fileHandle = await fs.promises.open(filePath, "r");

    try {
        const header = Buffer.alloc(12);

        const { bytesRead } = await fileHandle.read(
            header,
            0,
            header.length,
            0
        );

        // JPEG signature
        if (
            bytesRead >= 3 &&
            header[0] === 0xFF &&
            header[1] === 0xD8 &&
            header[2] === 0xFF
        ) {
            return "jpg";
        }

        // PNG signature
        if (
            bytesRead >= 8 &&
            header.subarray(0, 8).equals(
                Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
            )
        ) {
            return "png";
        }

        // WEBP signature
        if (
            bytesRead >= 12 &&
            header.toString("ascii", 0, 4) === "RIFF" &&
            header.toString("ascii", 8, 12) === "WEBP"
        ) {
            return "webp";
        }

        return null;

    } finally {
        await fileHandle.close();
    }
}

function deleteUploadedImage(file) {
    if (file) {
        fs.unlink(file.path, (error) => {
            if (error) {
                console.error("Could not delete uploaded image:", error);
            }
        });
    }
}


async function rollbackQuietly(client) {
    if (!client) {
        return;
    }

    try {
        await client.query("ROLLBACK");
    } catch (rollbackError) {
        console.error("Database rollback error:", rollbackError);
    }
}



// Validate and standardise order items
function validateOrderItems(items) {
    if (!Array.isArray(items) || items.length === 0) {
        const error = new Error("An order must contain at least one item.");
        error.statusCode = 400;
        throw error;
    }

    return items.map(item => {
        item = item && typeof item === "object" ? item : {};
        const artNumber = String(item.art_number || "").trim();
        const colour = String(item.colour || "").trim();
        const size = Number(item.size);
        const quantity = Number(item.quantity);

        if (
            !artNumber ||
            !colour ||
            item.size === undefined ||
            item.size === "" ||
            item.quantity === undefined ||
            item.quantity === ""
        ) {
            const error = new Error(
                "Every item must have an art number, colour, size and quantity."
            );
            error.statusCode = 400;
            throw error;
        }

        if (!Number.isInteger(size) || size <= 0) {
            const error = new Error(
                `Invalid size for art number ${artNumber}.`
            );
            error.statusCode = 400;
            throw error;
        }

        if (!Number.isInteger(quantity) || quantity <= 0) {
            const error = new Error(
                `Invalid quantity for art number ${artNumber}.`
            );
            error.statusCode = 400;
            throw error;
        }

        return {
            artNumber,
            colour,
            size,
            quantity
        };
    });
}


// Restore the exact quantities for each existing order item.
// Never skip a missing variant or restore to multiple matching variants.
// The caller must already have started a database transaction.
async function restoreOrderStock(client, orderId) {
    const itemsResult = await client.query(
        `SELECT id, art_number, colour, size, quantity
         FROM order_items
         WHERE order_id = $1
         ORDER BY id`,
        [orderId]
    );

    if (itemsResult.rows.length === 0) {
        const error = new Error(`Order #${orderId} has no items; cannot restore stock safely.`);
        error.statusCode = 409;
        throw error;
    }

    for (const item of itemsResult.rows) {
        const variantResult = await client.query(
            `SELECT id FROM product_variant
             WHERE art_number = $1
             AND LOWER(BTRIM(colour)) = LOWER(BTRIM($2::text))`,
            [item.art_number, item.colour]
        );

        if (variantResult.rows.length !== 1) {
            const error = new Error(
                `Cannot restore stock for order #${orderId}, item #${item.id}: ` +
                `expected one matching colour variant, found ${variantResult.rows.length}.`
            );
            error.statusCode = 409;
            throw error;
        }

        const quantity = Number(item.quantity);
        const size = Number(item.size);
        if (!Number.isInteger(quantity) || quantity <= 0 ||
            !Number.isInteger(size) || size <= 0) {
            const error = new Error(
                `Order #${orderId}, item #${item.id} has invalid size or quantity.`
            );
            error.statusCode = 409;
            throw error;
        }

        await client.query(
            `INSERT INTO stock (variant_id, size, quantity)
             VALUES ($1, $2, $3)
             ON CONFLICT (variant_id, size)
             DO UPDATE SET quantity = stock.quantity + EXCLUDED.quantity`,
            [variantResult.rows[0].id, size, quantity]
        );
    }
}


app.use(express.json({ limit: "100kb" }));

// Serve public assets
app.use("/css", express.static(path.join(publicDir, "css")));
app.use("/js", express.static(path.join(publicDir, "js")));
// New uploads are served from the persistent directory when one is configured.
app.use("/images", express.static(imageUploadDir));

// Existing catalog images bundled with the application remain accessible.
if (imageUploadDir !== bundledImagesDir) {
    app.use("/images", express.static(bundledImagesDir));
}

// Hosting platforms can probe this endpoint without an admin session.
// Never include database credentials or exception details in the response.
app.get("/healthz", async (req, res) => {
    res.set("Cache-Control", "no-store");

    try {
        await pool.query("SELECT 1");
        return res.status(200).json({ status: "ok" });
    } catch (error) {
        console.error("Database health check failed:", error.message);
        return res.status(503).json({ status: "unavailable" });
    }
});


// PostgreSQL-backed login sessions
app.use(session({
    name: "footwear.sid",
    secret: process.env.SESSION_SECRET,

    store: new PgSession({
        pool: pool,
        tableName: "user_sessions",
        createTableIfMissing: true
    }),

    resave: false,
    saveUninitialized: false,

    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 8 * 60 * 60 * 1000,
        path: "/"
    }
}));


function requireAdmin(req, res, next) {
    if (req.session?.isAdmin === true && req.session?.role !== "customer") return next();
    return res.status(401).json({ error: "Authentication required. Please log in." });
}

function requireCustomer(req, res, next) {
    if (req.session?.role === "customer" && Number.isSafeInteger(req.session.customerId)) return next();
    return res.status(401).json({ error: "Please log in to your customer account." });
}

// Only a customer's account can access the customer API; admin APIs stay
// behind the existing requireAdmin guard further below.
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many attempts. Please try again in 15 minutes." }
});
const signupLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many signups. Please try again later." }
});

// Phone numbers are used only as account identifiers, never as order IDs.
function normalizePhone(raw) {
    const value = String(raw ?? "").trim();
    if (!/^[+0-9()\s-]+$/.test(value)) return null;
    const digits = value.replace(/\D/g, "");
    return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

function cleanText(raw, maxLength) {
    const value = typeof raw === "string" ? raw.trim() : "";
    return value && value.length <= maxLength ? value : null;
}

function startLoginSession(req, res, identity) {
    req.session.regenerate(error => {
        if (error) {
            console.error("Session regeneration error:", error);
            return res.status(500).json({ error: "Unable to create login session." });
        }
        req.session.role = identity.role;
        if (identity.role === "admin") {
            req.session.isAdmin = true; // Preserve the existing admin middleware.
            req.session.adminUsername = identity.username;
        } else {
            req.session.isAdmin = false;
            req.session.customerId = identity.customerId;
            req.session.customerName = identity.customerName;
        }
        req.session.save(saveError => {
            if (saveError) {
                console.error("Session save error:", saveError);
                return res.status(500).json({ error: "Unable to save login session." });
            }
            return res.json({
                message: "Login successful.",
                role: identity.role,
                redirect: identity.role === "admin" ? "/" : "/customer"
            });
        });
    });
}

app.get("/api/auth/session", (req, res) => {
    const admin = req.session?.isAdmin === true && req.session?.role !== "customer";
    const customer = req.session?.role === "customer" && Number.isSafeInteger(req.session.customerId);
    return res.json({
        authenticated: admin || customer,
        role: admin ? "admin" : customer ? "customer" : null,
        username: admin ? req.session.adminUsername || null : null,
        name: customer ? req.session.customerName || null : null
    });
});

// Shared login: same interface for username and phone number, different roles.
app.post("/api/auth/login", loginLimiter, async (req, res) => {
    const username = cleanText(req.body?.username, 100);
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!username || !password) {
        return res.status(400).json({ error: "Enter your username / phone number and password." });
    }
    try {
        if (username === process.env.ADMIN_USERNAME) {
            const matches = await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH);
            if (!matches) return res.status(401).json({ error: "Invalid login credentials." });
            return startLoginSession(req, res, { role: "admin", username });
        }
        const phone = normalizePhone(username);
        if (!phone) return res.status(401).json({ error: "Invalid login credentials." });
        const result = await pool.query(
            `SELECT id, name, password_hash FROM customers
             WHERE regexp_replace(phone, '[^0-9]', '', 'g') = $1`, [phone]
        );
        if (result.rows.length !== 1) return res.status(401).json({ error: "Invalid login credentials." });
        const customer = result.rows[0];
        const matches = await bcrypt.compare(password, customer.password_hash);
        if (!matches) return res.status(401).json({ error: "Invalid login credentials." });
        return startLoginSession(req, res, {
            role: "customer", customerId: Number(customer.id), customerName: customer.name
        });
    } catch (error) {
        console.error("Login error:", error);
        return res.status(500).json({ error: "Login failed. Please try again." });
    }
});

// Signup is for customers; role cannot be selected in the request.
app.post("/api/auth/signup", signupLimiter, async (req, res) => {
    const name = cleanText(req.body?.name, 100);
    const shopName = cleanText(req.body?.shop_name, 100);
    const address = cleanText(req.body?.address, 1000);
    const phone = normalizePhone(req.body?.phone);
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const gst = String(req.body?.gst_number ?? "").trim().toUpperCase();
    if (gst && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(gst)) {
        return res.status(400).json({ error: "Enter a valid 15-character GSTIN, or leave it blank." });
    }
    if (!name || !shopName || !address || !phone) {
        return res.status(400).json({ error: "Enter a valid name, phone number, shop name and address." });
    }
    if (phone === process.env.ADMIN_USERNAME) {
        return res.status(400).json({ error: "This phone number cannot be registered." });
    }
    if (password.length < 8 || password.length > 128) {
        return res.status(400).json({ error: "Password must contain at least 8 characters (maximum 128)." });
    }
    try {
        const hash = await bcrypt.hash(password, 12);
        await pool.query(
            `INSERT INTO customers (phone, name, shop_name, address, password_hash, gst_number)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [phone, name, shopName, address, hash, gst || null]
        );
        return res.status(201).json({ message: "Account created. You can now log in." });
    } catch (error) {
        if (error.code === "23505") return res.status(409).json({ error: "This phone number is already registered." });
        console.error("Customer signup error:", error);
        return res.status(500).json({ error: "Unable to create account. Please try again." });
    }
});


// Admin logout
app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(error => {
        if (error) {
            console.error("Logout error:", error);

            return res.status(500).json({
                error: "Unable to log out."
            });
        }

        res.clearCookie("footwear.sid", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            path: "/"
        });

        return res.json({
            message: "Logged out successfully."
        });
    });
});


// Main page: show login or admin dashboard
app.get("/", (req, res) => {
    res.set("Cache-Control", "no-store");
    
    if (req.session?.isAdmin && req.session?.role !== "customer") {
        return res.sendFile(path.join(publicDir, "index.html"));
    }
    if (req.session?.role === "customer") return res.redirect("/customer");
    return res.sendFile(path.join(publicDir, "login.html"));
});


// Protect the billing page
app.get("/billing.html", (req, res) => {
    res.set("Cache-Control", "no-store");

    if (!req.session?.isAdmin) {
        return res.redirect("/");
    }

    return res.sendFile(path.join(publicDir, "billing.html"));
});


// app.get("/test-db", async (req, res) => {
//     try {
//         const result = await pool.query("SELECT NOW()");
//         res.json(result.rows);
//     } catch (error) {
//         console.error(error);
//         res.status(500).send("Database connection failed");
//     }
// });

// Serve customer-specific pages only to the appropriate role.
app.get("/signup", (req, res) => {
    res.set("Cache-Control", "no-store");
    if (req.session?.isAdmin || req.session?.role === "customer") return res.redirect("/");
    return res.sendFile(path.join(publicDir, "signup.html"));
});
app.get("/customer", (req, res) => {
    res.set("Cache-Control", "no-store");
    if (req.session?.role === "customer") return res.sendFile(path.join(publicDir, "customer.html"));
    return res.redirect("/");
});

app.get("/test-db", requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                current_database(),
                NOW()
            `);

            res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).send("Database connection failed");
    }
});


// Customer endpoints must be mounted BEFORE the admin-only /api guard.
// Do not expose stock.quantity (or inferred totals) to customer responses.
app.use("/api/customer", requireCustomer);

app.get("/api/customer/profile", async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT name, shop_name, phone, address, gst_number FROM customers WHERE id=$1",
            [req.session.customerId]
        );
        if (!result.rows.length) return res.status(401).json({ error: "Account no longer exists." });
        return res.json(result.rows[0]);
    } catch (error) {
        console.error("Customer profile error:", error);
        return res.status(500).json({ error: "Unable to load account." });
    }
});

// Customers can edit their own contact and shop details, not their account role,
// phone/login ID, password hash or any historical order/invoice records.
app.put("/api/customer/profile", async (req, res) => {
    const name = cleanText(req.body?.name, 100);
    const shopName = cleanText(req.body?.shop_name, 100);
    const address = cleanText(req.body?.address, 1000);
    const gst = String(req.body?.gst_number ?? "").trim().toUpperCase();
    if (!name || !shopName || !address) {
        return res.status(400).json({ error: "Please enter your name, shop name and delivery address." });
    }
    if (gst && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(gst)) {
        return res.status(400).json({ error: "Please enter a valid 15-character GSTIN or leave it blank." });
    }
    try {
        const result = await pool.query(
            `UPDATE customers SET name=$1, shop_name=$2, address=$3, gst_number=$4
             WHERE id=$5 RETURNING name, shop_name, phone, address, gst_number`,
            [name, shopName, address, gst || null, req.session.customerId]
        );
        if (!result.rows.length) return res.status(404).json({ error: "Customer account not found." });
        req.session.customerName = result.rows[0].name;
        return res.json(result.rows[0]);
    } catch (error) {
        console.error("Customer profile update error:", error);
        return res.status(500).json({ error: "Unable to save account details. Please try again." });
    }
});

app.get("/api/customer/contact", (req, res) => {
    // Optional client-supplied contact number; do not invent a business phone.
    return res.json({ phone: process.env.BUSINESS_CONTACT_PHONE || null });
});

app.get("/api/customer/products", async (req, res) => {
    try {
        // Sizes may be shown, but NEVER include current quantities in response.
        const result = await pool.query(`
            SELECT p.art_number, p.price, p.mrp, p.brand,
                   ARRAY(SELECT pt.tag FROM product_tags pt WHERE pt.art_number=p.art_number ORDER BY pt.tag) AS tags,
                   pv.colour, pv.image,
                   COALESCE(array_agg(DISTINCT s.size ORDER BY s.size)
                            FILTER (WHERE s.size IS NOT NULL), ARRAY[]::integer[]) AS sizes
            FROM products p
            JOIN product_variant pv ON pv.art_number = p.art_number
            LEFT JOIN stock s ON s.variant_id = pv.id
            GROUP BY p.art_number, p.price, p.mrp, p.brand, pv.id, pv.colour, pv.image
            ORDER BY p.art_number, pv.colour
        `);
        // Only a simple popularity flag is public, never counts or shop identities.
        // Do not call an article "Popular" until at least three delivered orders.
        const popularResult = await pool.query(`
            SELECT oi.art_number
            FROM orders o JOIN order_items oi ON oi.order_id=o.id
            WHERE LOWER(BTRIM(o.status))='completed'
            GROUP BY oi.art_number
            HAVING COUNT(DISTINCT o.id) >= 3
               AND COUNT(DISTINCT o.customer_id) >= 2
            ORDER BY SUM(oi.quantity) DESC, oi.art_number LIMIT 3
        `);
        const popularArts = new Set(popularResult.rows.map(row => row.art_number));
        // All-time best sellers are based on delivered PAIRS, including old manual shop
        // orders. Require at least two actual delivered orders before showing a badge.
        const topSellerResult = await pool.query(`
            SELECT oi.art_number
            FROM orders o JOIN order_items oi ON oi.order_id=o.id
            JOIN products p ON p.art_number=oi.art_number
            WHERE LOWER(BTRIM(o.status))='completed'
            GROUP BY oi.art_number
            HAVING COUNT(DISTINCT o.id) >= 2
            ORDER BY SUM(oi.quantity) DESC, oi.art_number LIMIT 3
        `);
        // Trending refers only to recent, reliably timestamped deliveries.
        const trendingResult = await pool.query(`
            SELECT oi.art_number
            FROM orders o JOIN order_items oi ON oi.order_id=o.id
            JOIN products p ON p.art_number=oi.art_number
            WHERE LOWER(BTRIM(o.status))='completed'
              AND o.completed_at >= NOW() - INTERVAL '30 days'
            GROUP BY oi.art_number
            HAVING COUNT(DISTINCT o.id) >= 2
            ORDER BY SUM(oi.quantity) DESC, oi.art_number LIMIT 3
        `);
        const topSellerArts = new Set(topSellerResult.rows.map(row => row.art_number));
        const trendingArts = new Set(trendingResult.rows.map(row => row.art_number));
        const catalog = new Map();
        for (const row of result.rows) {
            if (!catalog.has(row.art_number)) catalog.set(row.art_number, {
                art_number: row.art_number, price: row.price, mrp: row.mrp, brand: row.brand,
                tags: row.tags, popular: popularArts.has(row.art_number),
                top_seller: topSellerArts.has(row.art_number),
                trending: trendingArts.has(row.art_number), variants: []
            });
            catalog.get(row.art_number).variants.push({
                colour: row.colour, image: row.image, sizes: row.sizes
            });
        }
        res.set("Cache-Control", "no-store");
        return res.json([...catalog.values()]);
    } catch (error) {
        console.error("Customer catalogue error:", error);
        return res.status(500).json({ error: "Unable to load products." });
    }
});

function customerOrderStatus(status) {
    return String(status || "").trim().toLowerCase() === "completed" ? "Received" : "Yet to Receive";
}

app.get("/api/customer/orders", async (req, res) => {
    try {
        const orders = await pool.query(
            `SELECT id, company_name, address, status FROM orders
             WHERE customer_id = $1 ORDER BY id DESC`, [req.session.customerId]
        );
        const items = await pool.query(
            `SELECT oi.order_id, oi.art_number, oi.colour, oi.size,
                    oi.quantity, oi.unit_price, oi.mrp
             FROM order_items oi JOIN orders o ON o.id=oi.order_id
             WHERE o.customer_id=$1 ORDER BY oi.order_id DESC, oi.id`,
            [req.session.customerId]
        );
        const grouped = new Map(orders.rows.map(o => [o.id, {
            id: o.id, company_name: o.company_name, address: o.address,
            status: customerOrderStatus(o.status), items: []
        }]));
        for (const item of items.rows) {
            const parent = grouped.get(item.order_id);
            if (parent) parent.items.push({
                art_number: item.art_number, colour: item.colour,
                size: item.size, quantity: item.quantity,
                unit_price: item.unit_price, mrp: item.mrp
            });
        }
        res.set("Cache-Control", "no-store");
        return res.json([...grouped.values()]);
    } catch (error) {
        console.error("Customer orders error:", error);
        return res.status(500).json({ error: "Unable to load your orders." });
    }
});

app.post("/api/customer/orders", async (req, res) => {
    let client;
    try {
        // A cart may contain up to 30 lines. Never trust the browser's stock checks.
        const items = validateOrderItems(req.body?.items);
        if (items.length > 30 || items.some(item => item.quantity > 1000)) {
            return res.status(400).json({ error: "Please limit each order to 30 items and 1,000 pairs per item." });
        }

        client = await pool.connect();
        await client.query("BEGIN");
        const customerResult = await client.query(
            "SELECT shop_name, address FROM customers WHERE id=$1", [req.session.customerId]
        );
        if (!customerResult.rows.length) {
            const error = new Error("Account no longer exists.");
            error.statusCode = 401;
            throw error;
        }
        const customer = customerResult.rows[0];
        if (customer.shop_name.length > 100) {
            const error = new Error("Shop name is too long for an order. Please contact HAWA TRADERS.");
            error.statusCode = 409;
            throw error;
        }

        // Resolve ALL lines before changing stock; never stop at the first short item.
        // Multiple lines for the same variant/size must be checked by their SUM,
        // otherwise a specially crafted request could bypass the availability check.
        const problems = [];
        const grouped = new Map();
        const resolved = [];
        for (const item of items) {
            const identity = { art_number: item.artNumber, colour: item.colour, size: item.size };
            const variantResult = await client.query(
                `SELECT pv.id, p.price, p.mrp FROM product_variant pv
                 JOIN products p ON p.art_number=pv.art_number
                 WHERE pv.art_number=$1
                   AND LOWER(BTRIM(pv.colour))=LOWER(BTRIM($2::text))`,
                [item.artNumber, item.colour]
            );
            if (variantResult.rows.length !== 1) {
                problems.push({ code: "ITEM_UNAVAILABLE", item: identity,
                    message: `Art ${item.artNumber}, ${item.colour}, size ${item.size} is no longer available. Please remove or change this item.` });
                continue;
            }
            const variant = variantResult.rows[0];
            if (!Number.isFinite(Number(variant.price)) || Number(variant.price) <= 0) {
                problems.push({ code: "ITEM_UNAVAILABLE", item: identity,
                    message: `Art ${item.artNumber}, ${item.colour}, size ${item.size} cannot be ordered right now.` });
                continue;
            }
            resolved.push({ item, variant });
            const key = `${variant.id}:${item.size}`;
            if (grouped.has(key)) {
                grouped.get(key).required += item.quantity;
            } else {
                grouped.set(key, { variantId: variant.id, size: item.size,
                    required: item.quantity, identity });
            }
        }

        // Lock stock rows in a stable order to prevent double-selling during concurrent
        // checkouts (and reduce deadlock risk for multi-item orders).
        const requirements = [...grouped.values()].sort((a, b) =>
            Number(a.variantId) - Number(b.variantId) || a.size - b.size);
        for (const requirement of requirements) {
            const stock = await client.query(
                `SELECT quantity FROM stock WHERE variant_id=$1 AND size=$2 FOR UPDATE`,
                [requirement.variantId, requirement.size]
            );
            if (!stock.rows.length || Number(stock.rows[0].quantity) < requirement.required) {
                const { art_number, colour, size } = requirement.identity;
                problems.push({ code: "INSUFFICIENT_STOCK", item: requirement.identity,
                    message: `Not enough stock for Art ${art_number}, ${colour}, size ${size}. Please reduce this item's quantity and try again.` });
            }
        }

        if (problems.length) {
            const error = new Error(problems.length === 1
                ? problems[0].message
                : `${problems.length} items need attention. Review the highlighted items and try again.`);
            error.statusCode = 409;
            error.issues = problems;
            throw error;
        }

        // Only now create the order and deduct stock; a failure rolls EVERYTHING back.
        const header = await client.query(
            `INSERT INTO orders (company_name, address, customer_id)
             VALUES ($1,$2,$3) RETURNING id`,
            [customer.shop_name, customer.address, req.session.customerId]
        );
        const orderId = header.rows[0].id;
        for (const requirement of requirements) {
            const update = await client.query(
                `UPDATE stock SET quantity=quantity-$1
                 WHERE variant_id=$2 AND size=$3 AND quantity >= $1
                 RETURNING variant_id`,
                [requirement.required, requirement.variantId, requirement.size]
            );
            if (!update.rows.length) {
                const error = new Error("Stock changed during checkout. Please retry your order.");
                error.statusCode = 409;
                throw error;
            }
        }
        for (const { item, variant } of resolved) {
            await client.query(
                `INSERT INTO order_items
                 (order_id,art_number,colour,size,quantity,unit_price,mrp)
                 VALUES ($1,$2,$3,$4,$5,$6,$7)`,
                [orderId,item.artNumber,item.colour,item.size,item.quantity,variant.price,variant.mrp]
            );
        }
        await client.query("COMMIT");
        return res.status(201).json({ message: "Order placed successfully.", order_id: orderId });
    } catch (error) {
        await rollbackQuietly(client);
        if (!error.statusCode) console.error("Customer order error:", error);
        const response = {
            error: error.statusCode ? error.message : "Unable to place your order. Please try again."
        };
        if (error.statusCode === 409 && Array.isArray(error.issues) && error.issues.length) {
            // Backward-compatible single-item fields; never return availability counts.
            response.issues = error.issues;
            response.code = error.issues.length === 1 ? error.issues[0].code : "MULTIPLE_ITEMS_UNAVAILABLE";
            response.item = error.issues[0].item;
        }
        return res.status(error.statusCode || 500).json(response);
    } finally {
        if (client) client.release();
    }
});


// All API routes below this point require admin authentication
app.use("/api", requireAdmin);

// Aggregate reports belong to the admin only. Completed means delivered.
app.get("/api/analytics", async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    try {
        return res.json(await getSalesAnalytics(pool));
    } catch (error) {
        console.error("Analytics query failed:", error);
        return res.status(500).json({ error: "Unable to load analytics. Check that migration 004 was applied." });
    }
});



// Additive bulk inventory workflow. Existing single-size API endpoints stay available.
// Admin-only: this route is intentionally declared AFTER app.use('/api', requireAdmin).
const bulkInventoryUpload = (req, res, next) => {
    upload.array('images', 12)(req, res, async error => {
        if (error) {
            for (const file of req.files || []) deleteUploadedImage(file);
            return res.status(400).json({ error: error.code === 'LIMIT_FILE_SIZE'
                ? 'Each image must be smaller than 5 MB.' : error.message });
        }
        try {
            for (const file of req.files || []) {
                const extension = await detectImageExtension(file.path);
                if (!extension) {
                    for (const item of req.files) deleteUploadedImage(item);
                    return res.status(400).json({ error: 'Only genuine JPG, PNG or WEBP images are accepted.' });
                }
                const newPath = `${file.path}.${extension}`;
                await fs.promises.rename(file.path, newPath);
                file.path = newPath;
                file.filename = path.basename(newPath);
            }
            next();
        } catch (e) {
            for (const file of req.files || []) deleteUploadedImage(file);
            console.error('Bulk image validation error:', e);
            res.status(500).json({ error: 'Unable to check uploaded images.' });
        }
    });
};

function bulkInputError(message, status = 400) {
    const e = new Error(message);
    e.statusCode = status;
    throw e;
}
function validBulkSizes(value, mode, colour) {
    if (!Array.isArray(value) || value.length < 1 || value.length > 25)
        bulkInputError(`${colour}: add between 1 and 25 sizes.`);
    const used = new Set();
    return value.map(row => {
        const size = Number(row?.size);
        const qty = Number(row?.quantity);
        if (!Number.isSafeInteger(size) || size < 1 || size > 999)
            bulkInputError(`${colour}: size must be a whole number between 1 and 999.`);
        if (!Number.isSafeInteger(qty) || qty < (mode === 'stock' ? 1 : 0) || qty > 1000000)
            bulkInputError(`${colour}, size ${size}: ${mode === 'stock' ? 'additional quantity must be at least 1' : 'quantity must be 0 or higher'}.`);
        if (used.has(size)) bulkInputError(`${colour}: size ${size} is duplicated.`);
        used.add(size);
        return { size, quantity: qty };
    });
}

app.post('/api/inventory/bulk', bulkInventoryUpload, async (req, res) => {
    let client;
    const files = req.files || [];
    try {
        let body;
        try { body = JSON.parse(req.body?.data || ''); }
        catch { bulkInputError('Invalid inventory form data.'); }
        const mode = body?.mode;
        if (!['product', 'colour', 'stock'].includes(mode)) bulkInputError('Invalid inventory action.');
        const art = String(body.art_number || '').trim();
        if (!art || art.length > 80) bulkInputError('Art number is required (maximum 80 characters).');
        if (!Array.isArray(body.variants) || body.variants.length < 1 || body.variants.length > 12)
            bulkInputError('Add between 1 and 12 colour cards.');
        const usedColours = new Set();
        const variants = body.variants.map(v => {
            const colour = String(v?.colour || '').trim();
            const key = colour.toLocaleLowerCase('en');
            if (!colour || colour.length > 60) bulkInputError('Each colour must be 1–60 characters.');
            if (usedColours.has(key)) bulkInputError(`Duplicate colour: ${colour}.`);
            usedColours.add(key);
            return { colour, sizes: validBulkSizes(v.sizes, mode, colour),
                newColour: mode === 'stock' && v.new_colour === true };
        });
        if (mode === 'product') {
            if (!Number.isFinite(Number(body.price)) || Number(body.price) <= 0 ||
                !Number.isFinite(Number(body.mrp)) || Number(body.mrp) <= 0)
                bulkInputError('Price and MRP must be positive numbers.');
        }
        const brand = String(body.brand || '').trim();
        if (brand.length > 100) bulkInputError('Brand / company must be 100 characters or fewer.');
        if (mode === 'product' && !brand) bulkInputError('Enter the brand / company (or Local / Unbranded).');
        if (!Array.isArray(body.tags || []) || (body.tags || []).length > 20)
            bulkInputError('Use at most 20 tags.');
        const tags = (body.tags || []).map(t => String(t).trim()).filter(Boolean);
        if (tags.some(t => t.length > 40) || new Set(tags.map(t => t.toLowerCase())).size !== tags.length)
            bulkInputError('Tags must be unique and at most 40 characters.');
        const hasPositiveStock = variants.some(v => v.sizes.some(s => s.quantity > 0));
        if (mode !== 'stock' && !hasPositiveStock) bulkInputError('Enter stock for at least one size.');
        const requiredImages = mode === 'stock'
            ? variants.filter(v => v.newColour).length : variants.length;
        if (files.length !== requiredImages) bulkInputError('Provide one photo for each new colour only.');
        if (files.some(f => f.fieldname !== 'images')) bulkInputError('Unexpected image field.');

        client = await pool.connect();
        await client.query('BEGIN');
        if (mode === 'product') {
            const retired = await client.query('SELECT 1 FROM deleted_products WHERE art_number=$1', [art]);
            if (retired.rows.length) bulkInputError('This art number belongs to a deleted product and cannot be reused.', 409);
            await client.query(
                'INSERT INTO products (art_number, price, mrp, brand) VALUES ($1,$2,$3,$4)',
                [art, Number(body.price), Number(body.mrp), brand]);
            for (const tag of tags) {
                await client.query('INSERT INTO product_tags (art_number, tag) VALUES ($1,$2)', [art, tag]);
            }
        } else {
            const existing = await client.query('SELECT art_number FROM products WHERE art_number=$1 FOR UPDATE', [art]);
            if (!existing.rows.length) bulkInputError(`Art number ${art} does not exist.`, 404);
        }
        let nextNewColourImage = 0;
        for (const [index, variant] of variants.entries()) {
            let variantId;
            if (mode === 'stock') {
                const match = await client.query(
                    'SELECT id FROM product_variant WHERE art_number=$1 AND lower(btrim(colour))=lower(btrim($2::text))',
                    [art, variant.colour]);
                if (variant.newColour) {
                    if (match.rows.length) bulkInputError(
                        `Colour ${variant.colour} already exists for art ${art}. Refresh and add its stock instead.`, 409);
                    const added = await client.query(
                        'INSERT INTO product_variant (art_number, colour, image) VALUES ($1,$2,$3) RETURNING id',
                        [art, variant.colour, files[nextNewColourImage++].filename]);
                    variantId = added.rows[0].id;
                } else {
                    if (match.rows.length !== 1) bulkInputError(
                        `Colour ${variant.colour} no longer matches art ${art}. Refresh and retry.`, 409);
                    variantId = match.rows[0].id;
                }
            } else {
                const added = await client.query(
                    'INSERT INTO product_variant (art_number, colour, image) VALUES ($1,$2,$3) RETURNING id',
                    [art, variant.colour, files[index].filename]);
                variantId = added.rows[0].id;
            }
            for (const item of variant.sizes) {
                if (mode === 'stock') {
                    await client.query(
                        `INSERT INTO stock (variant_id,size,quantity) VALUES ($1,$2,$3)
                         ON CONFLICT (variant_id,size)
                         DO UPDATE SET quantity=stock.quantity+EXCLUDED.quantity`,
                        [variantId, item.size, item.quantity]);
                } else {
                    await client.query(
                        'INSERT INTO stock (variant_id,size,quantity) VALUES ($1,$2,$3)',
                        [variantId, item.size, item.quantity]);
                }
            }
        }
        await client.query('COMMIT');
        return res.status(mode === 'stock' ? 200 : 201).json({
            message: mode === 'product' ? 'Product and all colours saved.'
                : mode === 'colour' ? 'New colours and sizes saved.' : 'Stock and new colours saved.'
        });
    } catch (error) {
        await rollbackQuietly(client);
        // Do not keep uploaded images when the database transaction fails.
        if (error.code === '23505') error = Object.assign(new Error('This art number, colour or tag already exists.'), { statusCode: 409 });
        if (!error.statusCode) console.error('Bulk inventory error:', error);
        return res.status(error.statusCode || 500).json({ error: error.statusCode
            ? error.message : 'Unable to save inventory. No stock was changed.' });
    } finally {
        if (client) client.release();
        if (!res.statusCode || res.statusCode >= 400) {
            // Async cleanup for failed submissions. No database image references were committed.
            for (const file of files) deleteUploadedImage(file);
        }
    }
});


// Admin-only metadata editing. Art number is intentionally immutable.
// Order item prices are historical snapshots and MUST NOT change here.
app.put("/api/products/:artNumber/details", async (req, res) => {
    let client;
    try {
        const art = String(req.params.artNumber || "").trim();
        if (!art || art.length > 80) return res.status(400).json({ error: "Invalid art number." });
        const body = req.body || {};
        if (typeof body.brand !== "string" || !body.brand.trim() || body.brand.trim().length > 100)
            return res.status(400).json({ error: "Brand / Company must be 1–100 characters." });
        const price = Number(body.price), mrp = Number(body.mrp);
        if (![price,mrp].every(n => Number.isFinite(n) && n > 0 && n <= 99999999.99 &&
            Math.abs(Math.round(n * 100) - n * 100) < 1e-6))
            return res.status(400).json({ error: "Unit price and MRP must be positive amounts with at most two decimal places." });
        if (!Array.isArray(body.tags) || body.tags.length > 20 ||
            body.tags.some(tag => typeof tag !== "string" || !tag.trim() || tag.trim().length > 40))
            return res.status(400).json({ error: "Use up to 20 tags, each 1–40 characters." });
        const tags = body.tags.map(tag => tag.trim());
        const tagKeys = tags.map(tag => tag.toLowerCase());
        if (new Set(tagKeys).size !== tags.length)
            return res.status(400).json({ error: "Tags must be unique (case-insensitive)." });
        client = await pool.connect();
        await client.query("BEGIN");
        const existing = await client.query("SELECT art_number FROM products WHERE art_number=$1 FOR UPDATE", [art]);
        if (!existing.rows.length) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: "Product not found. Please refresh the catalogue." });
        }
        await client.query("UPDATE products SET brand=$1, price=$2, mrp=$3 WHERE art_number=$4",
            [body.brand.trim(), price, mrp, art]);
        await client.query("DELETE FROM product_tags WHERE art_number=$1", [art]);
        for (const tag of tags) {
            await client.query("INSERT INTO product_tags (art_number,tag) VALUES ($1,$2)", [art, tag]);
        }
        await client.query("COMMIT");
        return res.json({ message: "Product details updated.", art_number: art });
    } catch (error) {
        await rollbackQuietly(client);
        console.error("Edit product metadata error:", error);
        return res.status(500).json({ error: "Unable to update product. No changes were saved." });
    } finally {
        if (client) client.release();
    }
});

// Remove a live article and its variants, size stock and unshared images.
// Invoice history is retained in order_items; deleted_products stores its former
// brand for historical analytics and permanently reserves the old art number.
app.delete("/api/products/:artNumber", async (req, res) => {
    const art = String(req.params.artNumber || "").trim();
    if (!art || art.length > 80) return res.status(400).json({ error: "Invalid art number." });
    let client;
    let images = [];
    try {
        client = await pool.connect();
        await client.query("BEGIN");
        const product = await client.query(
            "SELECT art_number, brand FROM products WHERE art_number=$1 FOR UPDATE", [art]
        );
        if (!product.rows.length) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: "Product not found. Refresh the catalogue." });
        }
        const pending = await client.query(`
            SELECT o.id FROM orders o
            JOIN order_items oi ON oi.order_id=o.id
            WHERE oi.art_number=$1 AND LOWER(BTRIM(o.status))='pending'
            LIMIT 1`, [art]);
        if (pending.rows.length) {
            await client.query("ROLLBACK");
            return res.status(409).json({
                error: `Art ${art} is included in pending order #${pending.rows[0].id}. Complete or resolve that order before deleting this product.`
            });
        }
        const variants = await client.query(
            "SELECT id, image FROM product_variant WHERE art_number=$1 FOR UPDATE", [art]);
        images = [...new Set(variants.rows.map(r => r.image).filter(Boolean))];
        await client.query("INSERT INTO deleted_products (art_number,brand) VALUES ($1,$2)",
            [art, product.rows[0].brand]);
        await client.query(`DELETE FROM stock WHERE variant_id IN
            (SELECT id FROM product_variant WHERE art_number=$1)`, [art]);
        await client.query("DELETE FROM product_tags WHERE art_number=$1", [art]);
        await client.query("DELETE FROM product_variant WHERE art_number=$1", [art]);
        await client.query("DELETE FROM products WHERE art_number=$1", [art]);
        await client.query("COMMIT");
    } catch (error) {
        await rollbackQuietly(client);
        console.error("Delete product error:", error);
        return res.status(500).json({ error: "Unable to delete this product. Nothing was changed." });
    } finally {
        if (client) client.release();
    }
    // Image files are removed only when no other product still uses them.
    // File failures do not undo the committed database deletion; log for cleanup.
    for (const filename of images) {
        if (!/^[A-Za-z0-9_.-]+$/.test(filename) || filename === "." || filename === "..") continue;
        try {
            const stillUsed = await pool.query(
                "SELECT 1 FROM product_variant WHERE image=$1 LIMIT 1", [filename]);
            if (stillUsed.rows.length) continue;
            // Never delete files from the checked-in public/images folder during
            // a demo that uses an isolated IMAGE_UPLOAD_DIR. Production bundles
            // are immutable; old bundled assets can be removed from source later.
            try { await fs.promises.unlink(path.join(imageUploadDir, filename)); }
            catch (error) { if (error.code !== "ENOENT") console.error("Image cleanup error:", error); }
        } catch (error) { console.error("Image reference check error:", error); }
    }
    return res.json({ message: `Product ${art} and its live stock, colours and images were deleted. Existing invoices are preserved.` });
});

app.get("/api/products", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                p.art_number,
                p.price,
                p.mrp,
                p.brand,
                ARRAY(SELECT pt.tag FROM product_tags pt WHERE pt.art_number=p.art_number ORDER BY pt.tag) AS tags,
                pv.colour,
                pv.image,
                s.size,
                s.quantity
            FROM products p
            JOIN product_variant pv
                ON p.art_number = pv.art_number
            LEFT JOIN stock s
                ON pv.id = s.variant_id
            ORDER BY p.art_number, pv.colour, s.size
        `);

        const products = Object.create(null);

        for (const row of result.rows) {
            if (!products[row.art_number]) {
                products[row.art_number] = {
                    art_number: row.art_number,
                    price: row.price,
                    mrp: row.mrp,
                    brand: row.brand,
                    tags: row.tags,
                    variants: Object.create(null)
                };
            }

            if (!products[row.art_number].variants[row.colour]) {
                products[row.art_number].variants[row.colour] = {
                    colour: row.colour,
                    image: row.image,
                    stock: []
                };
            }

            if (row.size !== null) {
                products[row.art_number].variants[row.colour].stock.push({
                    size: row.size,
                    quantity: row.quantity
                });
            }

        }

        const formattedProducts = Object.values(products).map(product => ({
            ...product,
            variants: Object.values(product.variants)
        }));

        res.json(formattedProducts);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Database query failed" });
    }
});



// Admin-only customer directory. Never select or return password_hash.
app.get("/api/admin/customers", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, name, phone, shop_name, address, gst_number
            FROM customers ORDER BY id DESC
        `);
        res.set("Cache-Control", "no-store");
        return res.json(result.rows);
    } catch (error) {
        console.error("Customers directory error:", error);
        return res.status(500).json({ error: "Unable to load customers." });
    }
});

// Dashboard summary + clickable pending/completed and low-stock details
app.get("/api/dashboard", async (req, res) => {
    try {
        const [productResult, stockResult, orderResult, lowStockResult] = await Promise.all([
            pool.query(`SELECT COUNT(*) AS total_products FROM products`),
            pool.query(`SELECT COALESCE(SUM(quantity), 0) AS total_stock FROM stock`),
            pool.query(`
                SELECT COUNT(*) AS total_orders,
                       COUNT(*) FILTER (WHERE LOWER(BTRIM(status)) = 'pending') AS pending_orders,
                       COUNT(*) FILTER (WHERE LOWER(BTRIM(status)) = 'completed') AS completed_orders
                FROM orders
            `),
            pool.query(`
                SELECT p.art_number,
                       COALESCE(SUM(s.quantity), 0) AS total_stock
                FROM products p
                LEFT JOIN product_variant pv ON pv.art_number = p.art_number
                LEFT JOIN stock s ON s.variant_id = pv.id
                GROUP BY p.art_number
                HAVING COALESCE(SUM(s.quantity), 0) <= 5
                ORDER BY total_stock ASC, p.art_number ASC
            `)
        ]);

        // Split the <= 5 results into mutually exclusive categories.
        // This keeps zero-stock articles from being counted as low stock.
        const lowStockProducts = [];
        const outStockProducts = [];
        for (const row of lowStockResult.rows) {
            const product = {
                art_number: row.art_number,
                total_stock: Number(row.total_stock)
            };
            if (product.total_stock === 0) outStockProducts.push(product);
            else if (product.total_stock > 0 && product.total_stock <= 5) lowStockProducts.push(product);
        }

        res.json({
            totalProducts: Number(productResult.rows[0].total_products),
            totalStock: Number(stockResult.rows[0].total_stock),
            totalOrders: Number(orderResult.rows[0].total_orders),
            pendingOrders: Number(orderResult.rows[0].pending_orders),
            completedOrders: Number(orderResult.rows[0].completed_orders),
            lowStock: lowStockProducts.length,
            lowStockProducts,
            outStock: outStockProducts.length,
            outStockProducts
        });
    } catch (error) {
        console.error("Dashboard error:", error);
        res.status(500).json({ error: "Failed to load dashboard data" });
    }
});

app.post("/api/stock",async(req, res) => {
    try {
        const artNumber = String(req.body.art_number || "").trim();
        const colour = String(req.body.colour || "").trim();
        const size = Number(req.body.size);
        const quantity = Number(req.body.quantity);

        // validate the required fields
        if( !artNumber || !colour || !req.body.size || !req.body.quantity) {
            return res.status(400).json({
                error: "Please Fill All Fields!"
            });
        }

        // validate size and quantity (to not accept negative stocks)
        if (!Number.isInteger(size) || size <= 0) {
            return res.status(400).json({
                error: "Size must be a positive number"
            });
        }

        if (!Number.isInteger(quantity) || quantity <= 0) {
            return res.status(400).json({
                error: "Quantity must be a positive number"
            });
        }

        // check if the product exists
        const productResult = await pool.query(
            `SELECT art_number
            FROM products
            WHERE art_number = $1`,
            [artNumber]
        );

        if(productResult.rows.length === 0) {
            return res.status(404).json({
                error: "Product not found. Please Add New Product."
            });
        }

        // find the matching colour
        const variantResult = await pool.query (
            `SELECT id
            FROM product_variant
            WHERE art_number = $1
            AND LOWER(BTRIM(colour)) = LOWER(BTRIM($2::text))`,[artNumber, colour]
        );

        if (variantResult.rows.length === 0) {
            return res.status(404).json({
                error: "Colour variant not found. Please add the colour first."
            });
        }
        if (variantResult.rows.length > 1) {
            return res.status(409).json({
                error: "Multiple variants match this colour. Correct the duplicate variants before adding stock."
            });
        }

        const variantId = variantResult.rows[0].id;

        // add to existing stock or crearte a new size entry
        await pool.query(
            `INSERT INTO stock (variant_id, size, quantity)
            VALUES ($1, $2, $3)
            ON CONFLICT (variant_id, size)
            DO UPDATE SET quantity = stock.quantity + EXCLUDED.quantity`,
            [variantId, size, quantity]
        );

        res.json({
            message: "Stock added Successfully"
        });
        
    } catch (error) {
        console.error("ADD stock error:", error);

        return res.status(500).json({
            error:"Failed to add Stock"
        });
    }
});

app.post("/api/products", uploadProductImage, async (req, res) => {
    let client;

    try {
        const artNumber = String(req.body.art_number || "").trim();
        const colour = String(req.body.colour || "").trim();
        const price = Number(req.body.price);
        const mrp = Number(req.body.mrp);
        const size = Number(req.body.size);
        const quantity = Number(req.body.quantity);
        const image = req.file;

        // Validate required fields
        if (
            !artNumber ||
            !colour ||
            req.body.price === undefined ||
            req.body.price === "" ||
            req.body.mrp === undefined ||
            req.body.mrp === "" ||
            req.body.size === undefined ||
            req.body.size === "" ||
            req.body.quantity === undefined ||
            req.body.quantity === "" ||
            !image
        ) {
            deleteUploadedImage(image);

            return res.status(400).json({
                error: "Please fill all fields and upload an image."
            });
        }

        // Validate prices
        if (!Number.isFinite(price) || price <= 0) {
            deleteUploadedImage(image);

            return res.status(400).json({
                error: "Unit price must be greater than zero."
            });
        }

        if (!Number.isFinite(mrp) || mrp <= 0) {
            deleteUploadedImage(image);

            return res.status(400).json({
                error: "MRP must be greater than zero."
            });
        }

        // Validate size and quantity
        if (!Number.isInteger(size) || size <= 0) {
            deleteUploadedImage(image);

            return res.status(400).json({
                error: "Size must be a positive whole number."
            });
        }

        if (!Number.isInteger(quantity) || quantity <= 0) {
            deleteUploadedImage(image);

            return res.status(400).json({
                error: "Initial quantity must be a positive whole number."
            });
        }

        // Start database transaction
        client = await pool.connect();
        await client.query("BEGIN");

        // Check whether the art number already exists
        const productResult = await client.query(
            `SELECT art_number
             FROM products
             WHERE art_number = $1`,
            [artNumber]
        );

        const retired = await client.query('SELECT 1 FROM deleted_products WHERE art_number=$1', [artNumber]);
        if (retired.rows.length) {
            await client.query("ROLLBACK");
            deleteUploadedImage(image);
            return res.status(409).json({ error: "This art number was previously deleted and cannot be reused." });
        }
        if (productResult.rows.length > 0) {
            await client.query("ROLLBACK");
            deleteUploadedImage(image);

            return res.status(409).json({
                error: "Product already exists. Use Add Stock instead."
            });
        }

        // Create product
        await client.query(
            `INSERT INTO products (art_number, price, mrp)
             VALUES ($1, $2, $3)`,
            [artNumber, price, mrp]
        );

        // Create colour variant
        const variantResult = await client.query(
            `INSERT INTO product_variant (art_number, colour, image)
             VALUES ($1, $2, $3)
             RETURNING id`,
            [artNumber, colour, image.filename]
        );

        const variantId = variantResult.rows[0].id;

        // Create initial stock
        await client.query(
            `INSERT INTO stock (variant_id, size, quantity)
             VALUES ($1, $2, $3)`,
            [variantId, size, quantity]
        );

        await client.query("COMMIT");

        return res.status(201).json({
            message: "Product added successfully."
        });

    } catch (error) {
        await rollbackQuietly(client);

        deleteUploadedImage(req.file);

        console.error("Add product error:", error);

        if (error.code === "23505") {
            return res.status(409).json({
                error: "This product or variant already exists."
            });
        }

        return res.status(500).json({
            error: "Failed to add product."
        });

    } finally {
        if (client) {
            client.release();
        }
    }
});


app.post("/api/products/:artNumber/variants", uploadProductImage, async (req, res) => {
    let client;
    let transactionStarted = false;

    try {
        const artNumber = String(req.params.artNumber || "").trim();
        const colour = String(req.body.colour || "").trim();
        const size = Number(req.body.size);
        const quantity = Number(req.body.quantity);
        const image = req.file;

        // Validate required fields
        if (
            !artNumber ||
            !colour ||
            req.body.size === undefined || req.body.size === "" ||
            req.body.quantity === undefined || req.body.quantity === "" ||
            !image
        ) {
            deleteUploadedImage(image);

            return res.status(400).json({
                error: "Please fill all fields and upload an image."
            });
        }

        // Validate size
        if (!Number.isInteger(size) || size <= 0) {
            deleteUploadedImage(image);

            return res.status(400).json({
                error: "Size must be a positive whole number."
            });
        }

        // Validate initial quantity
        if (!Number.isInteger(quantity) || quantity <= 0) {
            deleteUploadedImage(image);

            return res.status(400).json({
                error: "Initial quantity must be a positive whole number."
            });
        }

        client = await pool.connect();

        await client.query("BEGIN");
        transactionStarted = true;

        // Check whether the parent product exists
        const productResult = await client.query(
            `SELECT art_number
             FROM products
             WHERE art_number = $1`,
            [artNumber]
        );

        if (productResult.rows.length === 0) {
            await client.query("ROLLBACK");
            transactionStarted = false;
            deleteUploadedImage(image);

            return res.status(404).json({
                error: "Product not found. Please add a new product first."
            });
        }

        // Check whether this colour already exists
        const variantCheck = await client.query(
            `SELECT id
             FROM product_variant
             WHERE art_number = $1
             AND LOWER(BTRIM(colour)) = LOWER(BTRIM($2::text))`,
            [artNumber, colour]
        );

        if (variantCheck.rows.length > 0) {
            await client.query("ROLLBACK");
            transactionStarted = false;
            deleteUploadedImage(image);

            return res.status(409).json({
                error: "This colour already exists. Please use Add Stock."
            });
        }

        // Create the new colour variant
        const variantResult = await client.query(
            `INSERT INTO product_variant (art_number, colour, image)
             VALUES ($1, $2, $3)
             RETURNING id`,
            [artNumber, colour, image.filename]
        );

        const variantId = variantResult.rows[0].id;

        // Add initial stock for the new colour
        await client.query(
            `INSERT INTO stock (variant_id, size, quantity)
             VALUES ($1, $2, $3)`,
            [variantId, size, quantity]
        );

        await client.query("COMMIT");
        transactionStarted = false;

        return res.status(201).json({
            message: "New colour variant added successfully."
        });

    } catch (error) {
        if (transactionStarted) {
            await rollbackQuietly(client);
        }

        deleteUploadedImage(req.file);

        console.error("Add colour variant error:", error);

        if (error.code === "23505") {
            return res.status(409).json({
                error: "This colour variant already exists."
            });
        }

        return res.status(500).json({
            error: "Failed to add colour variant."
        });

    } finally {
        if (client) {
            client.release();
        }
    }
});


//Orders-page
app.get("/api/orders", async (req, res) => {
    try {
        // Get all orders for the Orders page
        const result = await pool.query(`
            SELECT
                id,
                company_name,
                address,
                status
            FROM orders
            ORDER BY id DESC
        `);

        return res.json(result.rows);

    } catch (error) {
        console.error("Load orders error:", error);

        return res.status(500).json({
            error: "Failed to load orders."
        });
    }
});



// Edit an existing pending order
app.put("/api/orders/:id", async (req, res) => {

    let client;

    try {
        const orderId = Number(req.params.id);

        if (!Number.isInteger(orderId) || orderId <= 0) {
            return res.status(400).json({
                error: "Invalid order ID."
            });
        }

        const companyName = String(req.body.company_name || "").trim();
        const address = String(req.body.address || "").trim();

        if (!companyName || !address) {
            return res.status(400).json({
                error: "Company name and address are required."
            });
        }

        const validatedItems = validateOrderItems(req.body.items);

        client = await pool.connect();

        await client.query("BEGIN");

        // Lock the order so it cannot be edited/deleted/completed
        // simultaneously by another request.
        const orderResult = await client.query(
            `SELECT id, status
             FROM orders
             WHERE id = $1
             FOR UPDATE`,
            [orderId]
        );

        if (orderResult.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                error: "Order not found."
            });
        }

        if (orderResult.rows[0].status !== "Pending") {
            await client.query("ROLLBACK");

            return res.status(409).json({
                error: "Only pending orders can be edited."
            });
        }

        // Read original item prices before removing the old order items
        const previousItemsResult = await client.query(
            `SELECT
                art_number,
                colour,
                size,
                unit_price,
                mrp
            FROM order_items
            WHERE order_id = $1
            ORDER BY id`,
            [orderId]
        );

        // Store original prices using art number, colour and size
        const previousPrices = new Map();

        for (const oldItem of previousItemsResult.rows) {
            const key = JSON.stringify([
                String(oldItem.art_number).trim().toLowerCase(),
                String(oldItem.colour).trim().toLowerCase(),
                Number(oldItem.size)
            ]);

            if (!previousPrices.has(key)) {
                previousPrices.set(key, {
                    unit_price: oldItem.unit_price,
                    mrp: oldItem.mrp
                });
            }
        }

        // Restore stock from the original order
        await restoreOrderStock(client, orderId);

        // Update the order's company information
        await client.query(
            `UPDATE orders
             SET company_name = $1,
                 address = $2
             WHERE id = $3`,
            [companyName, address, orderId]
        );

        // Remove the old order items
        await client.query(
            `DELETE FROM order_items
             WHERE order_id = $1`,
            [orderId]
        );

        // Insert the revised items and deduct their stock
        for (const item of validatedItems) {

            const variantResult = await client.query(
                `SELECT
                    pv.id,
                    p.price,
                    p.mrp
                 FROM product_variant pv
                 JOIN products p
                    ON p.art_number = pv.art_number
                 WHERE pv.art_number = $1
                 AND LOWER(BTRIM(pv.colour)) = LOWER(BTRIM($2::text))`,
                [item.artNumber, item.colour]
            );

            if (variantResult.rows.length !== 1) {
                const error = new Error(
                    variantResult.rows.length === 0
                        ? `Product variant not found: ${item.artNumber} - ${item.colour}`
                        : `Multiple variants match ${item.artNumber} - ${item.colour}. Correct duplicates before changing stock.`
                );
                error.statusCode = variantResult.rows.length === 0 ? 404 : 409;
                throw error;
            }

            const variant = variantResult.rows[0];

            if (variant.price === null || variant.price === undefined ||
                !Number.isFinite(Number(variant.price)) ||
                Number(variant.price) <= 0) {
                const error = new Error(
                    `Unit price is missing for product ${item.artNumber}.`
                );
                error.statusCode = 400;
                throw error;
            }

            // Deduct stock only if sufficient quantity is available
            const stockResult = await client.query(
                `UPDATE stock
                 SET quantity = quantity - $1
                 WHERE variant_id = $2
                 AND size = $3
                 AND quantity >= $1
                 RETURNING quantity`,
                [
                    item.quantity,
                    variant.id,
                    item.size
                ]
            );

            if (stockResult.rows.length === 0) {
                const error = new Error(
                    `Insufficient stock: ${item.artNumber} - ${item.colour} - size ${item.size}`
                );
                error.statusCode = 409;
                throw error;
            }

            // Find the original price if this item already existed
            const priceKey = JSON.stringify([
                item.artNumber.toLowerCase(),
                item.colour.toLowerCase(),
                item.size
            ]);

            const previousPrice = previousPrices.get(priceKey);

            // Do not silently replace a missing historical price with today's price.
            if (previousPrice &&
                (previousPrice.unit_price === null ||
                 previousPrice.unit_price === undefined ||
                 !Number.isFinite(Number(previousPrice.unit_price)) ||
                 Number(previousPrice.unit_price) <= 0)) {
                const error = new Error(
                    `Order #${orderId} has a missing/invalid historical unit price for ${item.artNumber}. Correct the record before editing.`
                );
                error.statusCode = 409;
                throw error;
            }

            // Preserve old prices for existing items.
            // Use current product prices only for newly added items.
            const unitPrice = previousPrice
                ? previousPrice.unit_price
                : variant.price;

            const itemMrp = previousPrice
                ? previousPrice.mrp
                : variant.mrp;

            // Save the revised order item
            await client.query(
                `INSERT INTO order_items
                (order_id, art_number, colour, size, quantity, unit_price, mrp)
                VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                    orderId,
                    item.artNumber,
                    item.colour,
                    item.size,
                    item.quantity,
                    unitPrice,
                    itemMrp
                ]
            );
        }

        await client.query("COMMIT");

        return res.json({
            message: "Order updated successfully.",
            order_id: orderId
        });

    } catch (error) {

        await rollbackQuietly(client);

        console.error("Edit order error:", error);

        return res.status(error.statusCode || 500).json({
            error: error.statusCode
                ? error.message
                : "Failed to update order."
        });

    } finally {

        if (client) {
            client.release();
        }
    }
});



// Delete a pending order and restore its stock
app.delete("/api/orders/:id", async (req, res) => {

    let client;

    try {
        const orderId = Number(req.params.id);

        if (!Number.isInteger(orderId) || orderId <= 0) {
            return res.status(400).json({
                error: "Invalid order ID."
            });
        }

        client = await pool.connect();

        await client.query("BEGIN");

        // Lock the order before checking its status
        const orderResult = await client.query(
            `SELECT id, status
             FROM orders
             WHERE id = $1
             FOR UPDATE`,
            [orderId]
        );

        if (orderResult.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                error: "Order not found."
            });
        }

        if (orderResult.rows[0].status !== "Pending") {
            await client.query("ROLLBACK");

            return res.status(409).json({
                error: "Completed orders cannot be deleted."
            });
        }

        // Restore all quantities deducted when this order was created
        await restoreOrderStock(client, orderId);

        // Delete its item records first
        await client.query(
            `DELETE FROM order_items
             WHERE order_id = $1`,
            [orderId]
        );

        // Delete the order itself
        await client.query(
            `DELETE FROM orders
             WHERE id = $1`,
            [orderId]
        );

        await client.query("COMMIT");

        return res.json({
            message: "Order deleted and stock restored successfully.",
            order_id: orderId
        });

    } catch (error) {

        await rollbackQuietly(client);

        console.error("Delete order error:", error);

        return res.status(error.statusCode || 500).json({
            error: error.statusCode ? error.message : "Failed to delete order."
        });

    } finally {

        if (client) {
            client.release();
        }
    }
});


app.put("/api/orders/:id/complete", async (req, res) => {
    try {
        const orderId = Number(req.params.id);

        if (!Number.isInteger(orderId) || orderId <= 0) {
            return res.status(400).json({
                error: "Invalid order ID."
            });
        }

        const result = await pool.query(
            `UPDATE orders
             SET status = 'Completed', completed_at = NOW()
             WHERE id = $1
             AND status = 'Pending'
             RETURNING *`,
            [orderId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: "Pending order not found. It may already be completed."
            });
        }

        return res.json({
            message: "Order completed successfully.",
            order: result.rows[0]
        });

    } catch (error) {
        console.error("Complete order error:", error);

        return res.status(500).json({
            error: "Failed to complete order."
        });
    }
});


app.post("/api/orders", async (req, res) => {
    let client;

    try {
        const companyName = String(req.body.company_name || "").trim();
        const address = String(req.body.address || "").trim();
        const items = req.body.items;

        if (!companyName || !address || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                error: "Please provide company name, address, and at least one item."
            });
        }

        // Validate every item before starting the transaction
        const validatedItems = [];

        for (const item of items) {
            const artNumber = String(item.art_number || "").trim();
            const colour = String(item.colour || "").trim();
            const size = Number(item.size);
            const quantity = Number(item.quantity);

            if (
                !artNumber ||
                !colour ||
                item.size === undefined || item.size === "" ||
                item.quantity === undefined || item.quantity === ""
            ) {
                return res.status(400).json({
                    error: "Every order item must have an art number, colour, size and quantity."
                });
            }

            if (!Number.isInteger(size) || size <= 0) {
                return res.status(400).json({
                    error: `Invalid size for art number ${artNumber}.`
                });
            }

            if (!Number.isInteger(quantity) || quantity <= 0) {
                return res.status(400).json({
                    error: `Invalid quantity for art number ${artNumber}.`
                });
            }

            validatedItems.push({
                artNumber,
                colour,
                size,
                quantity
            });
        }

        client = await pool.connect();
        await client.query("BEGIN");

        const orderResult = await client.query(
            `INSERT INTO orders (company_name, address)
             VALUES ($1, $2)
             RETURNING id`,
            [companyName, address]
        );

        const orderId = orderResult.rows[0].id;

        for (const item of validatedItems) {

            // Find product and its colour variant
            const variantResult = await client.query(
                `SELECT pv.id, p.price, p.mrp
                 FROM product_variant pv
                 JOIN products p ON p.art_number = pv.art_number
                 WHERE pv.art_number = $1
                 AND LOWER(BTRIM(pv.colour)) = LOWER(BTRIM($2::text))`,
                [item.artNumber, item.colour]
            );

            if (variantResult.rows.length !== 1) {
                const error = new Error(
                    variantResult.rows.length === 0
                        ? `Product variant not found: ${item.artNumber} - ${item.colour}`
                        : `Multiple variants match ${item.artNumber} - ${item.colour}. Correct duplicates before changing stock.`
                );
                error.statusCode = variantResult.rows.length === 0 ? 404 : 409;
                throw error;
            }

            const variant = variantResult.rows[0];

            if (variant.price === null || variant.price === undefined ||
                !Number.isFinite(Number(variant.price)) ||
                Number(variant.price) <= 0) {
                const error = new Error(
                    `Unit price is missing for product ${item.artNumber}.`
                );
                error.statusCode = 400;
                throw error;
            }

            // Reduce stock only if enough stock is available
            const stockResult = await client.query(
                `UPDATE stock
                 SET quantity = quantity - $1
                 WHERE variant_id = $2
                 AND size = $3
                 AND quantity >= $1
                 RETURNING quantity`,
                [item.quantity, variant.id, item.size]
            );

            if (stockResult.rows.length === 0) {
                const error = new Error(
                    `Insufficient stock: ${item.artNumber} - ${item.colour} - size ${item.size}`
                );
                error.statusCode = 409;
                throw error;
            }

            // Save the price snapshot for this order
            await client.query(
                `INSERT INTO order_items
                 (order_id, art_number, colour, size, quantity, unit_price, mrp)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                    orderId,
                    item.artNumber,
                    item.colour,
                    item.size,
                    item.quantity,
                    variant.price,
                    variant.mrp
                ]
            );
        }

        await client.query("COMMIT");

        return res.status(201).json({
            message: "Order added successfully.",
            order_id: orderId
        });

    } catch (error) {
        await rollbackQuietly(client);

        console.error("Add order error:", error);

        return res.status(error.statusCode || 500).json({
            error: error.statusCode
                ? error.message
                : "Failed to add order."
        });

    } finally {
        if (client) {
            client.release();
        }
    }
});


app.get("/api/orders/:id", async (req, res) => {
    try {
        const orderId = Number(req.params.id);

        if (!Number.isInteger(orderId) || orderId <= 0) {
            return res.status(400).json({
                error: "Invalid order ID."
            });
        }

        const orderResult = await pool.query(`
            select id,
            company_name, 
            address,
            status from orders where id=$1`,
        [orderId]
        );
        if (orderResult.rows.length === 0){
            return res.status(404).json({
            error: "Order Not Found!!"
            }); 
        }

        const itemResult = await pool.query(`
            SELECT
                id,
                art_number,
                colour,
                size,
                quantity,
                unit_price,
                mrp
            FROM order_items
            WHERE order_id = $1
            ORDER BY id
            `, [orderId]
        );
        const order = orderResult.rows[0];
        order.items = itemResult.rows;
        res.json(order);
    } catch(error) {
        console.error(error);
        res.status(500).json({
            error: "Failed To Load Order Details"
        });
    }
});


// Admin-only PDF download for the native Share PDF action.
// All invoice values are loaded from server-side order snapshots, never client HTML.
app.get("/api/billing/orders/:id/pdf", async (req, res) => {
    const orderId = Number(req.params.id);
    if (!Number.isSafeInteger(orderId) || orderId <= 0) {
        return res.status(400).json({ error: "Invalid order ID." });
    }
    try {
        const result = await pool.query(
            `SELECT id, company_name, address, status FROM orders WHERE id=$1`, [orderId]
        );
        if (!result.rows.length) return res.status(404).json({ error: "Order not found." });
        const items = await pool.query(
            `SELECT art_number, colour, size, quantity, unit_price, mrp
             FROM order_items WHERE order_id=$1 ORDER BY id`, [orderId]
        );
        const pdf = buildInvoicePdf({ ...result.rows[0], items: items.rows });
        res.set("Content-Type", "application/pdf");
        res.set("Content-Disposition", `attachment; filename="HAWA-Invoice-${orderId}.pdf"`);
        res.set("Cache-Control", "private, no-store");
        res.set("X-Content-Type-Options", "nosniff");
        return res.status(200).send(pdf);
    } catch (error) {
        if (error.statusCode === 409) {
            return res.status(409).json({ error: error.message });
        }
        console.error("Invoice PDF generation failed:", error);
        return res.status(500).json({ error: "Unable to generate this invoice PDF." });
    }
});


// to get all orders for the billing page
app.get("/api/billing/orders", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, company_name, address, status
            FROM orders
            ORDER BY id DESC
        `);

        res.json(result.rows);
    } catch (error) {
        console.error("Failed to order billing orders:", error);
        res.status(500).json({
            error: "Failed to load billing orders."
        });
    }
});


// app.listen(3000, () => {
//     console.log("Server running at http://localhost:3000");
// });

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
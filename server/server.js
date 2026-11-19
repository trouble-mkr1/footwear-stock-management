require("dotenv").config();

const express = require("express");
const pool = require("./db");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

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
    if (req.session && req.session.isAdmin === true) {
        return next();
    }

    return res.status(401).json({
        error: "Authentication required. Please log in."
    });
}


const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: "Too many login attempts. Please try again after 15 minutes."
    }
});


// Check current login status
app.get("/api/auth/session", (req, res) => {
    res.json({
        authenticated: Boolean(req.session?.isAdmin),
        username: req.session?.adminUsername || null
    });
});


// Admin login
app.post("/api/auth/login", loginLimiter, async (req, res) => {
    try {
        const username = String(req.body?.username || "").trim();
        const password = typeof req.body?.password === "string"
            ? req.body.password
            : "";

        if (!username || !password) {
            return res.status(400).json({
                error: "Please enter your username and password."
            });
        }

        if (username !== process.env.ADMIN_USERNAME) {
            return res.status(401).json({
                error: "Invalid username or password."
            });
        }

        const passwordMatches = await bcrypt.compare(
            password,
            process.env.ADMIN_PASSWORD_HASH
        );

        if (!passwordMatches) {
            return res.status(401).json({
                error: "Invalid username or password."
            });
        }

        req.session.regenerate(error => {
            if (error) {
                console.error("Session regeneration error:", error);

                return res.status(500).json({
                    error: "Unable to create login session."
                });
            }

            req.session.isAdmin = true;
            req.session.adminUsername = username;

            req.session.save(saveError => {
                if (saveError) {
                    console.error("Session save error:", saveError);

                    return res.status(500).json({
                        error: "Unable to save login session."
                    });
                }

                return res.json({
                    message: "Login successful."
                });
            });
        });

    } catch (error) {
        console.error("Admin login error:", error);

        return res.status(500).json({
            error: "Login failed. Please try again."
        });
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
    
    if (req.session?.isAdmin) {
        return res.sendFile(path.join(publicDir, "index.html"));
    }

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


// All API routes below this point require admin authentication
app.use("/api", requireAdmin);


app.get("/api/products", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                p.art_number,
                p.price,
                p.mrp,
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

        res.json({
            totalProducts: Number(productResult.rows[0].total_products),
            totalStock: Number(stockResult.rows[0].total_stock),
            totalOrders: Number(orderResult.rows[0].total_orders),
            pendingOrders: Number(orderResult.rows[0].pending_orders),
            completedOrders: Number(orderResult.rows[0].completed_orders),
            lowStock: lowStockResult.rows.length,
            lowStockProducts: lowStockResult.rows.map(row => ({
                art_number: row.art_number,
                total_stock: Number(row.total_stock)
            }))
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
             SET status = 'Completed'
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
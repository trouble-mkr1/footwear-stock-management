const express = require("express");
const pool = require("./db");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, "../public/images"));
    },

    filename: (req, file, cb) => {
        const extension = path.extname(file.originalname).toLowerCase();
        cb(null, `${Date.now()}-${Math.round(Math.random() * 1E9)}${extension}`);
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
    upload.single("image")(req, res, (error) => {
        if (error) {
            return res.status(400).json({
                error: error.code === "LIMIT_FILE_SIZE"
                    ? "Image must be smaller than 5 MB."
                    : error.message
            });
        }

        next();
    });
};

function deleteUploadedImage(file) {
    if (file) {
        fs.unlink(file.path, (error) => {
            if (error) {
                console.error("Could not delete uploaded image:", error);
            }
        });
    }
}


app.use(express.json());
// app.use(express.static("public"));
app.use(express.static(path.join(__dirname, "../public")));

app.get("/", (req, res) => {
    res.send("Footwear Stock Management Server");
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

app.get("/test-db", async (req, res) => {
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

        const products = {};

        for (const row of result.rows) {
            if (!products[row.art_number]) {
                products[row.art_number] = {
                    art_number: row.art_number,
                    price: row.price,
                    mrp: row.mrp,
                    variants: {}
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


// Dashboard summary API
app.get("/api/dashboard", async (req, res) => {
    try {
        // Get total number of products
        const productResult = await pool.query(`
            SELECT COUNT(*) AS total_products
            FROM products
        `);

        // Get total available stock
        const stockResult = await pool.query(`
            SELECT COALESCE(SUM(quantity), 0) AS total_stock
            FROM stock
        `);

        // Get total number of orders
        const orderResult = await pool.query(`
            SELECT COUNT(*) AS total_orders
            FROM orders
        `);

        // Get number of low-stock products
        const lowStockResult = await pool.query(`
            SELECT COUNT(*) AS low_stock
            FROM (
                SELECT p.art_number
                FROM products p
                LEFT JOIN product_variant pv
                    ON p.art_number = pv.art_number
                LEFT JOIN stock s
                    ON pv.id = s.variant_id
                GROUP BY p.art_number
                HAVING COALESCE(SUM(s.quantity), 0) <= 5
            ) AS low_stock_products
        `);

        res.json({
            totalProducts: Number(productResult.rows[0].total_products),
            totalStock: Number(stockResult.rows[0].total_stock),
            totalOrders: Number(orderResult.rows[0].total_orders),
            lowStock: Number(lowStockResult.rows[0].low_stock)
        });

    } catch (error) {
        console.error("Dashboard Error:", error);

        res.status(500).json({
            error: "Failed to load dashboard data"
        });
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
            AND LOWER(TRIM(colour)) = lower($2)`,[artNumber, colour]
        );

        if(variantResult.rows.length === 0) {
            return res.status(404).json({
                error:"Colour Variant Not Found. Please Add New Product Variant"
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
        if (client) {
            await client.query("ROLLBACK");
        }

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
             AND LOWER(TRIM(colour)) = LOWER($2)`,
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
        if (client && transactionStarted) {
            await client.query("ROLLBACK");
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
app.get("/api/orders", async(req,res) => {
    try {
        const result = await pool.query(`
            select * from orders
            where status='Pending'
            ORDER BY id DESC
        `);
        res.json(result.rows);
    }catch (error) {
        console.log(error);
        res.status(500).json({error: "Failed To Load Orders!!"});
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
                 AND LOWER(TRIM(pv.colour)) = LOWER($2)`,
                [item.artNumber, item.colour]
            );

            if (variantResult.rows.length === 0) {
                const error = new Error(
                    `Product variant not found: ${item.artNumber} - ${item.colour}`
                );
                error.statusCode = 404;
                throw error;
            }

            const variant = variantResult.rows[0];

            if (variant.price === null || variant.price === undefined) {
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
        if (client) {
            await client.query("ROLLBACK");
        }

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
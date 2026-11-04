const express = require("express");
const pool = require("./db");
const multer = require("multer");
const path = require("path");
const { error } = require("console");

const app = express();

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, "../public/images"));
    },

    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage }); 

app.use(express.json());
app.use(express.static("public"));

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


app.post("/api/stock",async(req,res)=>{
    try{
        const{art_number,colour,size,quantity}=req.body;

        if( !art_number|| !colour|| !size|| !quantity){
            return res.status(400).json({
                error: "Please Fill All Fields!"
            });
        }

        const productResult=await pool.query(
            `select art_number 
            from products 
            where art_number=$1`,[art_number]
        );

        if(productResult.rows.length===0){
            return res.status(404).json({
                error: "Product not found. Please Add New Product."
            });
        }

        const variantResult=await pool.query(
            `select id from product_variant where art_number=$1 and lower(colour)=lower($2)`,[art_number,colour.trim()]
        );
        if(variantResult.rows.length===0)
        {
            return res.status(404).json({error:"Product Not Found. Please Add New Product"});
        }
        const variantId=variantResult.rows[0].id;

        const stockResult=await pool.query(
            `select id from stock where variant_id= $1 and size= $2`,[variantId,size]
        );
        if(stockResult.rows.length>0)
            {
                await pool.query(
                    `update stock 
                    set quantity=quantity + $1
                     where variant_id=$2 
                     and size=$3`,
                     [quantity,variantId,size]
                );
            }
        else{
            await pool.query(
                `insert into 
                stock (variant_id,size,quantity) 
                values ($1,$2,$3)`,
                [variantId,size,quantity]   
            );
        }
        res.json({
            message:"Stock added Successfully"
        });
        
    }catch(error){
        console.error(error);
        res.status(500).json({
            error:"Failed  To Add Stock"
        });
    }
});
app.post("/api/products", upload.single("image"), async (req, res) => {
    try {

        const { art_number, colour, mrp, price, size, quantity } = req.body;
        
        const image=req.file;

        
        if (!art_number || !colour || !mrp || !price || !size || !quantity || !image) {
            return res.status(400).json({
                error: "Please fill all fields."
            });
        }

        
        const productResult = await pool.query(
            `SELECT art_number
             FROM products
             WHERE art_number = $1`,
            [art_number]
        );

        if (productResult.rows.length > 0) {
            return res.status(409).json({
                error: "Product already exists. Use Add Stock instead."
            });
        }

        
        await pool.query(
            `INSERT INTO products (art_number, price, mrp)
             VALUES ($1, $2, $3)`,
            [art_number, price, mrp]
        );

        
        const variantResult = await pool.query(
            `INSERT INTO product_variant (art_number, colour, image)
             VALUES ($1, $2, $3)
             RETURNING id`,
            [art_number, colour.trim(), image.filename]
        );

        const variantId = variantResult.rows[0].id;

       
        await pool.query(
            `INSERT INTO stock (variant_id, size, quantity)
             VALUES ($1, $2, $3)`,
            [variantId, size, quantity]
        );

        res.json({
            message: "Product added successfully."
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: "Failed to add product."
        });
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
app.put("/api/orders/:id/complete", async(req, res) => {
    try {
        const orderId = req.params.id;
        const result = await pool.query(
            `update orders
             set status = 'Completed'
             where id = $1
             RETURNING *`,
             [orderId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({
                error: "Order Not Found!!"
            });
        }
        res.json({
            message: "ORDER COMPLETED SUCCESSFULLY..",
            order: result.rows[0]
        });
    }catch (error) {
        console.error(error);
        res.status(500).json({
            error: "Failed To Complete Order!!!"
        });
    }
});

app.post("/api/orders", async(req,res) => {

    const client = await pool.connect();

    try {
        const {company_name, address, items} = req.body;
        if (!company_name || !address || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                error: "Please provide company name, address, and atleast one item."
            });
        }
        await client.query('BEGIN');

        const orderResult = await client.query(`
            insert into orders (company_name, address)
            values($1,$2) RETURNING id`,
            [company_name, address] );

            const orderId = orderResult.rows[0].id;

            // for (const item of items) {
            //     await client.query(`
            //         insert into order_items (order_id, art_number, colour, size, quantity)
            //         values ($1, $2, $3, $4, $5)`,
            //         [orderId, item.art_number, item.colour, item.size, item.quantity]
            //     );
            // }

            for (const item of items) {

                if (!item.art_number || !item.colour || !item.size || !item.quantity || item.quantity <= 0) {
                    throw new Error("Invalid order item.")
                }

                // find the product variant
                const variantResult = await client.query(`
                    SELECT id
                    FROM product_variant
                    WHERE art_number = $1
                    AND LOWER(colour) = LOWER($2)
                `, [item.art_number, item.colour.trim()]);

                if (variantResult.rows.length === 0) {
                    throw new Error(
                        `Product variant not found: ${item.art_number} - ${item.colour}`
                    );
                }

                const variantId = variantResult.rows[0].id;

                // now reduce stock only if there r enough qty available
                const stockResult = await client.query(`
                    UPDATE stock
                    SET quantity = quantity - $1
                    WHERE variant_id = $2
                    AND size = $3
                    AND quantity >= $1
                    RETURNING quantity
                `, [
                    item.quantity,
                    variantId,
                    item.size
                ]);

                if (stockResult.rows.length === 0) {
                    throw new Error(
                        `Insufficient stock: ${item.art_number} - ${item.colour} - size ${item.size}`
                    );
                }

                // save current products prices when placing orders
                const priceResult = await client.query(`
                    
                    SELECT price, mrp
                    FROM products
                    WHERE art_nummber = $1
                `, [item.art_number]);

                if (priceResult.rows.length === 0) {
                    throw new Error(`Product not found: ${item.art_number}`);
                }

                const unitPrice = priceResult.rows[0].price;
                const mrp = priceResult.rows[0].mrp;

                // save the order item along with its current price
                await client.query(`
                    INSERT INTO order_items
                    (order_id, art_number, colour, size, quantity, unit_price, mrp)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                `, [
                    orderId,
                    item.art_number,
                    item.colour,
                    item.size,
                    item.quantity,
                    unitPrice,
                    mrp
                ]);
            }

            await client.query("COMMIT");

            res.status(201).json({
                message: "Order Added Sucessfully..",
                order_id: orderId
            });
    }catch (error) {
        await client.query("ROLLBACK");

        console.error(error);

        res.status(500).json({
            error: "Failed To Add Orders!!!"
        });
    } finally {
        client.release();
    }
});

app.get("/api/orders/:id", async (req, res) => {
    try {
        const orderId = req.params.id;

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


app.listen(3000, () => {
    console.log("Server running at http://localhost:3000");
});

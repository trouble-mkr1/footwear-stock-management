const express = require("express");
const pool = require("./db");

const app = express();

app.use(express.json());
app.use(express.static("public"));

app.get("/", (req, res) => {
    res.send("Footwear Stock Management Server");
});

app.get("/test-db", async (req, res) => {
    try {
        const result = await pool.query("SELECT NOW()");
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

        const variantResult=await pool.query(
            `select id from product_variant where art_number=$1 and colour=$2`,[art_number,colour]
        );
        if(variantResult.rows.length===0)
        {
            return res.status(404).json({error:"Product Variant Not Found"});
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

app.listen(3000, () => {
    console.log("Server running at http://localhost:3000");
});

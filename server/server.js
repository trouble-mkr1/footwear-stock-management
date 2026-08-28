const express = require("express");
const pool = require("./db");
// const path = require("path");

const app = express();
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

app.listen(3000, () => {
    console.log("Server running at http://localhost:3000");
});
// const PORT = 3000;

// app.use(express.static(path.join(__dirname, "../public")));

// app.listen(PORT, () => {
//     console.log(`server running at http://localhost:${PORT}`);
// });
const express = require("express");

const app = express();

const PORT = 3000;

app.get("/", (req, res) => {
    res.send("Footwear Stock Management System");
});

app.listen(PORT, () => {
    console.log(`server running at http://localhost:${PORT}`);
});
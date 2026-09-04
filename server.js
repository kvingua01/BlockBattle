const express = require("express");

const app = express();

app.get("/", (req, res) => {
    res.send("BLOCK BATTLE SERVER WORKS");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log("TEST SERVER RUNNING ON PORT " + PORT);
});

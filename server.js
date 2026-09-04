const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// This tells the server where our game files are.
app.use(express.static(path.join(__dirname, "public")));

// Explicitly send the game page when someone visits the website.
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Keeps track of everyone currently playing.
const players = {};

io.on("connection", (socket) => {
    console.log("Player connected:", socket.id);

    // Create the new player.
    players[socket.id] = {
        x: 100 + Math.random() * 300,
        y: 500,
        color:
            "#" +
            Math.floor(Math.random() * 16777215)
                .toString(16)
                .padStart(6, "0")
    };

    // Tell the new player about everyone already in the game.
    socket.emit("currentPlayers", players);

    // Tell everyone else about the new player.
    socket.broadcast.emit("newPlayer", {
        id: socket.id,
        ...players[socket.id]
    });

    // Receive movement from a player and send it to everyone else.
    socket.on("playerMove", (data) => {
        if (!players[socket.id]) return;

        players[socket.id].x = data.x;
        players[socket.id].y = data.y;

        socket.broadcast.emit("playerMoved", {
            id: socket.id,
            x: data.x,
            y: data.y
        });
    });

    // Send knockback to a specific player.
    socket.on("knockbackPlayer", (data) => {
        if (!data || !data.targetId) return;

        io.to(data.targetId).emit("receiveKnockback", {
            velocityX: data.velocityX,
            velocityY: data.velocityY
        });
    });

    // Send a fired fireball to the other players.
    socket.on("shootFireball", (fireball) => {
        socket.broadcast.emit("spawnFireball", fireball);
    });

    // Remove a fireball for the other players.
    socket.on("removeFireball", (data) => {
        socket.broadcast.emit("removeFireball", data);
    });

    // Remove a player when they leave.
    socket.on("disconnect", () => {
        console.log("Player disconnected:", socket.id);

        delete players[socket.id];

        io.emit("playerDisconnected", socket.id);
    });
});

// Render gives us a PORT automatically.
// When running on your own computer, it uses port 3000.
const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
    console.log("");
    console.log("==============================");
    console.log("   BLOCK BATTLE IS RUNNING!");
    console.log("==============================");
    console.log("");
    console.log("Server running on port " + PORT);
    console.log("");
});

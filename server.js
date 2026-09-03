const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// This tells the server where our game files are.
app.use(express.static(path.join(__dirname, "public")));

// Keeps track of everyone currently playing.
const players = {};

io.on("connection", (socket) => {
    console.log("Player connected:", socket.id);

    // Create the new player.
    players[socket.id] = {
        x: 100 + Math.random() * 300,
        y: 500,
        color: "#" + Math.floor(Math.random() * 16777215)
            .toString(16)
            .padStart(6, "0")
    };

    // Give the new player the current player list.
    socket.emit("currentPlayers", players);

    // Tell everyone else that a new player joined.
    socket.broadcast.emit("newPlayer", {
        id: socket.id,
        ...players[socket.id]
    });

    // PLAYER MOVEMENT
    socket.on("playerMove", (data) => {
        if (!players[socket.id]) {
            return;
        }

        players[socket.id].x = data.x;
        players[socket.id].y = data.y;

        socket.broadcast.emit("playerMoved", {
            id: socket.id,
            x: data.x,
            y: data.y
        });
    });

    // NORMAL SHOVE OR FIREBALL KNOCKBACK
    socket.on("knockbackPlayer", (data) => {
        if (!data || !data.targetId) {
            return;
        }

        io.to(data.targetId).emit("receiveKnockback", {
            velocityX: data.velocityX,
            velocityY: data.velocityY
        });
    });

    // FIREBALL CREATED
    socket.on("shootFireball", (fireball) => {
        socket.broadcast.emit("spawnFireball", fireball);
    });

    // FIREBALL REMOVED AFTER A HIT
    socket.on("removeFireball", (data) => {
        socket.broadcast.emit("removeFireball", data);
    });

    // PLAYER LEAVES
    socket.on("disconnect", () => {
        console.log("Player disconnected:", socket.id);

        delete players[socket.id];

        io.emit("playerDisconnected", socket.id);
    });
});

// Start BlockBattle.
server.listen(3000, () => {
    console.log("");
    console.log("==============================");
    console.log("   BLOCK BATTLE IS RUNNING!");
    console.log("==============================");
    console.log("");
    console.log("Open:");
    console.log("http://localhost:3000");
    console.log("");
});
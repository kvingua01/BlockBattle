const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve the BlockBattle game files
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

const players = {};

io.on("connection", (socket) => {
    console.log("Player connected:", socket.id);

    players[socket.id] = {
        x: 100 + Math.random() * 300,
        y: 500,
        color:
            "#" +
            Math.floor(Math.random() * 16777215)
                .toString(16)
                .padStart(6, "0")
    };

    socket.emit("currentPlayers", players);

    socket.broadcast.emit("newPlayer", {
        id: socket.id,
        ...players[socket.id]
    });

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

    socket.on("knockbackPlayer", (data) => {
        if (!data || !data.targetId) return;

        io.to(data.targetId).emit("receiveKnockback", {
            velocityX: data.velocityX,
            velocityY: data.velocityY
        });
    });

    socket.on("shootFireball", (fireball) => {
        socket.broadcast.emit("spawnFireball", fireball);
    });

    socket.on("removeFireball", (data) => {
        socket.broadcast.emit("removeFireball", data);
    });

    socket.on("disconnect", () => {
        console.log("Player disconnected:", socket.id);

        delete players[socket.id];

        io.emit("playerDisconnected", socket.id);
    });
});

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

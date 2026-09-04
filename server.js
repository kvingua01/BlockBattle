const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

const MAX_HEALTH = 20; // 20 half-hearts = 10 full hearts
const players = {};

function createPlayer() {
    return {
        x: 100 + Math.random() * 300,
        y: 500,
        color:
            "#" +
            Math.floor(Math.random() * 16777215)
                .toString(16)
                .padStart(6, "0"),
        health: MAX_HEALTH,
        dead: false,
        meleeHits: 0
    };
}

io.on("connection", (socket) => {
    console.log("Player connected:", socket.id);

    players[socket.id] = createPlayer();

    socket.emit("currentPlayers", players);

    socket.broadcast.emit("newPlayer", {
        id: socket.id,
        ...players[socket.id]
    });

    socket.on("playerMove", (data) => {
        const player = players[socket.id];

        if (!player || player.dead) return;

        player.x = data.x;
        player.y = data.y;

        socket.broadcast.emit("playerMoved", {
            id: socket.id,
            x: data.x,
            y: data.y
        });
    });

    socket.on("knockbackPlayer", (data) => {
        if (!data || !data.targetId) return;

        const attacker = players[socket.id];
        const target = players[data.targetId];

        if (!attacker || attacker.dead) return;
        if (!target || target.dead) return;

        io.to(data.targetId).emit("receiveKnockback", {
            velocityX: data.velocityX,
            velocityY: data.velocityY
        });
    });

    // FIREBALL = 1 FULL HEART = 2 HALF-HEART POINTS
    socket.on("fireballHit", (data) => {
        if (!data || !data.targetId) return;

        const attacker = players[socket.id];
        const target = players[data.targetId];

        if (!attacker || attacker.dead) return;
        if (!target || target.dead) return;

        target.health -= 2;

        if (target.health <= 0) {
            target.health = 0;
            target.dead = true;
        }

        io.emit("playerHealthChanged", {
            id: data.targetId,
            health: target.health,
            dead: target.dead
        });
    });

    // F MELEE ATTACK
    socket.on("meleeHit", (data) => {
        if (!data || !data.targetId) return;

        const attacker = players[socket.id];
        const target = players[data.targetId];

        if (!attacker || attacker.dead) return;
        if (!target || target.dead) return;

        attacker.meleeHits += 1;

        // Every fifth successful melee hit does half a heart.
        if (attacker.meleeHits % 5 === 0) {
            target.health -= 1;

            if (target.health <= 0) {
                target.health = 0;
                target.dead = true;
            }

            io.emit("playerHealthChanged", {
                id: data.targetId,
                health: target.health,
                dead: target.dead
            });
        }

        io.to(socket.id).emit("meleeCountChanged", {
            count: attacker.meleeHits
        });

        // Small knockback on every melee hit.
        io.to(data.targetId).emit("receiveKnockback", {
            velocityX: data.velocityX,
            velocityY: -2
        });
    });

    socket.on("respawnPlayer", () => {
        const player = players[socket.id];

        if (!player || !player.dead) return;

        player.x = 100 + Math.random() * 300;
        player.y = 500;
        player.health = MAX_HEALTH;
        player.dead = false;
        player.meleeHits = 0;

        io.emit("playerRespawned", {
            id: socket.id,
            x: player.x,
            y: player.y,
            health: player.health,
            dead: false
        });
    });

    socket.on("shootFireball", (fireball) => {
        const player = players[socket.id];

        if (!player || player.dead) return;

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

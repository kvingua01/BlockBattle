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

const MAX_HEALTH = 20;
// We use 20 health points because:
// 2 points = 1 full heart
// 1 point = 1/2 heart

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

        // Counts successful melee hits.
        // Resets after 5.
        meleeHits: 0
    };
}

io.on("connection", (socket) => {
    console.log("Player connected:", socket.id);

    players[socket.id] = createPlayer();

    // Send all current players to the new player.
    socket.emit("currentPlayers", players);

    // Tell everyone else about the new player.
    socket.broadcast.emit("newPlayer", {
        id: socket.id,
        ...players[socket.id]
    });

    // -------------------------
    // MOVEMENT
    // -------------------------

    socket.on("playerMove", (data) => {
        const player = players[socket.id];

        if (!player || player.dead) return;

        player.x = data.x;
        player.y = data.y;

        socket.broadcast.emit("playerMoved", {
            id: socket.id,
            x: player.x,
            y: player.y
        });
    });

    // -------------------------
    // NORMAL SHOVE
    // -------------------------

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

    // -------------------------
    // FIREBALL
    // -------------------------

    socket.on("shootFireball", (fireball) => {
        const player = players[socket.id];

        if (!player || player.dead) return;

        socket.broadcast.emit("spawnFireball", fireball);
    });

    socket.on("removeFireball", (data) => {
        socket.broadcast.emit("removeFireball", data);
    });

    // Fireball does ONE FULL HEART.
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

    // -------------------------
    // MELEE ATTACK
    // -------------------------

    socket.on("meleeHit", (data) => {
        if (!data || !data.targetId) return;

        const attacker = players[socket.id];
        const target = players[data.targetId];

        if (!attacker || attacker.dead) return;
        if (!target || target.dead) return;

        // Every successful melee hit counts.
        attacker.meleeHits += 1;

        // Small shove on every melee hit.
        io.to(data.targetId).emit("receiveKnockback", {
            velocityX: data.velocityX,
            velocityY: -2
        });

        // Every fifth hit removes HALF A HEART.
        if (attacker.meleeHits >= 5) {
            attacker.meleeHits = 0;

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

        // Update attacker's 0/5 melee meter.
        io.to(socket.id).emit("meleeCountChanged", {
            count: attacker.meleeHits
        });
    });

    // -------------------------
    // RESPAWN
    // -------------------------

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

    // -------------------------
    // DISCONNECT
    // -------------------------

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

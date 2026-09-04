const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
    res.sendFile(
        path.join(
            __dirname,
            "public",
            "index.html"
        )
    );
});

// =====================================================
// GAME SETTINGS
// =====================================================

const MAX_HEALTH = 20;

// 20 health points = 10 hearts
// 2 points = 1 full heart
// 1 point = 1/2 heart

const PLATFORM_CHANGE_TIME =
    10 * 60 * 1000;

// 10 minutes

// =====================================================
// PLATFORM LAYOUTS
// =====================================================
//
// These are NOT completely random individual platforms.
//
// Instead, the server randomly chooses one of these
// tested layouts.
//
// That prevents impossible levels where there is
// no way to reach the top.
//
// The bottom floor is always present.
// =====================================================

const PLATFORM_LAYOUTS = [

    // =================================================
    // LAYOUT 1
    // =================================================

    [
        { x: 0, y: 570, width: 800, height: 30 },

        { x: 80, y: 490, width: 180, height: 20 },

        { x: 350, y: 420, width: 180, height: 20 },

        { x: 100, y: 340, width: 170, height: 20 },

        { x: 430, y: 270, width: 170, height: 20 },

        { x: 180, y: 190, width: 170, height: 20 },

        { x: 450, y: 110, width: 170, height: 20 },

        { x: 280, y: 40, width: 220, height: 20 }
    ],

    // =================================================
    // LAYOUT 2
    // =================================================

    [
        { x: 0, y: 570, width: 800, height: 30 },

        { x: 500, y: 500, width: 180, height: 20 },

        { x: 270, y: 430, width: 170, height: 20 },

        { x: 70, y: 355, width: 180, height: 20 },

        { x: 330, y: 285, width: 180, height: 20 },

        { x: 540, y: 210, width: 170, height: 20 },

        { x: 290, y: 135, width: 180, height: 20 },

        { x: 80, y: 60, width: 190, height: 20 }
    ],

    // =================================================
    // LAYOUT 3
    // =================================================

    [
        { x: 0, y: 570, width: 800, height: 30 },

        { x: 100, y: 500, width: 160, height: 20 },

        { x: 310, y: 440, width: 160, height: 20 },

        { x: 520, y: 375, width: 160, height: 20 },

        { x: 300, y: 305, width: 160, height: 20 },

        { x: 80, y: 235, width: 160, height: 20 },

        { x: 300, y: 165, width: 160, height: 20 },

        { x: 520, y: 95, width: 160, height: 20 },

        { x: 300, y: 30, width: 200, height: 20 }
    ],

    // =================================================
    // LAYOUT 4
    // =================================================

    [
        { x: 0, y: 570, width: 800, height: 30 },

        { x: 310, y: 500, width: 180, height: 20 },

        { x: 90, y: 430, width: 180, height: 20 },

        { x: 360, y: 360, width: 180, height: 20 },

        { x: 560, y: 290, width: 150, height: 20 },

        { x: 320, y: 220, width: 170, height: 20 },

        { x: 100, y: 150, width: 170, height: 20 },

        { x: 350, y: 80, width: 180, height: 20 }
    ],

    // =================================================
    // LAYOUT 5
    // =================================================

    [
        { x: 0, y: 570, width: 800, height: 30 },

        { x: 560, y: 500, width: 160, height: 20 },

        { x: 380, y: 435, width: 160, height: 20 },

        { x: 180, y: 370, width: 160, height: 20 },

        { x: 20, y: 305, width: 160, height: 20 },

        { x: 220, y: 240, width: 160, height: 20 },

        { x: 430, y: 175, width: 160, height: 20 },

        { x: 600, y: 110, width: 150, height: 20 },

        { x: 350, y: 45, width: 180, height: 20 }
    ],

    // =================================================
    // LAYOUT 6
    // =================================================

    [
        { x: 0, y: 570, width: 800, height: 30 },

        { x: 50, y: 500, width: 180, height: 20 },

        { x: 250, y: 445, width: 160, height: 20 },

        { x: 470, y: 390, width: 180, height: 20 },

        { x: 290, y: 325, width: 160, height: 20 },

        { x: 80, y: 260, width: 180, height: 20 },

        { x: 300, y: 195, width: 180, height: 20 },

        { x: 520, y: 130, width: 170, height: 20 },

        { x: 300, y: 60, width: 200, height: 20 }
    ]
];

// =====================================================
// CURRENT PLATFORM LAYOUT
// =====================================================

let currentLayoutIndex = 0;

let currentPlatforms =
    PLATFORM_LAYOUTS[currentLayoutIndex];

// =====================================================
// CHOOSE NEW RANDOM LAYOUT
// =====================================================

function chooseNewPlatformLayout() {

    let newIndex;

    // Make sure it doesn't pick the exact
    // same layout twice in a row.

    do {

        newIndex =
            Math.floor(
                Math.random() *
                PLATFORM_LAYOUTS.length
            );

    } while (
        newIndex === currentLayoutIndex &&
        PLATFORM_LAYOUTS.length > 1
    );

    currentLayoutIndex =
        newIndex;

    currentPlatforms =
        PLATFORM_LAYOUTS[
            currentLayoutIndex
        ];

    console.log(
        "Platform layout changed to:",
        currentLayoutIndex + 1
    );

    // Everyone changes at the same time.

    io.emit(
        "platformLayoutChanged",
        {
            platforms:
                currentPlatforms,

            layoutNumber:
                currentLayoutIndex + 1
        }
    );
}

// =====================================================
// CHANGE EVERY 10 MINUTES
// =====================================================

setInterval(
    chooseNewPlatformLayout,
    PLATFORM_CHANGE_TIME
);

// =====================================================
// PLAYERS
// =====================================================

const players = {};

function createPlayer() {

    return {

        x:
            100 +
            Math.random() * 300,

        y: 500,

        color:
            "#" +
            Math.floor(
                Math.random() *
                16777215
            )
                .toString(16)
                .padStart(6, "0"),

        health:
            MAX_HEALTH,

        dead:
            false,

        facing:
            1
    };
}

// =====================================================
// SOCKET CONNECTION
// =====================================================

io.on(
    "connection",
    (socket) => {

        console.log(
            "Player connected:",
            socket.id
        );

        players[socket.id] =
            createPlayer();

        // Send current players.

        socket.emit(
            "currentPlayers",
            players
        );

        // IMPORTANT:
        // Send the CURRENT platform layout
        // to anyone who joins the game.

        socket.emit(
            "platformLayoutChanged",
            {
                platforms:
                    currentPlatforms,

                layoutNumber:
                    currentLayoutIndex + 1
            }
        );

        // Tell everyone else
        // about the new player.

        socket.broadcast.emit(
            "newPlayer",
            {
                id:
                    socket.id,

                ...players[socket.id]
            }
        );

        // =================================================
        // MOVEMENT
        // =================================================

        socket.on(
            "playerMove",
            (data) => {

                const player =
                    players[socket.id];

                if (
                    !player ||
                    player.dead
                ) {
                    return;
                }

                player.x =
                    data.x;

                player.y =
                    data.y;

                if (
                    data.facing === 1 ||
                    data.facing === -1
                ) {

                    player.facing =
                        data.facing;
                }

                socket.broadcast.emit(
                    "playerMoved",
                    {
                        id:
                            socket.id,

                        x:
                            player.x,

                        y:
                            player.y,

                        facing:
                            player.facing
                    }
                );
            }
        );

        // =================================================
        // NORMAL SHOVE
        // =================================================

        socket.on(
            "knockbackPlayer",
            (data) => {

                if (
                    !data ||
                    !data.targetId
                ) {
                    return;
                }

                const attacker =
                    players[socket.id];

                const target =
                    players[
                        data.targetId
                    ];

                if (
                    !attacker ||
                    attacker.dead
                ) {
                    return;
                }

                if (
                    !target ||
                    target.dead
                ) {
                    return;
                }

                io.to(
                    data.targetId
                ).emit(
                    "receiveKnockback",
                    {
                        velocityX:
                            data.velocityX,

                        velocityY:
                            data.velocityY
                    }
                );
            }
        );

        // =================================================
        // FIREBALL
        // =================================================

        socket.on(
            "shootFireball",
            (fireball) => {

                const player =
                    players[socket.id];

                if (
                    !player ||
                    player.dead
                ) {
                    return;
                }

                socket.broadcast.emit(
                    "spawnFireball",
                    fireball
                );
            }
        );

        socket.on(
            "removeFireball",
            (data) => {

                socket.broadcast.emit(
                    "removeFireball",
                    data
                );
            }
        );

        // Fireball = ONE HEART

        socket.on(
            "fireballHit",
            (data) => {

                if (
                    !data ||
                    !data.targetId
                ) {
                    return;
                }

                const attacker =
                    players[socket.id];

                const target =
                    players[
                        data.targetId
                    ];

                if (
                    !attacker ||
                    attacker.dead
                ) {
                    return;
                }

                if (
                    !target ||
                    target.dead
                ) {
                    return;
                }

                target.health -= 2;

                if (
                    target.health <= 0
                ) {

                    target.health = 0;

                    target.dead = true;
                }

                io.emit(
                    "playerHealthChanged",
                    {
                        id:
                            data.targetId,

                        health:
                            target.health,

                        dead:
                            target.dead
                    }
                );
            }
        );

        // =================================================
        // SWORD VISUAL
        // =================================================

        socket.on(
            "meleeSwing",
            (data) => {

                const player =
                    players[socket.id];

                if (
                    !player ||
                    player.dead
                ) {
                    return;
                }

                const direction =
                    data &&
                    data.facing === -1
                        ? -1
                        : 1;

                player.facing =
                    direction;

                io.emit(
                    "playerMeleeSwing",
                    {
                        id:
                            socket.id,

                        facing:
                            direction
                    }
                );
            }
        );

        // =================================================
        // SWORD DAMAGE
        // =================================================
        //
        // Every sword hit =
        // HALF A HEART.
        // =================================================

        socket.on(
            "meleeHit",
            (data) => {

                if (
                    !data ||
                    !data.targetId
                ) {
                    return;
                }

                const attacker =
                    players[socket.id];

                const target =
                    players[
                        data.targetId
                    ];

                if (
                    !attacker ||
                    attacker.dead
                ) {
                    return;
                }

                if (
                    !target ||
                    target.dead
                ) {
                    return;
                }

                target.health -= 1;

                if (
                    target.health <= 0
                ) {

                    target.health = 0;

                    target.dead = true;
                }

                io.to(
                    data.targetId
                ).emit(
                    "receiveKnockback",
                    {
                        velocityX:
                            data.velocityX,

                        velocityY:
                            -2
                    }
                );

                io.emit(
                    "playerHealthChanged",
                    {
                        id:
                            data.targetId,

                        health:
                            target.health,

                        dead:
                            target.dead
                    }
                );
            }
        );

        // =================================================
        // RESPAWN
        // =================================================

        socket.on(
            "respawnPlayer",
            () => {

                const player =
                    players[socket.id];

                if (
                    !player ||
                    !player.dead
                ) {
                    return;
                }

                player.x =
                    100 +
                    Math.random() *
                        300;

                player.y =
                    500;

                player.health =
                    MAX_HEALTH;

                player.dead =
                    false;

                player.facing =
                    1;

                io.emit(
                    "playerRespawned",
                    {
                        id:
                            socket.id,

                        x:
                            player.x,

                        y:
                            player.y,

                        health:
                            player.health,

                        dead:
                            false,

                        facing:
                            player.facing
                    }
                );
            }
        );

        // =================================================
        // DISCONNECT
        // =================================================

        socket.on(
            "disconnect",
            () => {

                console.log(
                    "Player disconnected:",
                    socket.id
                );

                delete players[
                    socket.id
                ];

                io.emit(
                    "playerDisconnected",
                    socket.id
                );
            }
        );
    }
);

// =====================================================
// START SERVER
// =====================================================

const PORT =
    process.env.PORT || 3000;

server.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log("");
        console.log(
            "=============================="
        );
        console.log(
            "   BLOCK BATTLE IS RUNNING!"
        );
        console.log(
            "=============================="
        );
        console.log("");

        console.log(
            "Server running on port " +
            PORT
        );

        console.log(
            "Platforms change every 10 minutes."
        );

        console.log("");
    }
);

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

// =====================================================
// GAME CONSTANTS
// =====================================================

const PLAYER_SIZE = 30;

const BASE_MAX_HEALTH = 20;     // 10 hearts
const ABSOLUTE_MAX_HEALTH = 40; // 20 hearts

const PLATFORM_CHANGE_TIME = 10 * 60 * 1000;

const POWERUP_TYPES = [
    "health",
    "dash",
    "greenFireball"
];

// =====================================================
// PLAYERS
// =====================================================

const players = {};

// =====================================================
// POWERUPS
// =====================================================

const powerups = {};

let powerupCounter = 0;

// =====================================================
// PLATFORMS
// =====================================================

let platforms = [];

function clamp(value, minimum, maximum) {
    return Math.max(
        minimum,
        Math.min(maximum, value)
    );
}

function generatePlatforms() {

    const newPlatforms = [];

    // Ground
    newPlatforms.push({
        x: 0,
        y: 570,
        width: 800,
        height: 30
    });

    // These heights guarantee a climbable path.
    const heights = [
        490,
        410,
        330,
        250,
        170,
        90,
        30
    ];

    let previousX =
        80 + Math.random() * 450;

    for (
        let i = 0;
        i < heights.length;
        i++
    ) {

        const width =
            i === heights.length - 1
                ? 220
                : 170;

        const horizontalChange =
            -120 + Math.random() * 240;

        let newX =
            previousX +
            horizontalChange;

        newX = clamp(
            newX,
            20,
            800 - width - 20
        );

        newPlatforms.push({
            x: Math.round(newX),
            y: heights[i],
            width: width,
            height: 20
        });

        previousX = newX;
    }

    return newPlatforms;
}

platforms = generatePlatforms();

// =====================================================
// CREATE PLAYER
// =====================================================

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
            BASE_MAX_HEALTH,

        maxHealth:
            BASE_MAX_HEALTH,

        dead: false,

        facing: 1,

        dashLevel: 0,

        greenLevel: 0,

        respawnAllowedAt: 0
    };
}

// =====================================================
// POWERUP CREATION
// =====================================================

function createRandomPowerup(player) {

    const type =
        POWERUP_TYPES[
            Math.floor(
                Math.random() *
                POWERUP_TYPES.length
            )
        ];

    powerupCounter++;

    const id =
        "powerup-" +
        Date.now() +
        "-" +
        powerupCounter;

    const powerup = {
        id: id,
        type: type,

        x: clamp(
            player.x +
                PLAYER_SIZE / 2,
            20,
            780
        ),

        y: clamp(
            player.y +
                PLAYER_SIZE / 2,
            40,
            550
        )
    };

    powerups[id] =
        powerup;

    io.emit(
        "powerupSpawned",
        powerup
    );

    return powerup;
}

// =====================================================
// MOVE EXISTING POWERUPS WHEN MAP CHANGES
// =====================================================

function repositionPowerups() {

    const usablePlatforms =
        platforms.slice(1);

    for (
        const id in powerups
    ) {

        const powerup =
            powerups[id];

        const platform =
            usablePlatforms[
                Math.floor(
                    Math.random() *
                    usablePlatforms.length
                )
            ];

        powerup.x =
            platform.x +
            20 +
            Math.random() *
                Math.max(
                    1,
                    platform.width - 40
                );

        powerup.y =
            platform.y - 15;
    }
}

// =====================================================
// PLAYER DEATH
// =====================================================

function killPlayer(playerId) {

    const player =
        players[playerId];

    if (
        !player ||
        player.dead
    ) {
        return;
    }

    player.health = 0;
    player.dead = true;

    // Lose ALL powerups/upgrades.
    player.maxHealth =
        BASE_MAX_HEALTH;

    player.dashLevel = 0;

    player.greenLevel = 0;

    player.respawnAllowedAt =
        Date.now() + 5000;

    // Drop exactly ONE random powerup.
    createRandomPowerup(player);

    io.emit(
        "playerHealthChanged",
        {
            id: playerId,

            health:
                player.health,

            maxHealth:
                player.maxHealth,

            dead: true,

            respawnAllowedAt:
                player.respawnAllowedAt
        }
    );

    io.emit(
        "playerPowerupChanged",
        {
            id: playerId,

            health:
                player.health,

            maxHealth:
                player.maxHealth,

            dashLevel:
                player.dashLevel,

            greenLevel:
                player.greenLevel
        }
    );
}

// =====================================================
// DAMAGE
// =====================================================

function damagePlayer(
    targetId,
    amount
) {

    const target =
        players[targetId];

    if (
        !target ||
        target.dead
    ) {
        return false;
    }

    target.health -=
        amount;

    if (
        target.health <= 0
    ) {

        killPlayer(
            targetId
        );

        return true;
    }

    io.emit(
        "playerHealthChanged",
        {
            id:
                targetId,

            health:
                target.health,

            maxHealth:
                target.maxHealth,

            dead: false,

            respawnAllowedAt: 0
        }
    );

    return false;
}

// =====================================================
// CHANGE PLATFORMS EVERY 10 MINUTES
// =====================================================

setInterval(
    () => {

        platforms =
            generatePlatforms();

        // Powerups stay forever,
        // but move onto the new reachable platforms.
        repositionPowerups();

        io.emit(
            "platformLayoutChanged",
            platforms
        );

        io.emit(
            "currentPowerups",
            powerups
        );

        console.log(
            "Platforms changed!"
        );

    },
    PLATFORM_CHANGE_TIME
);

// =====================================================
// CONNECTION
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

        socket.emit(
            "platformLayout",
            platforms
        );

        socket.emit(
            "currentPowerups",
            powerups
        );

        socket.emit(
            "currentPlayers",
            players
        );

        socket.broadcast.emit(
            "newPlayer",
            {
                id:
                    socket.id,

                ...players[
                    socket.id
                ]
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
        // NORMAL FIREBALL
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

                // Normal fireball = 1 heart
                damagePlayer(
                    data.targetId,
                    2
                );
            }
        );

        // =================================================
        // GREEN FIREBALL
        // =================================================

        socket.on(
            "shootGreenFireball",
            (fireball) => {

                const player =
                    players[socket.id];

                if (
                    !player ||
                    player.dead ||
                    player.greenLevel <= 0
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
            "greenFireballHit",
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
                    attacker.dead ||
                    attacker.greenLevel <= 0
                ) {
                    return;
                }

                if (
                    !target ||
                    target.dead
                ) {
                    return;
                }

                // Green fireball = HALF heart
                damagePlayer(
                    data.targetId,
                    1
                );

                // Double normal knockback.
                const direction =
                    data.direction === -1
                        ? -1
                        : 1;

                io.to(
                    data.targetId
                ).emit(
                    "receiveKnockback",
                    {
                        velocityX:
                            direction * 60,

                        velocityY:
                            -20
                    }
                );
            }
        );

        // =================================================
        // SWORD
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

                // Green fireball perk replaces sword.
                if (
                    player.greenLevel > 0
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
                    attacker.dead ||
                    attacker.greenLevel > 0
                ) {
                    return;
                }

                if (
                    !target ||
                    target.dead
                ) {
                    return;
                }

                // Sword = half heart.
                damagePlayer(
                    data.targetId,
                    1
                );

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
            }
        );

        // =================================================
        // POWERUP PICKUP
        // =================================================

        socket.on(
            "pickupPowerup",
            (powerupId) => {

                const player =
                    players[socket.id];

                const powerup =
                    powerups[
                        powerupId
                    ];

                if (
                    !player ||
                    player.dead ||
                    !powerup
                ) {
                    return;
                }

                const playerCenterX =
                    player.x +
                    PLAYER_SIZE / 2;

                const playerCenterY =
                    player.y +
                    PLAYER_SIZE / 2;

                const dx =
                    playerCenterX -
                    powerup.x;

                const dy =
                    playerCenterY -
                    powerup.y;

                const distance =
                    Math.sqrt(
                        dx * dx +
                        dy * dy
                    );

                // Make sure the player is actually close.
                if (
                    distance > 55
                ) {
                    return;
                }

                // -----------------------------------------
                // HEALTH POWERUP
                // -----------------------------------------

                if (
                    powerup.type ===
                    "health"
                ) {

                    player.maxHealth =
                        Math.min(
                            ABSOLUTE_MAX_HEALTH,

                            player.maxHealth +
                                4
                        );
                }

                // -----------------------------------------
                // DASH POWERUP
                // -----------------------------------------

                if (
                    powerup.type ===
                    "dash"
                ) {

                    player.dashLevel++;
                }

                // -----------------------------------------
                // GREEN FIREBALL POWERUP
                // -----------------------------------------

                if (
                    powerup.type ===
                    "greenFireball"
                ) {

                    player.greenLevel++;
                }

                // EVERY powerup heals to max.
                player.health =
                    player.maxHealth;

                delete powerups[
                    powerupId
                ];

                io.emit(
                    "powerupRemoved",
                    powerupId
                );

                io.emit(
                    "playerPowerupChanged",
                    {
                        id:
                            socket.id,

                        health:
                            player.health,

                        maxHealth:
                            player.maxHealth,

                        dashLevel:
                            player.dashLevel,

                        greenLevel:
                            player.greenLevel
                    }
                );

                io.emit(
                    "playerHealthChanged",
                    {
                        id:
                            socket.id,

                        health:
                            player.health,

                        maxHealth:
                            player.maxHealth,

                        dead: false,

                        respawnAllowedAt:
                            0
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

                // Must wait 5 seconds.
                if (
                    Date.now() <
                    player.respawnAllowedAt
                ) {
                    return;
                }

                player.x =
                    100 +
                    Math.random() * 300;

                player.y =
                    500;

                player.health =
                    BASE_MAX_HEALTH;

                player.maxHealth =
                    BASE_MAX_HEALTH;

                player.dead =
                    false;

                player.facing =
                    1;

                player.dashLevel =
                    0;

                player.greenLevel =
                    0;

                player.respawnAllowedAt =
                    0;

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

                        maxHealth:
                            player.maxHealth,

                        dead: false,

                        facing:
                            player.facing,

                        dashLevel: 0,

                        greenLevel: 0,

                        respawnAllowedAt:
                            0
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
        console.log("");
    }
);

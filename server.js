const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(
    express.static(
        path.join(
            __dirname,
            "public"
        )
    )
);

app.get(
    "/",
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                "public",
                "index.html"
            )
        );
    }
);

// =====================================================
// GAME CONSTANTS
// =====================================================

const PLAYER_SIZE = 30;

const BASE_MAX_HEALTH = 20;
const ABSOLUTE_MAX_HEALTH = 40;

const NORMAL_MAP_WIDTH = 800;
const NORMAL_MAP_HEIGHT = 600;

const LARGE_MAP_WIDTH = 1600;
const LARGE_MAP_HEIGHT = 1200;

const LARGE_MAP_PLAYER_COUNT = 6;

const PLATFORM_CHANGE_TIME =
    10 * 60 * 1000;

const POWERUP_TYPES = [
    "health",
    "dash",
    "greenFireball"
];

// =====================================================
// GAME STATE
// =====================================================

const players = {};

const powerups = {};

let powerupCounter = 0;

let mapWidth =
    NORMAL_MAP_WIDTH;

let mapHeight =
    NORMAL_MAP_HEIGHT;

let platforms = [];

// =====================================================
// HELPERS
// =====================================================

function clamp(
    value,
    minimum,
    maximum
) {

    return Math.max(
        minimum,
        Math.min(
            maximum,
            value
        )
    );
}

function randomBetween(
    min,
    max
) {

    return (
        min +
        Math.random() *
        (max - min)
    );
}

function getPlayerCount() {

    return Object.keys(
        players
    ).length;
}

function shouldUseLargeMap() {

    return (
        getPlayerCount() >=
        LARGE_MAP_PLAYER_COUNT
    );
}

// =====================================================
// PLATFORM GENERATION
// =====================================================
//
// NEW SYSTEM:
//
// Normal map:
// - Ground
// - Two platforms on most height levels
// - Platforms spread between left and right
// - Positions randomly shift every map
// - Some center platforms get added
//
// Large map:
// - Ground
// - Three platforms across most levels
// - Left / center / right spread
//
// This prevents the whole map from
// randomly drifting to one side.
// =====================================================

function generatePlatforms() {

    const newPlatforms = [];

    const largeMap =
        mapWidth >
        NORMAL_MAP_WIDTH;

    // =================================================
    // FLOOR
    // =================================================

    newPlatforms.push({
        x: 0,
        y: mapHeight - 30,
        width: mapWidth,
        height: 30
    });

    // =================================================
    // NORMAL 800 x 600 MAP
    // =================================================

    if (
        !largeMap
    ) {

        const platformWidth = 155;
        const platformHeight = 20;

        const rows = [
            490,
            410,
            330,
            250,
            170,
            90,
            30
        ];

        for (
            let i = 0;
            i < rows.length;
            i++
        ) {

            const y =
                rows[i];

            // -----------------------------------------
            // LEFT SIDE PLATFORM
            // -----------------------------------------

            let leftX =
                randomBetween(
                    35,
                    220
                );

            // -----------------------------------------
            // RIGHT SIDE PLATFORM
            // -----------------------------------------

            let rightX =
                randomBetween(
                    430,
                    610
                );

            // Every other row gets a little more
            // center bias so the map has crossover
            // routes and does not feel like two
            // perfectly straight columns.

            if (
                i % 2 === 1
            ) {

                leftX +=
                    randomBetween(
                        30,
                        70
                    );

                rightX -=
                    randomBetween(
                        30,
                        70
                    );
            }

            leftX =
                clamp(
                    leftX,
                    20,
                    mapWidth -
                    platformWidth -
                    20
                );

            rightX =
                clamp(
                    rightX,
                    20,
                    mapWidth -
                    platformWidth -
                    20
                );

            newPlatforms.push({
                x:
                    Math.round(
                        leftX
                    ),

                y:
                    y,

                width:
                    platformWidth,

                height:
                    platformHeight
            });

            newPlatforms.push({
                x:
                    Math.round(
                        rightX
                    ),

                y:
                    y,

                width:
                    platformWidth,

                height:
                    platformHeight
            });

            // -----------------------------------------
            // OCCASIONAL CENTER PLATFORM
            // -----------------------------------------
            //
            // This is random so every map is different.
            // It also creates more ways to cross
            // from one side to the other.

            if (
                i > 0 &&
                i <
                rows.length - 1 &&
                Math.random() <
                0.55
            ) {

                const centerWidth =
                    130;

                const centerX =
                    randomBetween(
                        315,
                        355
                    );

                newPlatforms.push({
                    x:
                        Math.round(
                            centerX
                        ),

                    y:
                        y - 35,

                    width:
                        centerWidth,

                    height:
                        platformHeight
                });
            }
        }

        // Wider top goal-like platform
        newPlatforms.push({
            x:
                Math.round(
                    randomBetween(
                        275,
                        325
                    )
                ),

            y:
                5,

            width:
                220,

            height:
                20
        });
    }

    // =================================================
    // LARGE 1600 x 1200 MAP
    // =================================================

    else {

        const platformWidth = 190;
        const platformHeight = 20;

        const rowGap = 80;

        let y =
            mapHeight - 110;

        let rowNumber = 0;

        while (
            y > 40
        ) {

            // -----------------------------------------
            // LEFT ZONE
            // -----------------------------------------

            let leftX =
                randomBetween(
                    40,
                    320
                );

            // -----------------------------------------
            // CENTER ZONE
            // -----------------------------------------

            let centerX =
                randomBetween(
                    570,
                    820
                );

            // -----------------------------------------
            // RIGHT ZONE
            // -----------------------------------------

            let rightX =
                randomBetween(
                    1050,
                    1350
                );

            // Stagger rows so they don't look
            // like boring straight vertical columns.

            if (
                rowNumber % 2 === 1
            ) {

                leftX +=
                    randomBetween(
                        60,
                        130
                    );

                centerX -=
                    randomBetween(
                        20,
                        80
                    );

                rightX -=
                    randomBetween(
                        60,
                        130
                    );
            }

            leftX =
                clamp(
                    leftX,
                    20,
                    mapWidth -
                    platformWidth -
                    20
                );

            centerX =
                clamp(
                    centerX,
                    20,
                    mapWidth -
                    platformWidth -
                    20
                );

            rightX =
                clamp(
                    rightX,
                    20,
                    mapWidth -
                    platformWidth -
                    20
                );

            newPlatforms.push({
                x:
                    Math.round(
                        leftX
                    ),

                y:
                    Math.round(
                        y
                    ),

                width:
                    platformWidth,

                height:
                    platformHeight
            });

            newPlatforms.push({
                x:
                    Math.round(
                        centerX
                    ),

                y:
                    Math.round(
                        y
                    ),

                width:
                    platformWidth,

                height:
                    platformHeight
            });

            newPlatforms.push({
                x:
                    Math.round(
                        rightX
                    ),

                y:
                    Math.round(
                        y
                    ),

                width:
                    platformWidth,

                height:
                    platformHeight
            });

            // Extra crossover platform on some rows.
            if (
                Math.random() <
                0.5
            ) {

                const extraX =
                    rowNumber % 2 === 0
                        ? randomBetween(
                            350,
                            520
                        )
                        : randomBetween(
                            850,
                            1020
                        );

                newPlatforms.push({
                    x:
                        Math.round(
                            extraX
                        ),

                    y:
                        Math.round(
                            y - 35
                        ),

                    width:
                        150,

                    height:
                        platformHeight
                });
            }

            y -=
                rowGap;

            rowNumber++;
        }

        // Wide random top platform.
        newPlatforms.push({
            x:
                Math.round(
                    randomBetween(
                        620,
                        760
                    )
                ),

            y:
                5,

            width:
                300,

            height:
                20
        });
    }

    return newPlatforms;
}

platforms =
    generatePlatforms();

// =====================================================
// SPAWN POSITION
// =====================================================

function getSpawnPosition() {

    return {
        x:
            randomBetween(
                80,
                Math.min(
                    mapWidth - 100,
                    mapWidth * 0.75
                )
            ),

        y:
            mapHeight - 100
    };
}

// =====================================================
// PLAYER CREATION
// =====================================================

function createPlayer() {

    const spawn =
        getSpawnPosition();

    return {
        x:
            spawn.x,

        y:
            spawn.y,

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

        dead:
            false,

        facing:
            1,

        dashLevel:
            0,

        greenLevel:
            0,

        respawnAllowedAt:
            0
    };
}

// =====================================================
// POWERUPS
// =====================================================

function createRandomPowerup(
    player
) {

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
        id:
            id,

        type:
            type,

        x:
            clamp(
                player.x +
                PLAYER_SIZE / 2,
                20,
                mapWidth - 20
            ),

        y:
            clamp(
                player.y +
                PLAYER_SIZE / 2,
                40,
                mapHeight - 50
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

function repositionPowerups() {

    const usablePlatforms =
        platforms.slice(1);

    if (
        usablePlatforms.length ===
        0
    ) {
        return;
    }

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
// MAP SIZE CHANGES
// =====================================================

function updateMapSize() {

    const useLargeMap =
        shouldUseLargeMap();

    const newWidth =
        useLargeMap
            ? LARGE_MAP_WIDTH
            : NORMAL_MAP_WIDTH;

    const newHeight =
        useLargeMap
            ? LARGE_MAP_HEIGHT
            : NORMAL_MAP_HEIGHT;

    if (
        newWidth === mapWidth &&
        newHeight === mapHeight
    ) {
        return;
    }

    mapWidth =
        newWidth;

    mapHeight =
        newHeight;

    platforms =
        generatePlatforms();

    repositionPowerups();

    const newPositions = {};

    for (
        const id in players
    ) {

        const player =
            players[id];

        if (
            !player ||
            player.dead
        ) {
            continue;
        }

        const spawn =
            getSpawnPosition();

        player.x =
            spawn.x;

        player.y =
            spawn.y;

        newPositions[id] = {
            x:
                player.x,

            y:
                player.y,

            facing:
                player.facing
        };
    }

    io.emit(
        "mapChanged",
        {
            width:
                mapWidth,

            height:
                mapHeight,

            platforms:
                platforms,

            powerups:
                powerups,

            playerPositions:
                newPositions,

            largeMap:
                useLargeMap
        }
    );

    console.log(
        useLargeMap
            ? "Map expanded to 1600x1200"
            : "Map shrank to 800x600"
    );
}

// =====================================================
// PLAYER DEATH
// =====================================================

function killPlayer(
    playerId
) {

    const player =
        players[playerId];

    if (
        !player ||
        player.dead
    ) {
        return;
    }

    player.health =
        0;

    player.dead =
        true;

    player.maxHealth =
        BASE_MAX_HEALTH;

    player.dashLevel =
        0;

    player.greenLevel =
        0;

    player.respawnAllowedAt =
        Date.now() +
        5000;

    createRandomPowerup(
        player
    );

    io.emit(
        "playerHealthChanged",
        {
            id:
                playerId,

            health:
                player.health,

            maxHealth:
                player.maxHealth,

            dead:
                true,

            respawnAllowedAt:
                player.respawnAllowedAt
        }
    );

    io.emit(
        "playerPowerupChanged",
        {
            id:
                playerId,

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

            dead:
                false,

            respawnAllowedAt:
                0
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

        updateMapSize();

        socket.emit(
            "mapState",
            {
                width:
                    mapWidth,

                height:
                    mapHeight,

                platforms:
                    platforms,

                largeMap:
                    shouldUseLargeMap()
            }
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
                    players[
                        socket.id
                    ];

                if (
                    !player ||
                    player.dead
                ) {
                    return;
                }

                player.x =
                    clamp(
                        data.x,
                        0,
                        mapWidth -
                        PLAYER_SIZE
                    );

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
                    players[
                        socket.id
                    ];

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
                    players[
                        socket.id
                    ];

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
                    players[
                        socket.id
                    ];

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
                    players[
                        socket.id
                    ];

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
                    players[
                        socket.id
                    ];

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

                damagePlayer(
                    data.targetId,
                    1
                );

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
                            direction *
                            60,

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
                    players[
                        socket.id
                    ];

                if (
                    !player ||
                    player.dead ||
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
                    players[
                        socket.id
                    ];

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
                    players[
                        socket.id
                    ];

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

                if (
                    distance > 55
                ) {
                    return;
                }

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

                if (
                    powerup.type ===
                    "dash"
                ) {

                    player.dashLevel++;
                }

                if (
                    powerup.type ===
                    "greenFireball"
                ) {

                    player.greenLevel++;
                }

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

                        dead:
                            false,

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
                    players[
                        socket.id
                    ];

                if (
                    !player ||
                    !player.dead
                ) {
                    return;
                }

                if (
                    Date.now() <
                    player.respawnAllowedAt
                ) {
                    return;
                }

                const spawn =
                    getSpawnPosition();

                player.x =
                    spawn.x;

                player.y =
                    spawn.y;

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

                        dead:
                            false,

                        facing:
                            player.facing,

                        dashLevel:
                            0,

                        greenLevel:
                            0,

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

                updateMapSize();
            }
        );
    }
);

// =====================================================
// START SERVER
// =====================================================

const PORT =
    process.env.PORT ||
    3000;

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

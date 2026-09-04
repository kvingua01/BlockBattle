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

const GOLD_PLATFORM_TIME =
    30 * 1000;

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

let goldControllerId = null;
let goldControlStartedAt = 0;

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

function randomPowerupType() {

    return POWERUP_TYPES[
        Math.floor(
            Math.random() *
            POWERUP_TYPES.length
        )
    ];
}

// =====================================================
// GOLD PLATFORM RESET
// =====================================================

function resetGoldControl() {

    goldControllerId = null;

    goldControlStartedAt = 0;

    io.emit(
        "goldPlatformStatus",
        {
            controllerId: null,
            progress: 0,
            remaining: 30
        }
    );
}

// =====================================================
// PLATFORM GENERATION
// =====================================================

function generatePlatforms() {

    const newPlatforms = [];

    const largeMap =
        mapWidth >
        NORMAL_MAP_WIDTH;

    let platformCounter = 0;

    // =================================================
    // FLOOR
    // =================================================

    newPlatforms.push({
        id:
            "platform-" +
            platformCounter++,

        x: 0,

        y:
            mapHeight - 30,

        width:
            mapWidth,

        height: 30,

        isGold: false
    });

    // =================================================
    // NORMAL MAP
    // =================================================

    if (!largeMap) {

        const platformWidth = 145;
        const platformHeight = 20;

        const rows = [
            490,
            410,
            330,
            250,
            170,
            90
        ];

        let previousStyle = -1;

        for (
            let i = 0;
            i < rows.length;
            i++
        ) {

            const y =
                rows[i];

            const leftX =
                randomBetween(
                    35,
                    150
                );

            const centerX =
                randomBetween(
                    325,
                    405
                );

            const rightX =
                randomBetween(
                    605,
                    635
                );

            let style =
                Math.floor(
                    Math.random() * 3
                );

            if (
                style ===
                previousStyle
            ) {

                style =
                    (
                        style +
                        1 +
                        Math.floor(
                            Math.random() * 2
                        )
                    ) % 3;
            }

            previousStyle =
                style;

            if (
                style === 0
            ) {

                newPlatforms.push({
                    id:
                        "platform-" +
                        platformCounter++,

                    x:
                        Math.round(
                            leftX
                        ),

                    y:
                        y,

                    width:
                        platformWidth,

                    height:
                        platformHeight,

                    isGold:
                        false
                });

                newPlatforms.push({
                    id:
                        "platform-" +
                        platformCounter++,

                    x:
                        Math.round(
                            rightX
                        ),

                    y:
                        y,

                    width:
                        platformWidth,

                    height:
                        platformHeight,

                    isGold:
                        false
                });
            }

            else if (
                style === 1
            ) {

                newPlatforms.push({
                    id:
                        "platform-" +
                        platformCounter++,

                    x:
                        Math.round(
                            leftX
                        ),

                    y:
                        y,

                    width:
                        platformWidth,

                    height:
                        platformHeight,

                    isGold:
                        false
                });

                newPlatforms.push({
                    id:
                        "platform-" +
                        platformCounter++,

                    x:
                        Math.round(
                            centerX
                        ),

                    y:
                        y,

                    width:
                        platformWidth,

                    height:
                        platformHeight,

                    isGold:
                        false
                });
            }

            else {

                newPlatforms.push({
                    id:
                        "platform-" +
                        platformCounter++,

                    x:
                        Math.round(
                            centerX
                        ),

                    y:
                        y,

                    width:
                        platformWidth,

                    height:
                        platformHeight,

                    isGold:
                        false
                });

                newPlatforms.push({
                    id:
                        "platform-" +
                        platformCounter++,

                    x:
                        Math.round(
                            rightX
                        ),

                    y:
                        y,

                    width:
                        platformWidth,

                    height:
                        platformHeight,

                    isGold:
                        false
                });
            }
        }

        newPlatforms.push({
            id:
                "platform-" +
                platformCounter++,

            x:
                Math.round(
                    randomBetween(
                        285,
                        355
                    )
                ),

            y: 25,

            width: 180,

            height: 20,

            isGold:
                false
        });
    }

    // =================================================
    // LARGE MAP
    // =================================================

    else {

        const platformWidth = 180;
        const platformHeight = 20;

        const rows = [
            1090,
            1010,
            930,
            850,
            770,
            690,
            610,
            530,
            450,
            370,
            290,
            210,
            130
        ];

        for (
            let i = 0;
            i < rows.length;
            i++
        ) {

            const y =
                rows[i];

            const leftX =
                randomBetween(
                    50,
                    300
                );

            const centerX =
                randomBetween(
                    700,
                    830
                );

            const rightX =
                randomBetween(
                    1250,
                    1370
                );

            newPlatforms.push({
                id:
                    "platform-" +
                    platformCounter++,

                x:
                    Math.round(
                        leftX
                    ),

                y:
                    y,

                width:
                    platformWidth,

                height:
                    platformHeight,

                isGold:
                    false
            });

            newPlatforms.push({
                id:
                    "platform-" +
                    platformCounter++,

                x:
                    Math.round(
                        centerX
                    ),

                y:
                    y,

                width:
                    platformWidth,

                height:
                    platformHeight,

                isGold:
                    false
            });

            newPlatforms.push({
                id:
                    "platform-" +
                    platformCounter++,

                x:
                    Math.round(
                        rightX
                    ),

                y:
                    y,

                width:
                    platformWidth,

                height:
                    platformHeight,

                isGold:
                    false
            });
        }

        newPlatforms.push({
            id:
                "platform-" +
                platformCounter++,

            x:
                Math.round(
                    randomBetween(
                        650,
                        760
                    )
                ),

            y: 45,

            width: 260,

            height: 20,

            isGold:
                false
        });
    }

    // =================================================
    // CHOOSE ONE RANDOM GOLD PLATFORM
    // =================================================
    //
    // Ground is index 0, so it can never
    // become the gold platform.
    // =================================================

    if (
        newPlatforms.length >
        1
    ) {

        const goldIndex =
            1 +
            Math.floor(
                Math.random() *
                (
                    newPlatforms.length -
                    1
                )
            );

        newPlatforms[
            goldIndex
        ].isGold =
            true;
    }

    resetGoldControl();

    return newPlatforms;
}

platforms =
    generatePlatforms();

// =====================================================
// GOLD PLATFORM
// =====================================================

function getGoldPlatform() {

    return platforms.find(
        platform =>
            platform.isGold
    ) || null;
}

function playerIsStandingOnPlatform(
    player,
    platform
) {

    if (
        !player ||
        player.dead ||
        !platform
    ) {
        return false;
    }

    const playerBottom =
        player.y +
        PLAYER_SIZE;

    const overlapsX =
        player.x +
        PLAYER_SIZE >
        platform.x &&

        player.x <
        platform.x +
        platform.width;

    // Small tolerance because player positions
    // are sent over the network.
    const standingY =
        Math.abs(
            playerBottom -
            platform.y
        ) <= 6;

    return (
        overlapsX &&
        standingY
    );
}

// =====================================================
// APPLY A POWERUP DIRECTLY
// =====================================================

function givePowerupToPlayer(
    playerId,
    type
) {

    const player =
        players[playerId];

    if (
        !player ||
        player.dead
    ) {
        return;
    }

    if (
        type ===
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
        type ===
        "dash"
    ) {

        player.dashLevel++;
    }

    if (
        type ===
        "greenFireball"
    ) {

        player.greenLevel++;
    }

    // Any powerup heals you fully.
    player.health =
        player.maxHealth;

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
                false,

            respawnAllowedAt:
                0
        }
    );
}

// =====================================================
// GOLD PLATFORM CONTROL CHECK
// =====================================================

setInterval(
    () => {

        const goldPlatform =
            getGoldPlatform();

        if (
            !goldPlatform
        ) {

            resetGoldControl();

            return;
        }

        const standingPlayers =
            [];

        for (
            const id in players
        ) {

            const player =
                players[id];

            if (
                playerIsStandingOnPlatform(
                    player,
                    goldPlatform
                )
            ) {

                standingPlayers.push(
                    id
                );
            }
        }

        // Must be EXACTLY one player.
        if (
            standingPlayers.length !==
            1
        ) {

            if (
                goldControllerId !==
                null
            ) {

                resetGoldControl();
            }

            return;
        }

        const controllerId =
            standingPlayers[0];

        // New player gained control.
        if (
            controllerId !==
            goldControllerId
        ) {

            goldControllerId =
                controllerId;

            goldControlStartedAt =
                Date.now();
        }

        const elapsed =
            Date.now() -
            goldControlStartedAt;

        const progress =
            Math.min(
                1,
                elapsed /
                GOLD_PLATFORM_TIME
            );

        const remaining =
            Math.max(
                0,
                (
                    GOLD_PLATFORM_TIME -
                    elapsed
                ) / 1000
            );

        io.emit(
            "goldPlatformStatus",
            {
                controllerId:
                    goldControllerId,

                progress:
                    progress,

                remaining:
                    remaining
            }
        );

        // 30 seconds completed.
        if (
            elapsed >=
            GOLD_PLATFORM_TIME
        ) {

            const rewardType =
                randomPowerupType();

            givePowerupToPlayer(
                controllerId,
                rewardType
            );

            io.emit(
                "goldPlatformReward",
                {
                    playerId:
                        controllerId,

                    type:
                        rewardType
                }
            );

            // Start another 30-second
            // control period immediately.
            goldControlStartedAt =
                Date.now();

            io.emit(
                "goldPlatformStatus",
                {
                    controllerId:
                        controllerId,

                    progress:
                        0,

                    remaining:
                        30
                }
            );
        }

    },
    100
);

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
// DROPPED POWERUPS
// =====================================================

function createRandomPowerup(
    player
) {

    const type =
        randomPowerupType();

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
// MAP SIZE CHANGE
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

    player.health = 0;

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

    if (
        goldControllerId ===
        playerId
    ) {

        resetGoldControl();
    }

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

    },
    PLATFORM_CHANGE_TIME
);

// =====================================================
// CONNECTION
// =====================================================

io.on(
    "connection",
    (socket) => {

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
        // KNOCKBACK
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
                    attacker.dead ||
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
                    attacker.greenLevel <= 0 ||
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
                    attacker.greenLevel > 0 ||
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

                givePowerupToPlayer(
                    socket.id,
                    powerup.type
                );

                delete powerups[
                    powerupId
                ];

                io.emit(
                    "powerupRemoved",
                    powerupId
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

                        facing:
                            player.facing,

                        dashLevel:
                            0,

                        greenLevel:
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

                delete players[
                    socket.id
                ];

                io.emit(
                    "playerDisconnected",
                    socket.id
                );

                if (
                    goldControllerId ===
                    socket.id
                ) {

                    resetGoldControl();
                }

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

        console.log(
            "BLOCK BATTLE IS RUNNING!"
        );

        console.log(
            "Server running on port " +
            PORT
        );
    }
);

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

// =====================================================
// SETTINGS
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

let players = {};

let powerups = {};
let powerupCounter = 0;

let mapWidth =
    NORMAL_MAP_WIDTH;

let mapHeight =
    NORMAL_MAP_HEIGHT;

let platforms = [];

// =====================================================
// GOLD PLATFORM STATE
// =====================================================

// Which player is CURRENTLY alone
// on the gold platform.
let goldControllerId = null;

// When the current uninterrupted
// period on the platform started.
let goldControlStartedAt = 0;

// NEW:
// Saved accumulated gold-platform
// time for every player.
//
// Example:
// player spends 21 seconds on platform,
// leaves, and this stores 21000.
let goldSavedProgress = {};

// =====================================================
// HELPERS
// =====================================================

function clamp(
    value,
    min,
    max
) {

    return Math.max(
        min,
        Math.min(
            max,
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
        (
            max -
            min
        )
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
// GOLD PROGRESS HELPERS
// =====================================================

function getSavedGoldTime(
    playerId
) {

    return (
        goldSavedProgress[
            playerId
        ] || 0
    );
}

function setSavedGoldTime(
    playerId,
    milliseconds
) {

    goldSavedProgress[
        playerId
    ] =
        clamp(
            milliseconds,
            0,
            GOLD_PLATFORM_TIME
        );
}

// Save the time that the current
// controller has earned during this
// visit to the platform.
function saveCurrentGoldProgress() {

    if (
        !goldControllerId ||
        !goldControlStartedAt
    ) {
        return;
    }

    const elapsed =
        Date.now() -
        goldControlStartedAt;

    const previousSaved =
        getSavedGoldTime(
            goldControllerId
        );

    setSavedGoldTime(
        goldControllerId,
        previousSaved +
        elapsed
    );
}

// Pause the gold-platform timer.
//
// IMPORTANT:
// This NO LONGER deletes the player's
// progress. It saves it.
function pauseGoldControl() {

    if (
        goldControllerId
    ) {

        saveCurrentGoldProgress();
    }

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

// Used when the map changes.
// Saved player progress remains.
function clearActiveGoldControl() {

    if (
        goldControllerId
    ) {

        saveCurrentGoldProgress();
    }

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

    let platformId = 0;

    // =================================================
    // GROUND
    // =================================================

    newPlatforms.push(
        {
            id:
                "platform-" +
                platformId++,

            x: 0,

            y:
                mapHeight -
                30,

            width:
                mapWidth,

            height:
                30,

            isGold:
                false
        }
    );

    // =================================================
    // NORMAL MAP
    // =================================================

    if (
        mapWidth ===
        NORMAL_MAP_WIDTH
    ) {

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
            const y of rows
        ) {

            let style;

            do {

                style =
                    Math.floor(
                        Math.random() *
                        3
                    );

            } while (
                style ===
                    previousStyle &&
                rows.length > 1
            );

            previousStyle =
                style;

            const leftPlatform = {
                id:
                    "platform-" +
                    platformId++,

                x:
                    randomBetween(
                        35,
                        150
                    ),

                y: y,

                width: 145,

                height: 20,

                isGold: false
            };

            const centerPlatform = {
                id:
                    "platform-" +
                    platformId++,

                x:
                    randomBetween(
                        325,
                        405
                    ),

                y: y,

                width: 145,

                height: 20,

                isGold: false
            };

            const rightPlatform = {
                id:
                    "platform-" +
                    platformId++,

                x:
                    randomBetween(
                        605,
                        635
                    ),

                y: y,

                width: 145,

                height: 20,

                isGold: false
            };

            // Style 0:
            // Left + Right

            if (
                style === 0
            ) {

                newPlatforms.push(
                    leftPlatform,
                    rightPlatform
                );
            }

            // Style 1:
            // Left + Center

            if (
                style === 1
            ) {

                newPlatforms.push(
                    leftPlatform,
                    centerPlatform
                );
            }

            // Style 2:
            // Center + Right

            if (
                style === 2
            ) {

                newPlatforms.push(
                    centerPlatform,
                    rightPlatform
                );
            }
        }

        newPlatforms.push(
            {
                id:
                    "platform-" +
                    platformId++,

                x:
                    randomBetween(
                        285,
                        355
                    ),

                y: 25,

                width: 180,

                height: 20,

                isGold: false
            }
        );

    } else {

        // =================================================
        // LARGE MAP
        // =================================================

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
            const y of rows
        ) {

            newPlatforms.push(
                {
                    id:
                        "platform-" +
                        platformId++,

                    x:
                        randomBetween(
                            50,
                            300
                        ),

                    y: y,

                    width: 180,

                    height: 20,

                    isGold: false
                }
            );

            newPlatforms.push(
                {
                    id:
                        "platform-" +
                        platformId++,

                    x:
                        randomBetween(
                            700,
                            830
                        ),

                    y: y,

                    width: 180,

                    height: 20,

                    isGold: false
                }
            );

            newPlatforms.push(
                {
                    id:
                        "platform-" +
                        platformId++,

                    x:
                        randomBetween(
                            1250,
                            1370
                        ),

                    y: y,

                    width: 180,

                    height: 20,

                    isGold: false
                }
            );
        }

        newPlatforms.push(
            {
                id:
                    "platform-" +
                    platformId++,

                x:
                    randomBetween(
                        650,
                        760
                    ),

                y: 45,

                width: 260,

                height: 20,

                isGold: false
            }
        );
    }

    // =================================================
    // CHOOSE ONE RANDOM GOLD PLATFORM
    // =================================================

    // Never make the ground gold.
    if (
        newPlatforms.length > 1
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

    // Changing maps/platform layouts
    // pauses the current attempt,
    // but DOES NOT erase saved progress.
    clearActiveGoldControl();

    return newPlatforms;
}

platforms =
    generatePlatforms();

// =====================================================
// GOLD PLATFORM HELPERS
// =====================================================

function getGoldPlatform() {

    return platforms.find(
        platform =>
            platform.isGold
    );
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

    const horizontalOverlap =
        player.x +
        PLAYER_SIZE >
        platform.x &&

        player.x <
        platform.x +
        platform.width;

    const standingOnTop =
        Math.abs(
            playerBottom -
            platform.y
        ) <= 6;

    return (
        horizontalOverlap &&
        standingOnTop
    );
}

// =====================================================
// CREATE PLAYER
// =====================================================

function createPlayer(
    id
) {

    return {
        id: id,

        x:
            randomBetween(
                60,
                Math.max(
                    61,
                    mapWidth -
                    90
                )
            ),

        y:
            mapHeight -
            100,

        color:
            `hsl(${
                Math.floor(
                    Math.random() *
                    360
                )
            }, 70%, 55%)`,

        facing: 1,

        health:
            BASE_MAX_HEALTH,

        maxHealth:
            BASE_MAX_HEALTH,

        dead: false,

        respawnAllowedAt: 0,

        dashLevel: 0,

        greenLevel: 0
    };
}

// =====================================================
// POWERUP CREATION
// =====================================================

function getRandomPowerupPosition() {

    const usablePlatforms =
        platforms.filter(
            platform =>
                platform.y <
                mapHeight -
                40
        );

    const platform =
        usablePlatforms[
            Math.floor(
                Math.random() *
                usablePlatforms.length
            )
        ] ||
        platforms[0];

    return {
        x:
            clamp(
                randomBetween(
                    platform.x + 20,
                    platform.x +
                    platform.width -
                    20
                ),
                20,
                mapWidth - 20
            ),

        y:
            platform.y -
            18
    };
}

function spawnPowerup(
    type
) {

    const position =
        getRandomPowerupPosition();

    const id =
        "powerup-" +
        powerupCounter++;

    const powerup = {
        id: id,

        type:
            type ||
            randomPowerupType(),

        x:
            position.x,

        y:
            position.y
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
// GIVE POWERUP DIRECTLY
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
        type === "health"
    ) {

        player.maxHealth =
            Math.min(
                ABSOLUTE_MAX_HEALTH,
                player.maxHealth + 4
            );
    }

    if (
        type === "dash"
    ) {

        player.dashLevel =
            (
                player.dashLevel ||
                0
            ) + 1;
    }

    if (
        type ===
        "greenFireball"
    ) {

        player.greenLevel =
            (
                player.greenLevel ||
                0
            ) + 1;
    }

    // Every powerup heals to full.
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
                player.dead,

            respawnAllowedAt:
                player.respawnAllowedAt
        }
    );
}

// =====================================================
// REPOSITION POWERUPS
// =====================================================

function repositionPowerups() {

    for (
        const id in powerups
    ) {

        const position =
            getRandomPowerupPosition();

        powerups[id].x =
            position.x;

        powerups[id].y =
            position.y;
    }
}

// =====================================================
// SAFE PLAYER POSITION
// =====================================================

function getSafePlayerPosition() {

    return {
        x:
            randomBetween(
                60,
                Math.max(
                    61,
                    mapWidth -
                    90
                )
            ),

        y:
            mapHeight -
            100
    };
}

// =====================================================
// MAP SIZE CHANGE
// =====================================================

function updateMapSize() {

    const useLarge =
        shouldUseLargeMap();

    const desiredWidth =
        useLarge
            ? LARGE_MAP_WIDTH
            : NORMAL_MAP_WIDTH;

    const desiredHeight =
        useLarge
            ? LARGE_MAP_HEIGHT
            : NORMAL_MAP_HEIGHT;

    if (
        desiredWidth ===
            mapWidth &&
        desiredHeight ===
            mapHeight
    ) {
        return;
    }

    // Save any active gold progress
    // before changing the map.
    clearActiveGoldControl();

    mapWidth =
        desiredWidth;

    mapHeight =
        desiredHeight;

    platforms =
        generatePlatforms();

    repositionPowerups();

    const playerPositions = {};

    for (
        const id in players
    ) {

        const player =
            players[id];

        if (
            player.dead
        ) {
            continue;
        }

        const position =
            getSafePlayerPosition();

        player.x =
            position.x;

        player.y =
            position.y;

        playerPositions[id] = {
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
                playerPositions,

            largeMap:
                useLarge
        }
    );
}

// =====================================================
// DAMAGE / DEATH
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

    // If this person was on the gold
    // platform, save their accumulated time.
    if (
        goldControllerId ===
        playerId
    ) {

        pauseGoldControl();
    }

    player.health = 0;
    player.dead = true;

    player.respawnAllowedAt =
        Date.now() +
        5000;

    // Drop exactly one random powerup.
    spawnPowerup(
        randomPowerupType()
    );

    // Death removes all actual upgrades.
    player.maxHealth =
        BASE_MAX_HEALTH;

    player.dashLevel = 0;
    player.greenLevel = 0;

    // IMPORTANT:
    // We DO NOT erase goldSavedProgress here.
    //
    // So if the player had 21 seconds,
    // died, respawned and later returned,
    // they still have their 21 seconds.

    io.emit(
        "playerPowerupChanged",
        {
            id:
                playerId,

            health: 0,

            maxHealth:
                player.maxHealth,

            dashLevel: 0,

            greenLevel: 0
        }
    );

    io.emit(
        "playerHealthChanged",
        {
            id:
                playerId,

            health: 0,

            maxHealth:
                player.maxHealth,

            dead: true,

            respawnAllowedAt:
                player.respawnAllowedAt
        }
    );
}

function damagePlayer(
    playerId,
    amount
) {

    const player =
        players[playerId];

    if (
        !player ||
        player.dead
    ) {
        return;
    }

    player.health -=
        amount;

    if (
        player.health <= 0
    ) {

        killPlayer(
            playerId
        );

        return;
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

            dead: false,

            respawnAllowedAt:
                player.respawnAllowedAt
        }
    );
}

// =====================================================
// GOLD PLATFORM LOOP
// =====================================================

setInterval(
    () => {

        const goldPlatform =
            getGoldPlatform();

        if (
            !goldPlatform
        ) {
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

        // =================================================
        // NOBODY OR MULTIPLE PLAYERS
        // =================================================

        // Nobody earns time.
        // Existing saved time stays.
        if (
            standingPlayers.length !== 1
        ) {

            if (
                goldControllerId
            ) {

                pauseGoldControl();
            }

            return;
        }

        // =================================================
        // EXACTLY ONE PLAYER
        // =================================================

        const solePlayerId =
            standingPlayers[0];

        // A new player has become
        // the sole controller.
        if (
            goldControllerId !==
            solePlayerId
        ) {

            // Save previous player's progress
            // before switching.
            if (
                goldControllerId
            ) {

                saveCurrentGoldProgress();
            }

            goldControllerId =
                solePlayerId;

            goldControlStartedAt =
                Date.now();
        }

        const savedTime =
            getSavedGoldTime(
                solePlayerId
            );

        const currentVisitTime =
            Date.now() -
            goldControlStartedAt;

        const totalTime =
            savedTime +
            currentVisitTime;

        const progress =
            clamp(
                totalTime /
                GOLD_PLATFORM_TIME,
                0,
                1
            );

        const remainingMilliseconds =
            Math.max(
                0,
                GOLD_PLATFORM_TIME -
                totalTime
            );

        const remainingSeconds =
            remainingMilliseconds /
            1000;

        io.emit(
            "goldPlatformStatus",
            {
                controllerId:
                    solePlayerId,

                progress:
                    progress,

                remaining:
                    remainingSeconds
            }
        );

        // =================================================
        // PLAYER REACHED 30 TOTAL SECONDS
        // =================================================

        if (
            totalTime >=
            GOLD_PLATFORM_TIME
        ) {

            const rewardType =
                randomPowerupType();

            givePowerupToPlayer(
                solePlayerId,
                rewardType
            );

            io.emit(
                "goldPlatformReward",
                {
                    playerId:
                        solePlayerId,

                    type:
                        rewardType
                }
            );

            // The reward has been earned,
            // so this player's saved progress
            // starts back at zero.
            goldSavedProgress[
                solePlayerId
            ] = 0;

            // If they remain alone on the
            // platform, a fresh 30-second
            // reward timer starts immediately.
            goldControlStartedAt =
                Date.now();

            io.emit(
                "goldPlatformStatus",
                {
                    controllerId:
                        solePlayerId,

                    progress: 0,

                    remaining: 30
                }
            );
        }

    },
    100
);

// =====================================================
// RANDOM PLATFORM CHANGE
// =====================================================

setInterval(
    () => {

        // Save gold progress before
        // generating a new gold platform.
        clearActiveGoldControl();

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
            createPlayer(
                socket.id
            );

        // Initialize saved gold time
        // for this connection.
        if (
            goldSavedProgress[
                socket.id
            ] === undefined
        ) {

            goldSavedProgress[
                socket.id
            ] = 0;
        }

        // If player #6 joins,
        // expand immediately.
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
            "currentPlayers",
            players
        );

        socket.emit(
            "currentPowerups",
            powerups
        );

        socket.broadcast.emit(
            "newPlayer",
            players[socket.id]
        );

        // =================================================
        // PLAYER MOVE
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
                    clamp(
                        Number(data.x) ||
                        0,
                        0,
                        mapWidth -
                        PLAYER_SIZE
                    );

                player.y =
                    Number(data.y) ||
                    0;

                player.facing =
                    data.facing === -1
                        ? -1
                        : 1;

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
        // SHOVE / KNOCKBACK
        // =================================================

        socket.on(
            "knockbackPlayer",
            (data) => {

                const target =
                    players[
                        data.targetId
                    ];

                const attacker =
                    players[
                        socket.id
                    ];

                if (
                    !target ||
                    target.dead ||
                    !attacker ||
                    attacker.dead
                ) {
                    return;
                }

                io.to(
                    data.targetId
                ).emit(
                    "receiveKnockback",
                    {
                        velocityX:
                            Number(
                                data.velocityX
                            ) || 0,

                        velocityY:
                            Number(
                                data.velocityY
                            ) || 0
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
                    {
                        id:
                            data.id
                    }
                );
            }
        );

        socket.on(
            "fireballHit",
            (data) => {

                const attacker =
                    players[socket.id];

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

                // Normal fireball:
                // 1 full heart.
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

                const attacker =
                    players[socket.id];

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

                // Green fireball:
                // half a heart.
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
        // MELEE
        // =================================================

        socket.on(
            "meleeSwing",
            (data) => {

                const player =
                    players[socket.id];

                if (
                    !player ||
                    player.dead ||
                    player.greenLevel > 0
                ) {
                    return;
                }

                socket.broadcast.emit(
                    "playerMeleeSwing",
                    {
                        id:
                            socket.id,

                        facing:
                            data.facing
                    }
                );
            }
        );

        socket.on(
            "meleeHit",
            (data) => {

                const attacker =
                    players[socket.id];

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

                // Sword:
                // half a heart.
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
                            Number(
                                data.velocityX
                            ) || 0,

                        velocityY:
                            -2
                    }
                );
            }
        );

        // =================================================
        // PICK UP POWERUP
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

                // Small server-side
                // pickup validation.
                if (
                    distance > 60
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
                    players[socket.id];

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

                const position =
                    getSafePlayerPosition();

                player.x =
                    position.x;

                player.y =
                    position.y;

                player.health =
                    BASE_MAX_HEALTH;

                player.maxHealth =
                    BASE_MAX_HEALTH;

                player.dead =
                    false;

                player.respawnAllowedAt =
                    0;

                player.dashLevel = 0;
                player.greenLevel = 0;

                player.facing = 1;

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
                            player.dashLevel,

                        greenLevel:
                            player.greenLevel
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

                // Save their current gold
                // progress before removing them.
                if (
                    goldControllerId ===
                    socket.id
                ) {

                    pauseGoldControl();
                }

                delete players[
                    socket.id
                ];

                // Since Socket.IO gives this
                // player a new ID next time they
                // connect, there is no reason to
                // permanently keep old progress.
                delete goldSavedProgress[
                    socket.id
                ];

                io.emit(
                    "playerDisconnected",
                    socket.id
                );

                // If we fall from 6 players
                // to 5, shrink immediately.
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
            "Server running on port",
            PORT
        );
    }
);

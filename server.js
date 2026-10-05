const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(
    express.static(
        path.join(__dirname, "public")
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
    15 * 1000;

const SPIKE_ACTIVE_TIME =
    30 * 1000;

const SPIKE_COOLDOWN =
    60 * 1000;

const SPIKE_DAMAGE = 1;

const SPIKE_HEIGHT = 18;

const POWERUP_TYPES = [
    "health",
    "dash",
    "greenFireball",
    "spike"
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
// SPIKE STATE
// =====================================================

let activeSpikes = {};
let spikeCounter = 0;

// Used so a player takes damage once when
// entering spikes, not every server tick.
let spikeContacts =
    new Set();

// =====================================================
// GOLD PLATFORM STATE
// =====================================================

let goldControllerId = null;
let goldControlStartedAt = 0;
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
// GOLD PROGRESS
// =====================================================

function getSavedGoldTime(
    playerId
) {

    return (
        goldSavedProgress[playerId] ||
        0
    );
}

function setSavedGoldTime(
    playerId,
    milliseconds
) {

    goldSavedProgress[playerId] =
        clamp(
            milliseconds,
            0,
            GOLD_PLATFORM_TIME
        );
}

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
        previousSaved + elapsed
    );
}

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
            remaining: 15
        }
    );
}

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
            remaining: 15
        }
    );
}

// =====================================================
// PLATFORM GENERATION
// =====================================================

function generatePlatforms() {

    const newPlatforms = [];

    let platformId = 0;

    // Ground

    newPlatforms.push(
        {
            id:
                "platform-" +
                platformId++,

            x: 0,

            y:
                mapHeight - 30,

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
                        Math.random() * 3
                    );

            } while (
                style === previousStyle
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

            if (
                style === 0
            ) {

                newPlatforms.push(
                    leftPlatform,
                    rightPlatform
                );
            }

            if (
                style === 1
            ) {

                newPlatforms.push(
                    leftPlatform,
                    centerPlatform
                );
            }

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

    // Exactly one random gold platform.
    // Ground cannot be gold.

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
                    mapWidth - 90
                )
            ),

        y:
            mapHeight - 100,

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

        greenLevel: 0,

        spikeLevel: 0,

        spikeReadyAt: 0
    };
}

// =====================================================
// POWERUP POSITION
// =====================================================

function getRandomPowerupPosition() {

    const usablePlatforms =
        platforms.filter(
            platform =>
                platform.y <
                mapHeight - 40
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
                    platform.width - 20
                ),
                20,
                mapWidth - 20
            ),

        y:
            platform.y - 18
    };
}

// =====================================================
// SPAWN POWERUP
// =====================================================

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
// GIVE POWERUP
//
// IMPORTANT:
// POWERUPS DO NOT HEAL TO FULL.
//
// Healing to full happens when you KILL another player.
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

    // =================================================
    // HEALTH
    // =================================================

    if (
        type === "health"
    ) {

        const oldMaxHealth =
            player.maxHealth;

        player.maxHealth =
            Math.min(
                ABSOLUTE_MAX_HEALTH,
                player.maxHealth + 4
            );

        const maxHealthActuallyAdded =
            player.maxHealth -
            oldMaxHealth;

        player.health =
            Math.min(
                player.maxHealth,
                player.health +
                maxHealthActuallyAdded
            );
    }

    // =================================================
    // DASH
    // =================================================

    if (
        type === "dash"
    ) {

        player.dashLevel =
            (
                player.dashLevel ||
                0
            ) + 1;
    }

    // =================================================
    // GREEN FIREBALL
    // =================================================

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

    // =================================================
    // SPIKES
    //
    // Repeated pickups do not stack.
    // Once unlocked, the player has the ability
    // until death.
    // =================================================

    if (
        type === "spike"
    ) {

        player.spikeLevel = 1;

        if (
            player.spikeReadyAt ===
            undefined
        ) {

            player.spikeReadyAt = 0;
        }
    }

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
                player.greenLevel,

            spikeLevel:
                player.spikeLevel,

            spikeReadyAt:
                player.spikeReadyAt
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
                    mapWidth - 90
                )
            ),

        y:
            mapHeight - 100
    };
}

// =====================================================
// SPIKE HELPERS
// =====================================================

function removeSpike(
    spikeId
) {

    if (
        !activeSpikes[spikeId]
    ) {
        return;
    }

    delete activeSpikes[
        spikeId
    ];

    // Remove any saved contacts
    // involving this spike.

    for (
        const contact of
        Array.from(
            spikeContacts
        )
    ) {

        if (
            contact.startsWith(
                spikeId + ":"
            )
        ) {

            spikeContacts.delete(
                contact
            );
        }
    }

    io.emit(
        "spikeRemoved",
        spikeId
    );
}

function removeSpikesOwnedBy(
    playerId
) {

    for (
        const spikeId in
        activeSpikes
    ) {

        if (
            activeSpikes[
                spikeId
            ].ownerId ===
            playerId
        ) {

            removeSpike(
                spikeId
            );
        }
    }
}

function clearAllSpikes() {

    activeSpikes = {};

    spikeContacts.clear();

    io.emit(
        "clearSpikes"
    );
}

function getStandingFloatingPlatform(
    player
) {

    if (
        !player ||
        player.dead
    ) {
        return null;
    }

    for (
        const platform of
        platforms
    ) {

        // Ground does not count.

        if (
            platform.y >=
            mapHeight - 40
        ) {
            continue;
        }

        if (
            playerIsStandingOnPlatform(
                player,
                platform
            )
        ) {

            return platform;
        }
    }

    return null;
}

function playerTouchesSpike(
    player,
    spike
) {

    if (
        !player ||
        player.dead ||
        !spike
    ) {
        return false;
    }

    const spikeTop =
        spike.y -
        SPIKE_HEIGHT;

    const spikeBottom =
        spike.y + 2;

    const horizontalOverlap =
        player.x +
        PLAYER_SIZE >
        spike.x &&

        player.x <
        spike.x +
        spike.width;

    const verticalOverlap =
        player.y +
        PLAYER_SIZE >
        spikeTop &&

        player.y <
        spikeBottom;

    return (
        horizontalOverlap &&
        verticalOverlap
    );
}

// =====================================================
// MAP SIZE
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

    clearActiveGoldControl();

    // Platforms are about to change,
    // so all active spikes disappear.

    clearAllSpikes();

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
                useLarge,

            activeSpikes:
                activeSpikes
        }
    );
}

// =====================================================
// DAMAGE / DEATH
// =====================================================

function killPlayer(
    playerId,
    killerId
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
        goldControllerId ===
        playerId
    ) {

        pauseGoldControl();
    }

    // Any spikes belonging to the dead
    // player disappear immediately.

    removeSpikesOwnedBy(
        playerId
    );

    player.health = 0;

    player.dead = true;

    player.respawnAllowedAt =
        Date.now() +
        5000;

    // Death drops exactly one
    // random powerup.
    //
    // This can now be:
    // Health
    // Dash
    // Green Fireball
    // Spikes

    spawnPowerup(
        randomPowerupType()
    );

    // Dead player loses all upgrades.

    player.maxHealth =
        BASE_MAX_HEALTH;

    player.dashLevel = 0;

    player.greenLevel = 0;

    player.spikeLevel = 0;

    player.spikeReadyAt = 0;

    // =================================================
    // KILL REWARD
    //
    // If another living player caused the death,
    // that player immediately heals to FULL.
    // =================================================

    if (
        killerId &&
        killerId !== playerId
    ) {

        const killer =
            players[killerId];

        if (
            killer &&
            !killer.dead
        ) {

            killer.health =
                killer.maxHealth;

            io.emit(
                "playerHealthChanged",
                {
                    id:
                        killerId,

                    health:
                        killer.health,

                    maxHealth:
                        killer.maxHealth,

                    dead:
                        false,

                    respawnAllowedAt:
                        killer.respawnAllowedAt
                }
            );
        }
    }

    io.emit(
        "playerPowerupChanged",
        {
            id:
                playerId,

            health: 0,

            maxHealth:
                player.maxHealth,

            dashLevel: 0,

            greenLevel: 0,

            spikeLevel: 0,

            spikeReadyAt: 0
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

// =====================================================
// DAMAGE PLAYER
// =====================================================

function damagePlayer(
    playerId,
    amount,
    attackerId
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
            playerId,
            attackerId
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
// SPIKE COLLISION LOOP
// =====================================================

setInterval(
    () => {

        const now =
            Date.now();

        for (
            const spikeId in
            activeSpikes
        ) {

            const spike =
                activeSpikes[
                    spikeId
                ];

            // Remove after 30 seconds.

            if (
                now >=
                spike.expiresAt
            ) {

                removeSpike(
                    spikeId
                );

                continue;
            }

            for (
                const playerId in
                players
            ) {

                const player =
                    players[playerId];

                // Owner cannot be damaged
                // by their own spikes.

                if (
                    !player ||
                    player.dead ||
                    playerId ===
                    spike.ownerId
                ) {

                    continue;
                }

                const contactKey =
                    spikeId +
                    ":" +
                    playerId;

                const touching =
                    playerTouchesSpike(
                        player,
                        spike
                    );

                if (
                    touching
                ) {

                    // Only damage when the player
                    // first touches/enters the spikes.

                    if (
                        !spikeContacts.has(
                            contactKey
                        )
                    ) {

                        spikeContacts.add(
                            contactKey
                        );

                        damagePlayer(
                            playerId,
                            SPIKE_DAMAGE,
                            spike.ownerId
                        );
                    }

                } else {

                    // Player left the spikes.
                    //
                    // If they touch them again,
                    // they can take another hit.

                    spikeContacts.delete(
                        contactKey
                    );
                }
            }
        }

    },
    50
);

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

        const solePlayerId =
            standingPlayers[0];

        if (
            goldControllerId !==
            solePlayerId
        ) {

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

            goldSavedProgress[
                solePlayerId
            ] = 0;

            goldControlStartedAt =
                Date.now();

            io.emit(
                "goldPlatformStatus",
                {
                    controllerId:
                        solePlayerId,

                    progress: 0,

                    remaining: 15
                }
            );
        }

    },
    100
);

// =====================================================
// PLATFORM RANDOMIZATION
// =====================================================

setInterval(
    () => {

        clearActiveGoldControl();

        // Old platforms are disappearing,
        // so spikes disappear too.

        clearAllSpikes();

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

        if (
            goldSavedProgress[
                socket.id
            ] === undefined
        ) {

            goldSavedProgress[
                socket.id
            ] = 0;
        }

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
                    shouldUseLargeMap(),

                activeSpikes:
                    activeSpikes
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

        socket.emit(
            "currentSpikes",
            activeSpikes
        );

        socket.broadcast.emit(
            "newPlayer",
            players[socket.id]
        );

        // =================================================
        // PLAYER MOVEMENT
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
                        Number(data.x) || 0,
                        0,
                        mapWidth -
                        PLAYER_SIZE
                    );

                player.y =
                    Number(data.y) || 0;

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
        // ACTIVATE SPIKES
        // =================================================

        socket.on(
            "activateSpikes",
            () => {

                const player =
                    players[socket.id];

                if (
                    !player ||
                    player.dead ||
                    player.spikeLevel <= 0
                ) {
                    return;
                }

                const now =
                    Date.now();

                // Ability is still cooling down.

                if (
                    now <
                    (
                        player.spikeReadyAt ||
                        0
                    )
                ) {
                    return;
                }

                // Must actually be standing on
                // a floating platform.
                //
                // Ground does not count.

                const platform =
                    getStandingFloatingPlatform(
                        player
                    );

                if (
                    !platform
                ) {
                    return;
                }

                // Remove an old spike belonging
                // to this player if one somehow
                // still exists.

                removeSpikesOwnedBy(
                    socket.id
                );

                const spikeId =
                    "spike-" +
                    spikeCounter++;

                const expiresAt =
                    now +
                    SPIKE_ACTIVE_TIME;

                // Cooldown starts immediately
                // when activated.
                //
                // 0-30 seconds = spikes active.
                // 30-60 seconds = cooldown only.
                // At 60 seconds = ready again.

                player.spikeReadyAt =
                    now +
                    SPIKE_COOLDOWN;

                const spike = {
                    id:
                        spikeId,

                    ownerId:
                        socket.id,

                    platformId:
                        platform.id,

                    x:
                        platform.x,

                    // This is the TOP of
                    // the platform.
                    y:
                        platform.y,

                    width:
                        platform.width,

                    height:
                        SPIKE_HEIGHT,

                    expiresAt:
                        expiresAt,

                    readyAt:
                        player.spikeReadyAt
                };

                activeSpikes[
                    spikeId
                ] =
                    spike;

                io.emit(
                    "spikeActivated",
                    spike
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
                            player.greenLevel,

                        spikeLevel:
                            player.spikeLevel,

                        spikeReadyAt:
                            player.spikeReadyAt
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
                // 1 full heart damage.

                damagePlayer(
                    data.targetId,
                    2,
                    socket.id
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
                // half-heart damage.

                damagePlayer(
                    data.targetId,
                    1,
                    socket.id
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
                            direction * 60,

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
                // half-heart damage.

                damagePlayer(
                    data.targetId,
                    1,
                    socket.id
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
        // PICKUP POWERUP
        //
        // Picking up a powerup does NOT full-heal.
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

                player.spikeLevel = 0;

                player.spikeReadyAt = 0;

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
                            player.greenLevel,

                        spikeLevel:
                            player.spikeLevel,

                        spikeReadyAt:
                            player.spikeReadyAt
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

                if (
                    goldControllerId ===
                    socket.id
                ) {

                    pauseGoldControl();
                }

                // Remove spikes belonging
                // to disconnected player.

                removeSpikesOwnedBy(
                    socket.id
                );

                delete players[
                    socket.id
                ];

                delete goldSavedProgress[
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

        console.log(
            "BLOCK BATTLE IS RUNNING!"
        );

        console.log(
            "Server running on port",
            PORT
        );
    }
);

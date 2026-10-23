
const socket = io();
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// =====================================================
// APPLE BATTLE - COMPLETE GAME.JS
// =====================================================
// Visual theme only:
// - Players are cartoon apples
// - Fireballs are red and green apples
// - Swords are apple slices
// - Platforms are leafy branches
// - Gold platform is a golden apple branch
// - Spikes look like sharp apple cores
// - Powerups are little colored apples
// - Original dark background stays
// =====================================================

// =====================================================
// SETTINGS
// =====================================================

const PLAYER_SIZE = 30;
const MOVE_SPEED = 4;
const JUMP_POWER = 11;
const GRAVITY = 0.5;

const NORMAL_SHOVE_RANGE = 85;
const NORMAL_KNOCKBACK = 6;

const FIREBALL_SPEED = 9;
const FIREBALL_KNOCKBACK = 30;
const FIREBALL_CHARGE_TIME = 1000;

const MELEE_RANGE = 65;
const MELEE_KNOCKBACK = 4;
const MELEE_COOLDOWN = 350;
const SWORD_SWING_TIME = 220;

const BASE_MAX_HEALTH = 20;
const BASE_DASH_POWER = 30;
const MAX_DASH_DISTANCE_UPGRADES = 4;
const POWERUP_RADIUS = 13;

// =====================================================
// GAME STATE
// =====================================================

let myId = null;
let players = {};
let platforms = [];
let powerups = {};
let fireballs = [];
let activeSpikes = {};
let meleeSwings = {};
let keys = {};

let velocityX = 0;
let velocityY = 0;
let onGround = false;
let facing = 1;

let spaceHeld = false;
let spacePressedAt = 0;

let lastMeleeTime = 0;
let lastDashTime = 0;
let lastGreenFireballTime = 0;

let respawnButton = null;

let platformMessageUntil = 0;
let mapChangeMessageUntil = 0;
let mapIsLarge = false;

let powerupPickupAttempts = {};

let goldControllerId = null;
let goldProgress = 0;
let goldRemaining = 15;

let goldRewardMessage = "";
let goldRewardMessageUntil = 0;

let dropThroughPlatform = null;
let dropThroughUntil = 0;

// =====================================================
// NICKNAMES
// =====================================================

const nicknameInput =
    document.getElementById("nicknameInput");

const nicknameButton =
    document.getElementById("saveNickname");

const nicknameStatus =
    document.getElementById("nicknameStatus");

let myNickname = "PLAYER";

try {
    myNickname =
        localStorage.getItem("blockBattleNickname") ||
        "PLAYER";
} catch (error) {}

function saveNickname() {
    if (!nicknameInput) return;

    const nickname = nicknameInput.value
        .trim()
        .replace(/[^a-zA-Z0-9 _-]/g, "")
        .slice(0, 16);

    if (!nickname) {
        if (nicknameStatus) {
            nicknameStatus.textContent =
                "Enter a nickname.";
        }
        return;
    }

    myNickname = nickname;
    nicknameInput.value = nickname;

    try {
        localStorage.setItem(
            "blockBattleNickname",
            nickname
        );
    } catch (error) {}

    socket.emit("setNickname", nickname);

    if (nicknameStatus) {
        nicknameStatus.textContent =
            "Nickname saved: " + nickname;
    }

    nicknameInput.blur();
}

if (nicknameInput) {
    nicknameInput.value = myNickname;

    nicknameInput.addEventListener("keydown", event => {
        event.stopPropagation();

        if (event.key === "Enter") {
            event.preventDefault();
            saveNickname();
        }
    });

    nicknameInput.addEventListener("keyup", event => {
        event.stopPropagation();
    });
}

if (nicknameButton) {
    nicknameButton.addEventListener(
        "click",
        saveNickname
    );
}

socket.on("nicknameChanged", data => {
    if (!data || !players[data.id]) return;

    players[data.id].nickname = data.nickname;
});

// =====================================================
// CONTROLS
// =====================================================

function leftHeld() {
    return !!(keys.KeyA || keys.ArrowLeft);
}

function rightHeld() {
    return !!(keys.KeyD || keys.ArrowRight);
}

function jumpHeld() {
    return !!(keys.KeyW || keys.ArrowUp);
}

function getDashCooldown(player) {
    if (!player || !player.dashLevel) return 0;

    return Math.max(
        4,
        8 - player.dashLevel
    ) * 1000;
}

function getDashPower(player) {
    if (!player || !player.dashLevel) return 0;

    const upgrades = Math.min(
        Math.max(player.dashLevel - 1, 0),
        MAX_DASH_DISTANCE_UPGRADES
    );

    return BASE_DASH_POWER * (1 + upgrades * 0.25);
}

function getDashDistancePercent(player) {
    if (!player || !player.dashLevel) return 0;

    const upgrades = Math.min(
        Math.max(player.dashLevel - 1, 0),
        MAX_DASH_DISTANCE_UPGRADES
    );

    return 100 + upgrades * 25;
}

function getGreenCooldown(player) {
    if (!player || !player.greenLevel) return 0;

    return Math.max(
        1000,
        2500 - player.greenLevel * 500
    );
}

// =====================================================
// CONNECTION
// =====================================================

socket.on("connect", () => {
    myId = socket.id;
    socket.emit("setNickname", myNickname);
});

// =====================================================
// MAP EVENTS
// =====================================================

socket.on("mapState", data => {
    canvas.width = data.width;
    canvas.height = data.height;

    platforms = data.platforms || [];
    mapIsLarge = !!data.largeMap;
    activeSpikes = data.activeSpikes || {};
});

socket.on("mapChanged", data => {
    canvas.width = data.width;
    canvas.height = data.height;

    platforms = data.platforms || [];
    powerups = data.powerups || {};
    activeSpikes = data.activeSpikes || {};
    mapIsLarge = !!data.largeMap;

    mapChangeMessageUntil = Date.now() + 4000;

    goldControllerId = null;
    goldProgress = 0;
    goldRemaining = 15;

    dropThroughPlatform = null;
    dropThroughUntil = 0;

    if (data.playerPositions) {
        for (const id in data.playerPositions) {
            if (!players[id]) continue;

            const position = data.playerPositions[id];

            players[id].x = position.x;
            players[id].y = position.y;
            players[id].facing = position.facing;
        }
    }

    velocityX = 0;
    velocityY = 0;
    onGround = false;
});

socket.on("platformLayoutChanged", newPlatforms => {
    platforms = newPlatforms || [];

    platformMessageUntil = Date.now() + 3000;

    goldControllerId = null;
    goldProgress = 0;
    goldRemaining = 15;

    activeSpikes = {};
    dropThroughPlatform = null;

    const me = players[myId];

    if (me && !me.dead) {
        me.x = 100 + Math.random() *
            Math.max(
                0,
                Math.min(300, canvas.width - 200)
            );

        me.y = canvas.height - 100;

        velocityX = 0;
        velocityY = 0;
        onGround = false;

        socket.emit("playerMove", {
            x: me.x,
            y: me.y,
            facing
        });
    }
});

// =====================================================
// GOLD PLATFORM
// =====================================================

socket.on("goldPlatformStatus", data => {
    goldControllerId = data.controllerId;
    goldProgress = data.progress || 0;
    goldRemaining = data.remaining ?? 15;
});

socket.on("goldPlatformReward", data => {
    if (data.playerId !== myId) return;

    const names = {
        health: "HEALTH",
        dash: "DASH",
        greenFireball: "GREEN APPLE",
        spike: "APPLE CORE SPIKES"
    };

    goldRewardMessage =
        "GOLD REWARD: " +
        (names[data.type] || "POWERUP") +
        "!";

    goldRewardMessageUntil = Date.now() + 3500;
});

// =====================================================
// POWERUP EVENTS
// =====================================================

socket.on("currentPowerups", data => {
    powerups = data || {};
});

socket.on("powerupSpawned", powerup => {
    powerups[powerup.id] = powerup;
});

socket.on("powerupRemoved", id => {
    delete powerups[id];
    delete powerupPickupAttempts[id];
});

// =====================================================
// PLAYER EVENTS
// =====================================================

function normalizePlayer(player) {
    if (!player) return player;

    player.dashLevel = player.dashLevel || 0;
    player.greenLevel = player.greenLevel || 0;
    player.spikeLevel = player.spikeLevel || 0;

    player.spikeReadyAt =
        player.spikeReadyAt || 0;

    player.maxHealth =
        player.maxHealth || BASE_MAX_HEALTH;

    player.health =
        player.health ?? player.maxHealth;

    player.facing = player.facing || 1;
    player.nickname = player.nickname || "PLAYER";

    return player;
}

socket.on("currentPlayers", serverPlayers => {
    players = serverPlayers || {};

    for (const id in players) {
        normalizePlayer(players[id]);
    }

    const me = players[myId];

    if (me) {
        facing = me.facing || 1;
    }
});

socket.on("newPlayer", player => {
    players[player.id] = normalizePlayer(player);
});

socket.on("playerMoved", data => {
    const player = players[data.id];

    if (!player) return;

    player.x = data.x;
    player.y = data.y;
    player.facing = data.facing;
});

socket.on("playerDisconnected", id => {
    delete players[id];
    delete meleeSwings[id];
});

socket.on("playerHealthChanged", data => {
    const player = players[data.id];

    if (!player) return;

    player.health = data.health;
    player.maxHealth =
        data.maxHealth ?? player.maxHealth;

    player.dead = data.dead;

    if (data.respawnAllowedAt !== undefined) {
        player.respawnAllowedAt =
            data.respawnAllowedAt;
    }

    if (data.id === myId && data.dead) {
        velocityX = 0;
        velocityY = 0;
        spaceHeld = false;
        onGround = false;
    }
});

socket.on("playerPowerupChanged", data => {
    const player = players[data.id];

    if (!player) return;

    player.health =
        data.health ?? player.health;

    player.maxHealth =
        data.maxHealth ?? player.maxHealth;

    player.dashLevel =
        data.dashLevel ?? player.dashLevel ?? 0;

    player.greenLevel =
        data.greenLevel ?? player.greenLevel ?? 0;

    player.spikeLevel =
        data.spikeLevel ?? player.spikeLevel ?? 0;

    player.spikeReadyAt =
        data.spikeReadyAt ?? player.spikeReadyAt ?? 0;

    if (data.id === myId && !player.dashLevel) {
        lastDashTime = 0;
    }

    if (data.id === myId && !player.greenLevel) {
        lastGreenFireballTime = 0;
    }
});

socket.on("playerRespawned", data => {
    if (!players[data.id]) {
        players[data.id] = {};
    }

    const player = players[data.id];

    player.x = data.x;
    player.y = data.y;
    player.health = data.health;
    player.maxHealth = data.maxHealth;
    player.dead = false;
    player.facing = data.facing || 1;

    player.dashLevel = data.dashLevel || 0;
    player.greenLevel = data.greenLevel || 0;
    player.spikeLevel = data.spikeLevel || 0;
    player.spikeReadyAt = data.spikeReadyAt || 0;

    player.respawnAllowedAt = 0;

    if (data.nickname) {
        player.nickname = data.nickname;
    }

    if (data.id === myId) {
        velocityX = 0;
        velocityY = 0;
        onGround = false;
        facing = player.facing;

        lastDashTime = 0;
        lastGreenFireballTime = 0;
        lastMeleeTime = 0;

        dropThroughPlatform = null;
    }
});

// =====================================================
// KNOCKBACK
// =====================================================

socket.on("receiveKnockback", data => {
    const me = players[myId];

    if (!me || me.dead) return;

    velocityX += data.velocityX;
    velocityY += data.velocityY;
    onGround = false;
});

// =====================================================
// SWORD AND FIREBALL EVENTS
// =====================================================

socket.on("playerMeleeSwing", data => {
    meleeSwings[data.id] = {
        start: Date.now(),
        facing: data.facing
    };
});

socket.on("spawnFireball", fireball => {
    if (!fireballs.some(item => item.id === fireball.id)) {
        fireballs.push(fireball);
    }
});

socket.on("removeFireball", data => {
    fireballs = fireballs.filter(
        item => item.id !== data.id
    );
});

// =====================================================
// SPIKE EVENTS
// =====================================================

socket.on("currentSpikes", data => {
    activeSpikes = data || {};
});

socket.on("spikeActivated", spike => {
    activeSpikes[spike.id] = spike;

    if (players[spike.ownerId]) {
        players[spike.ownerId].spikeReadyAt =
            spike.readyAt ||
            players[spike.ownerId].spikeReadyAt ||
            0;
    }
});

socket.on("spikeRemoved", id => {
    delete activeSpikes[id];
});

socket.on("clearSpikes", () => {
    activeSpikes = {};
});

// =====================================================
// DROP THROUGH FLOATING BRANCHES
// =====================================================

function dropThroughCurrentPlatform() {
    const me = players[myId];

    if (!me || me.dead || !onGround) return;

    const bottom = me.y + PLAYER_SIZE;

    for (const platform of platforms) {
        const overlaps =
            me.x + PLAYER_SIZE > platform.x &&
            me.x < platform.x + platform.width;

        const standingOn =
            Math.abs(bottom - platform.y) < 5;

        const isGround =
            platform.y + platform.height >=
            canvas.height - 8;

        if (
            !overlaps ||
            !standingOn ||
            isGround
        ) {
            continue;
        }

        dropThroughPlatform = platform;
        dropThroughUntil = Date.now() + 650;

        onGround = false;
        velocityY = Math.max(velocityY, 4);

        me.y += 5;

        return;
    }
}

// =====================================================
// KEYBOARD
// =====================================================

function typingNickname() {
    return document.activeElement === nicknameInput;
}

document.addEventListener("keydown", event => {
    if (typingNickname()) return;

    if ([
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Space"
    ].includes(event.code)) {
        event.preventDefault();
    }

    keys[event.code] = true;

    const me = players[myId];

    if (!me || me.dead) return;

    if (
        event.code === "ArrowDown" &&
        !event.repeat
    ) {
        dropThroughCurrentPlatform();
    }

    if (
        event.code === "Space" &&
        !spaceHeld
    ) {
        spaceHeld = true;
        spacePressedAt = Date.now();
    }

    if (
        event.code === "KeyF" &&
        !event.repeat
    ) {
        performFAction();
    }

    if (
        event.code === "KeyG" &&
        !event.repeat
    ) {
        performDash();
    }

    if (
        event.code === "KeyE" &&
        !event.repeat
    ) {
        activateSpikes();
    }
});

document.addEventListener("keyup", event => {
    if (typingNickname()) return;

    if ([
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Space"
    ].includes(event.code)) {
        event.preventDefault();
    }

    keys[event.code] = false;

    if (event.code !== "Space") return;

    const me = players[myId];

    if (!me || me.dead) {
        spaceHeld = false;
        return;
    }

    if (!spaceHeld) return;

    const heldTime =
        Date.now() - spacePressedAt;

    if (heldTime >= FIREBALL_CHARGE_TIME) {
        shootNormalFireball();
    } else {
        normalShove();
    }

    spaceHeld = false;
});

window.addEventListener("blur", () => {
    keys = {};
    spaceHeld = false;
});

// =====================================================
// DASH
// =====================================================

function performDash() {
    const me = players[myId];

    if (
        !me ||
        me.dead ||
        !me.dashLevel
    ) {
        return;
    }

    if (
        Date.now() - lastDashTime <
        getDashCooldown(me)
    ) {
        return;
    }

    const power = getDashPower(me);

    const left = leftHeld();
    const right = rightHeld();

    if (
        jumpHeld() &&
        !left &&
        !right
    ) {
        lastDashTime = Date.now();

        velocityX = 0;
        velocityY = -power;
        onGround = false;

        return;
    }

    let direction = facing;

    if (left && !right) direction = -1;
    if (right && !left) direction = 1;

    lastDashTime = Date.now();

    facing = direction;
    me.facing = direction;

    me.x += direction * power;

    me.x = Math.max(
        0,
        Math.min(
            canvas.width - PLAYER_SIZE,
            me.x
        )
    );

    socket.emit("playerMove", {
        x: me.x,
        y: me.y,
        facing
    });
}

// =====================================================
// APPLE CORE SPIKE ACTION
// =====================================================

function activateSpikes() {
    const me = players[myId];

    if (
        !me ||
        me.dead ||
        !me.spikeLevel
    ) {
        return;
    }

    if (
        Date.now() <
        (me.spikeReadyAt || 0)
    ) {
        return;
    }

    socket.emit("activateSpikes");
}

// =====================================================
// ATTACKS
// =====================================================

function performFAction() {
    const me = players[myId];

    if (!me || me.dead) return;

    if (me.greenLevel > 0) {
        shootGreenFireball();
    } else {
        performMeleeAttack();
    }
}

function normalShove() {
    const me = players[myId];

    if (!me || me.dead) return;

    for (const id in players) {
        if (id === myId) continue;

        const target = players[id];

        if (!target || target.dead) continue;

        const dx = target.x - me.x;
        const dy = target.y - me.y;

        const distance = Math.hypot(dx, dy);

        if (distance <= NORMAL_SHOVE_RANGE) {
            socket.emit("knockbackPlayer", {
                targetId: id,
                velocityX:
                    (dx >= 0 ? 1 : -1) *
                    NORMAL_KNOCKBACK,
                velocityY: -4
            });
        }
    }
}

function performMeleeAttack() {
    const me = players[myId];

    if (
        !me ||
        me.dead ||
        me.greenLevel > 0
    ) {
        return;
    }

    if (
        Date.now() - lastMeleeTime <
        MELEE_COOLDOWN
    ) {
        return;
    }

    lastMeleeTime = Date.now();

    meleeSwings[myId] = {
        start: Date.now(),
        facing
    };

    socket.emit("meleeSwing", { facing });

    let closestId = null;
    let closestDistance = Infinity;

    for (const id in players) {
        if (id === myId) continue;

        const target = players[id];

        if (!target || target.dead) continue;

        const dx = target.x - me.x;
        const dy = target.y - me.y;

        const distance = Math.hypot(dx, dy);

        const inFront =
            facing === 1
                ? dx >= 0
                : dx <= 0;

        if (
            inFront &&
            distance <= MELEE_RANGE &&
            distance < closestDistance
        ) {
            closestDistance = distance;
            closestId = id;
        }
    }

    if (closestId) {
        socket.emit("meleeHit", {
            targetId: closestId,
            velocityX:
                facing * MELEE_KNOCKBACK
        });
    }
}

// =====================================================
// RED APPLE FIREBALL
// =====================================================

function shootNormalFireball() {
    const me = players[myId];

    if (!me || me.dead) return;

    const fireball = {
        id:
            myId +
            "-normal-" +
            Date.now() +
            "-" +
            Math.random(),

        ownerId: myId,
        type: "normal",

        x: me.x + PLAYER_SIZE / 2,
        y: me.y + PLAYER_SIZE / 2,

        velocityX:
            facing * FIREBALL_SPEED,

        velocityY: 0,
        radius: 10
    };

    fireballs.push(fireball);

    socket.emit(
        "shootFireball",
        fireball
    );
}

// =====================================================
// GREEN APPLE FIREBALL
// =====================================================

function shootGreenFireball() {
    const me = players[myId];

    if (
        !me ||
        me.dead ||
        !me.greenLevel
    ) {
        return;
    }

    if (
        Date.now() - lastGreenFireballTime <
        getGreenCooldown(me)
    ) {
        return;
    }

    lastGreenFireballTime = Date.now();

    let vx = facing * FIREBALL_SPEED;
    let vy = 0;

    if (Math.random() < 0.25) {
        let nearest = null;
        let nearestDistance = Infinity;

        for (const id in players) {
            if (id === myId) continue;

            const target = players[id];

            if (!target || target.dead) continue;

            const distance = Math.hypot(
                target.x - me.x,
                target.y - me.y
            );

            if (distance < nearestDistance) {
                nearest = target;
                nearestDistance = distance;
            }
        }

        if (nearest) {
            const dx = nearest.x - me.x;
            const dy = nearest.y - me.y;

            const length =
                Math.hypot(dx, dy) || 1;

            vx =
                dx / length * FIREBALL_SPEED;

            vy =
                dy / length * FIREBALL_SPEED;
        }
    }

    const fireball = {
        id:
            myId +
            "-green-" +
            Date.now() +
            "-" +
            Math.random(),

        ownerId: myId,
        type: "green",

        x: me.x + PLAYER_SIZE / 2,
        y: me.y + PLAYER_SIZE / 2,

        velocityX: vx,
        velocityY: vy,
        radius: 11
    };

    fireballs.push(fireball);

    socket.emit(
        "shootGreenFireball",
        fireball
    );
}

// =====================================================
// UPDATE FLYING APPLES
// =====================================================

function updateFireballs() {
    for (
        let i = fireballs.length - 1;
        i >= 0;
        i--
    ) {
        const fireball = fireballs[i];

        fireball.x += fireball.velocityX;
        fireball.y += fireball.velocityY || 0;

        const outside =
            fireball.x < -100 ||
            fireball.x > canvas.width + 100 ||
            fireball.y < -100 ||
            fireball.y > canvas.height + 100;

        if (outside) {
            if (fireball.ownerId === myId) {
                socket.emit("removeFireball", {
                    id: fireball.id
                });
            }

            fireballs.splice(i, 1);
            continue;
        }

        if (fireball.ownerId !== myId) {
            continue;
        }

        for (const id in players) {
            if (id === fireball.ownerId) continue;

            const target = players[id];

            if (!target || target.dead) continue;

            const distance = Math.hypot(
                fireball.x -
                    (target.x + PLAYER_SIZE / 2),

                fireball.y -
                    (target.y + PLAYER_SIZE / 2)
            );

            if (
                distance >=
                fireball.radius + PLAYER_SIZE / 2
            ) {
                continue;
            }

            if (fireball.type === "green") {
                socket.emit("greenFireballHit", {
                    targetId: id,
                    direction:
                        fireball.velocityX < 0
                            ? -1
                            : 1
                });
            } else {
                socket.emit("fireballHit", {
                    targetId: id
                });

                socket.emit("knockbackPlayer", {
                    targetId: id,

                    velocityX:
                        (fireball.velocityX >= 0
                            ? 1
                            : -1) *
                        FIREBALL_KNOCKBACK,

                    velocityY: -10
                });
            }

            socket.emit("removeFireball", {
                id: fireball.id
            });

            fireballs.splice(i, 1);
            break;
        }
    }
}

// =====================================================
// POWERUP PICKUP
// =====================================================

function updatePowerupPickup() {
    const me = players[myId];

    if (!me || me.dead) return;

    const centerX =
        me.x + PLAYER_SIZE / 2;

    const centerY =
        me.y + PLAYER_SIZE / 2;

    for (const id in powerups) {
        const powerup = powerups[id];

        const distance = Math.hypot(
            centerX - powerup.x,
            centerY - powerup.y
        );

        if (
            distance <
            PLAYER_SIZE / 2 + POWERUP_RADIUS
        ) {
            const last =
                powerupPickupAttempts[id] || 0;

            if (Date.now() - last > 500) {
                powerupPickupAttempts[id] =
                    Date.now();

                socket.emit(
                    "pickupPowerup",
                    id
                );
            }
        }
    }
}

// =====================================================
// MOVEMENT AND COLLISIONS
// =====================================================

function updatePlayer() {
    const me = players[myId];

    if (!me) return;

    if (me.dead) {
        velocityX = 0;
        velocityY = 0;
        return;
    }

    if (
        leftHeld() &&
        !rightHeld()
    ) {
        velocityX = -MOVE_SPEED;
        facing = -1;
    } else if (
        rightHeld() &&
        !leftHeld()
    ) {
        velocityX = MOVE_SPEED;
        facing = 1;
    } else {
        velocityX *= 0.8;

        if (Math.abs(velocityX) < 0.1) {
            velocityX = 0;
        }
    }

    if (
        jumpHeld() &&
        onGround &&
        !keys.ArrowDown
    ) {
        velocityY = -JUMP_POWER;
        onGround = false;
    }

    me.x += velocityX;

    me.x = Math.max(
        0,
        Math.min(
            canvas.width - PLAYER_SIZE,
            me.x
        )
    );

    const oldY = me.y;

    velocityY += GRAVITY;
    me.y += velocityY;

    onGround = false;

    if (velocityY >= 0) {
        for (const platform of platforms) {
            const overlapsX =
                me.x + PLAYER_SIZE > platform.x &&
                me.x < platform.x + platform.width;

            const crossedTop =
                oldY + PLAYER_SIZE <= platform.y &&
                me.y + PLAYER_SIZE >= platform.y;

            const ignored =
                platform === dropThroughPlatform &&
                Date.now() < dropThroughUntil;

            if (
                overlapsX &&
                crossedTop &&
                !ignored
            ) {
                me.y =
                    platform.y - PLAYER_SIZE;

                velocityY = 0;
                onGround = true;
                break;
            }
        }
    }

    if (
        dropThroughPlatform &&
        (
            Date.now() >= dropThroughUntil ||
            me.y > dropThroughPlatform.y + 5
        )
    ) {
        dropThroughPlatform = null;
    }

    if (me.y > canvas.height + 100) {
        me.x =
            100 +
            Math.random() *
            Math.max(
                0,
                Math.min(
                    300,
                    canvas.width - 200
                )
            );

        me.y = canvas.height - 100;

        velocityX = 0;
        velocityY = 0;
        onGround = false;
    }

    me.facing = facing;

    socket.emit("playerMove", {
        x: me.x,
        y: me.y,
        facing
    });
}

// =====================================================
// CARTOON APPLE DRAWING
// =====================================================

function drawApple(
    x,
    y,
    size,
    color,
    showFace = false,
    direction = 1
) {
    ctx.save();

    const cx = x + size / 2;

    // Main apple body
    ctx.fillStyle = color;

    ctx.beginPath();

    ctx.moveTo(
        cx,
        y + size * 0.18
    );

    ctx.bezierCurveTo(
        x + size * 0.08,
        y - size * 0.02,

        x - size * 0.07,
        y + size * 0.35,

        x + size * 0.08,
        y + size * 0.75
    );

    ctx.bezierCurveTo(
        x + size * 0.2,
        y + size * 1.06,

        cx - size * 0.08,
        y + size * 1.03,

        cx,
        y + size * 0.96
    );

    ctx.bezierCurveTo(
        cx + size * 0.08,
        y + size * 1.03,

        x + size * 0.8,
        y + size * 1.06,

        x + size * 0.92,
        y + size * 0.75
    );

    ctx.bezierCurveTo(
        x + size * 1.07,
        y + size * 0.35,

        x + size * 0.92,
        y - size * 0.02,

        cx,
        y + size * 0.18
    );

    ctx.closePath();
    ctx.fill();

    // Dark cartoon outline
    ctx.strokeStyle = "#242424";
    ctx.lineWidth = Math.max(
        1.5,
        size * 0.055
    );

    ctx.stroke();

    // Stem
    ctx.strokeStyle = "#73441f";
    ctx.lineWidth = Math.max(
        2,
        size * 0.09
    );

    ctx.lineCap = "round";

    ctx.beginPath();
    ctx.moveTo(cx, y + size * 0.17);
    ctx.lineTo(
        cx + size * 0.04,
        y - size * 0.05
    );
    ctx.stroke();

    // Green leaf
    ctx.fillStyle = "#43c74b";

    ctx.beginPath();
    ctx.ellipse(
        cx + size * 0.2,
        y + size * 0.035,

        size * 0.23,
        size * 0.1,

        -0.5,
        0,
        Math.PI * 2
    );

    ctx.fill();

    // Shine
    ctx.fillStyle =
        "rgba(255,255,255,0.28)";

    ctx.beginPath();

    ctx.ellipse(
        x + size * 0.25,
        y + size * 0.36,

        size * 0.08,
        size * 0.15,

        -0.35,
        0,
        Math.PI * 2
    );

    ctx.fill();

    if (showFace) {
        // White eyes
        ctx.fillStyle = "#ffffff";

        for (const offset of [-0.16, 0.16]) {
            ctx.beginPath();

            ctx.ellipse(
                cx + size * offset,
                y + size * 0.48,

                size * 0.115,
                size * 0.155,

                0,
                0,
                Math.PI * 2
            );

            ctx.fill();
        }

        // Pupils follow player direction
        ctx.fillStyle = "#181818";

        for (const offset of [-0.16, 0.16]) {
            ctx.beginPath();

            ctx.arc(
                cx +
                    size * offset +
                    direction * size * 0.035,

                y + size * 0.49,

                Math.max(
                    1.5,
                    size * 0.05
                ),

                0,
                Math.PI * 2
            );

            ctx.fill();
        }

        // Smile
        ctx.strokeStyle = "#48251c";
        ctx.lineWidth = Math.max(
            1.2,
            size * 0.045
        );

        ctx.beginPath();

        ctx.arc(
            cx,
            y + size * 0.65,

            size * 0.12,

            0.15,
            Math.PI - 0.15
        );

        ctx.stroke();
    }

    ctx.restore();
}

// =====================================================
// DRAW APPLE TREE BRANCH PLATFORMS
// =====================================================

function drawBranch(platform) {
    const x = platform.x;
    const y = platform.y;
    const w = platform.width;
    const h = platform.height;

    ctx.save();

    // Main wooden branch
    ctx.fillStyle = "#86532d";
    ctx.fillRect(x, y, w, h);

    // Dark bottom
    ctx.fillStyle = "#543019";
    ctx.fillRect(
        x,
        y + h - 5,
        w,
        5
    );

    // Green leafy top
    ctx.fillStyle = "#3cba50";
    ctx.fillRect(
        x,
        y,
        w,
        6
    );

    // Small leaf clumps
    for (
        let i = 14;
        i < w - 5;
        i += 26
    ) {
        ctx.beginPath();

        ctx.ellipse(
            x + i,
            y + 2,
            11,
            5,
            0,
            0,
            Math.PI * 2
        );

        ctx.fill();
    }

    // Wood grain
    ctx.strokeStyle = "#ac7444";
    ctx.lineWidth = 2;

    for (
        let i = 15;
        i < w - 10;
        i += 48
    ) {
        ctx.beginPath();

        ctx.moveTo(
            x + i,
            y + h * 0.58
        );

        ctx.lineTo(
            x + Math.min(i + 24, w - 5),
            y + h * 0.58
        );

        ctx.stroke();
    }

    // Gold platform decoration
    if (platform.isGold) {
        ctx.fillStyle = "#ffd633";
        ctx.fillRect(
            x,
            y,
            w,
            7
        );

        ctx.strokeStyle = "#ffed86";
        ctx.lineWidth = 3;

        ctx.strokeRect(
            x,
            y,
            w,
            h
        );

        // Golden apple
        drawApple(
            x + w / 2 - 11,
            y - 23,
            22,
            "#ffd633"
        );
    }

    ctx.restore();
}

// =====================================================
// DRAW APPLE SLICE SWORD
// =====================================================

function drawSword(player, swing) {
    const elapsed =
        Date.now() - swing.start;

    if (elapsed > SWORD_SWING_TIME) {
        return;
    }

    const progress =
        elapsed / SWORD_SWING_TIME;

    const direction =
        swing.facing === -1 ? -1 : 1;

    const angle =
        direction === 1
            ? -1.1 + progress * 2
            : Math.PI + 1.1 - progress * 2;

    const handX =
        player.x + PLAYER_SIZE / 2;

    const handY =
        player.y + PLAYER_SIZE / 2;

    ctx.save();

    ctx.translate(
        handX,
        handY
    );

    ctx.rotate(angle);

    // Red apple peel
    ctx.fillStyle = "#ed4040";

    ctx.beginPath();
    ctx.moveTo(6, -12);

    ctx.quadraticCurveTo(
        42,
        -19,
        48,
        0
    );

    ctx.quadraticCurveTo(
        42,
        19,
        6,
        12
    );

    ctx.closePath();
    ctx.fill();

    // Cream apple flesh
    ctx.fillStyle = "#fff0bc";

    ctx.beginPath();
    ctx.moveTo(10, -9);

    ctx.quadraticCurveTo(
        37,
        -12,
        43,
        0
    );

    ctx.quadraticCurveTo(
        37,
        12,
        10,
        9
    );

    ctx.closePath();
    ctx.fill();

    // Seed
    ctx.fillStyle = "#633b20";

    ctx.beginPath();

    ctx.ellipse(
        24,
        0,
        5,
        2.5,
        0,
        0,
        Math.PI * 2
    );

    ctx.fill();

    ctx.restore();
}

// =====================================================
// DRAW APPLE POWERUPS
// =====================================================

function drawPowerup(powerup) {
    const colors = {
        health: "#ff4545",
        dash: "#49c9ff",
        greenFireball: "#36e55a",
        spike: "#bc72ff"
    };

    const letters = {
        health: "+",
        dash: "G",
        greenFireball: "F",
        spike: "E"
    };

    const size = 25;

    drawApple(
        powerup.x - size / 2,
        powerup.y - size / 2,
        size,
        colors[powerup.type] || "#ff4545"
    );

    ctx.save();

    ctx.font = "bold 16px Arial";
    ctx.textAlign = "center";

    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#333333";
    ctx.lineWidth = 3;

    const letter =
        letters[powerup.type] || "?";

    ctx.strokeText(
        letter,
        powerup.x,
        powerup.y + 6
    );

    ctx.fillText(
        letter,
        powerup.x,
        powerup.y + 6
    );

    ctx.restore();
}

// =====================================================
// DRAW APPLE CORE SPIKES
// =====================================================

function drawActiveSpikes() {
    const now = Date.now();

    for (const id in activeSpikes) {
        const spike = activeSpikes[id];

        if (
            !spike ||
            (
                spike.expiresAt &&
                now >= spike.expiresAt
            )
        ) {
            continue;
        }

        ctx.save();

        const color =
            spike.ownerId === myId
                ? "#b66bff"
                : "#ff5555";

        for (
            let x = spike.x + 8;
            x < spike.x + spike.width - 5;
            x += 22
        ) {
            // Pointed apple core
            ctx.fillStyle = color;

            ctx.beginPath();

            ctx.moveTo(
                x - 8,
                spike.y
            );

            ctx.lineTo(
                x,
                spike.y - 20
            );

            ctx.lineTo(
                x + 8,
                spike.y
            );

            ctx.closePath();
            ctx.fill();

            // Dark seed
            ctx.fillStyle = "#3c261a";

            ctx.beginPath();

            ctx.arc(
                x,
                spike.y - 6,
                2,
                0,
                Math.PI * 2
            );

            ctx.fill();
        }

        ctx.restore();
    }
}

// =====================================================
// DRAW HEARTS
// =====================================================

function drawHearts(x, y, health, maxHealth) {
    const count =
        Math.ceil(maxHealth / 2);

    ctx.font = "22px Arial";

    for (let i = 0; i < count; i++) {
        const row = Math.floor(i / 10);
        const column = i % 10;

        const amount =
            health - i * 2;

        ctx.fillStyle =
            amount >= 2
                ? "#ff3030"
                : amount === 1
                    ? "#ff9f1c"
                    : "#666666";

        ctx.fillText(
            amount > 0 ? "♥" : "♡",
            x + column * 23,
            y + row * 23
        );
    }
}

// =====================================================
// DRAW FLYING RED AND GREEN APPLES
// =====================================================

function drawFlyingApple(fireball) {
    const size =
        fireball.radius * 2 + 5;

    const color =
        fireball.type === "green"
            ? "#36e55a"
            : "#f44336";

    drawApple(
        fireball.x - size / 2,
        fireball.y - size / 2,
        size,
        color,
        false
    );
}

// =====================================================
// FIREBALL CHARGE HUD
// =====================================================

function drawFireballChargeMeter() {
    const me = players[myId];

    if (
        !spaceHeld ||
        !me ||
        me.dead
    ) {
        return;
    }

    const charge = Math.min(
        (
            Date.now() -
            spacePressedAt
        ) / FIREBALL_CHARGE_TIME,
        1
    );

    const width = 280;
    const x =
        canvas.width / 2 - width / 2;

    const y = 45;

    ctx.fillStyle = "rgba(0,0,0,0.82)";
    ctx.fillRect(x, y, width, 58);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 14px Arial";
    ctx.textAlign = "center";

    ctx.fillText(
        charge >= 1
            ? "RED APPLE READY!"
            : "CHARGING RED APPLE",
        canvas.width / 2,
        y + 18
    );

    ctx.fillStyle = "#333333";
    ctx.fillRect(
        x + 15,
        y + 27,
        width - 30,
        15
    );

    ctx.fillStyle =
        charge >= 1
            ? "#ff4040"
            : "#ffd60a";

    ctx.fillRect(
        x + 15,
        y + 27,
        (width - 30) * charge,
        15
    );

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;

    ctx.strokeRect(
        x + 15,
        y + 27,
        width - 30,
        15
    );

    ctx.fillStyle = "#ffffff";
    ctx.font = "11px Arial";

    ctx.fillText(
        charge >= 1
            ? "Release SPACE to throw!"
            : Math.round(charge * 100) + "%",
        canvas.width / 2,
        y + 54
    );

    ctx.textAlign = "left";
}

// =====================================================
// GOLD PLATFORM HUD
// =====================================================

function drawGoldStatus() {
    if (goldControllerId !== myId) {
        return;
    }

    const width = 280;

    const x =
        canvas.width / 2 - width / 2;

    const y = 115;

    ctx.fillStyle = "rgba(0,0,0,0.82)";
    ctx.fillRect(x, y, width, 58);

    ctx.fillStyle = "#ffd700";
    ctx.font = "bold 14px Arial";
    ctx.textAlign = "center";

    ctx.fillText(
        "GOLDEN APPLE BRANCH",
        canvas.width / 2,
        y + 18
    );

    ctx.fillStyle = "#333333";

    ctx.fillRect(
        x + 15,
        y + 27,
        width - 30,
        15
    );

    ctx.fillStyle = "#ffd700";

    ctx.fillRect(
        x + 15,
        y + 27,
        (width - 30) * goldProgress,
        15
    );

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;

    ctx.strokeRect(
        x + 15,
        y + 27,
        width - 30,
        15
    );

    ctx.fillStyle = "#ffffff";
    ctx.font = "11px Arial";

    ctx.fillText(
        goldRemaining.toFixed(1) +
            " seconds",
        canvas.width / 2,
        y + 54
    );

    ctx.textAlign = "left";
}

// =====================================================
// POWERUP HUD
// =====================================================

function drawPowerupHud(me) {
    if (!me || me.dead) return;

    const x = canvas.width - 262;
    const y = 10;

    ctx.fillStyle = "rgba(0,0,0,0.76)";
    ctx.fillRect(x, y, 250, 180);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 14px Arial";

    ctx.fillText(
        "APPLE POWERUPS",
        x + 15,
        y + 21
    );

    const bonusHearts = Math.max(
        0,
        (
            (
                me.maxHealth ||
                BASE_MAX_HEALTH
            ) - BASE_MAX_HEALTH
        ) / 2
    );

    ctx.font = "12px Arial";

    ctx.fillStyle = "#ff6b63";

    ctx.fillText(
        "Health: +" +
            bonusHearts +
            " hearts",
        x + 15,
        y + 45
    );

    ctx.fillStyle = "#4fd5ff";

    if (me.dashLevel > 0) {
        const remaining = Math.max(
            0,
            getDashCooldown(me) -
                (
                    Date.now() -
                    lastDashTime
                )
        );

        const status =
            remaining <= 0
                ? "READY"
                : (
                    remaining / 1000
                ).toFixed(1) + "s";

        ctx.fillText(
            "Dash Lv " +
                me.dashLevel +
                ": " +
                status,
            x + 15,
            y + 68
        );

        ctx.fillText(
            "Dash distance: " +
                getDashDistancePercent(me) +
                "%",
            x + 15,
            y + 88
        );
    } else {
        ctx.fillText(
            "Dash: locked",
            x + 15,
            y + 68
        );

        ctx.fillText(
            "Dash distance: locked",
            x + 15,
            y + 88
        );
    }

    ctx.fillStyle = "#32ff5a";

    if (me.greenLevel > 0) {
        const remaining = Math.max(
            0,
            getGreenCooldown(me) -
                (
                    Date.now() -
                    lastGreenFireballTime
                )
        );

        ctx.fillText(
            "Green Apple Lv " +
                me.greenLevel +
                ": " +
                (
                    remaining <= 0
                        ? "READY"
                        : (
                            remaining / 1000
                        ).toFixed(1) + "s"
                ),
            x + 15,
            y + 112
        );
    } else {
        ctx.fillText(
            "Green Apple: locked",
            x + 15,
            y + 112
        );
    }

    ctx.fillStyle = "#a970ff";

    if (me.spikeLevel > 0) {
        const active =
            Object.values(activeSpikes).find(
                spike =>
                    spike.ownerId === myId &&
                    (
                        !spike.expiresAt ||
                        spike.expiresAt > Date.now()
                    )
            );

        let status;

        if (active) {
            status =
                "ACTIVE " +
                (
                    Math.max(
                        0,
                        active.expiresAt -
                            Date.now()
                    ) / 1000
                ).toFixed(1) +
                "s";
        } else {
            const remaining = Math.max(
                0,
                (
                    me.spikeReadyAt || 0
                ) - Date.now()
            );

            status =
                remaining <= 0
                    ? "READY - E"
                    : (
                        remaining / 1000
                    ).toFixed(1) + "s";
        }

        ctx.fillText(
            "Apple Spikes: " + status,
            x + 15,
            y + 136
        );
    } else {
        ctx.fillText(
            "Apple Spikes: locked",
            x + 15,
            y + 136
        );
    }

    ctx.fillStyle = "#ffd700";

    ctx.fillText(
        "Golden apple: 15 sec reward",
        x + 15,
        y + 160
    );
}

// =====================================================
// DRAW PLAYERS AS CARTOON APPLES
// =====================================================

function drawPlayer(id, player) {
    if (!player) return;

    ctx.save();

    ctx.globalAlpha =
        player.dead ? 0.25 : 1;

    drawApple(
        player.x,
        player.y,
        PLAYER_SIZE,
        player.color || "#ff4545",
        true,
        player.facing || 1
    );

    ctx.restore();

    // Nickname
    ctx.save();

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 12px Arial";
    ctx.textAlign = "center";

    const label =
        id === myId
            ? "YOU"
            : (
                player.nickname ||
                "PLAYER"
            );

    ctx.fillText(
        label,
        player.x + PLAYER_SIZE / 2,
        player.y - 10
    );

    ctx.restore();

    // Health bar
    const maxHealth =
        player.maxHealth ||
        BASE_MAX_HEALTH;

    const health =
        player.health ?? maxHealth;

    ctx.fillStyle = "#333333";

    ctx.fillRect(
        player.x,
        player.y - 5,
        PLAYER_SIZE,
        3
    );

    ctx.fillStyle =
        health > maxHealth * 0.3
            ? "#32d74b"
            : "#ff453a";

    ctx.fillRect(
        player.x,
        player.y - 5,

        PLAYER_SIZE *
            Math.max(
                0,
                health / maxHealth
            ),

        3
    );

    // Apple slice sword
    if (
        meleeSwings[id] &&
        !(player.greenLevel > 0)
    ) {
        const elapsed =
            Date.now() -
            meleeSwings[id].start;

        if (elapsed <= SWORD_SWING_TIME) {
            drawSword(
                player,
                meleeSwings[id]
            );
        } else {
            delete meleeSwings[id];
        }
    }
}

// =====================================================
// DRAW GAME
// =====================================================

function draw() {
    // Original dark background
    ctx.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
    );

    ctx.fillStyle = "#11111b";

    ctx.fillRect(
        0,
        0,
        canvas.width,
        canvas.height
    );

    // Apple tree branch platforms
    for (const platform of platforms) {
        drawBranch(platform);
    }

    // Apple core spikes
    drawActiveSpikes();

    // Apple powerups
    for (const id in powerups) {
        drawPowerup(powerups[id]);
    }

    // Cartoon apple players
    for (const id in players) {
        drawPlayer(
            id,
            players[id]
        );
    }

    // Flying red and green apples
    for (const fireball of fireballs) {
        drawFlyingApple(fireball);
    }

    const me = players[myId];

    // Health HUD
    if (me) {
        const maxHealth =
            me.maxHealth ||
            BASE_MAX_HEALTH;

        const health =
            me.health ?? maxHealth;

        ctx.fillStyle =
            "rgba(0,0,0,0.76)";

        ctx.fillRect(
            12,
            10,
            295,
            165
        );

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 16px Arial";

        ctx.fillText(
            "YOUR HEALTH",
            25,
            32
        );

        drawHearts(
            25,
            59,
            health,
            maxHealth
        );

        ctx.fillStyle = "#bbbbbb";
        ctx.font = "12px Arial";

        ctx.fillText(
            "F = Apple Slice / Green Apple",
            25,
            116
        );

        ctx.fillText(
            "G = Dash | E = Apple Spikes",
            25,
            134
        );

        ctx.fillText(
            "DOWN = Drop through branch",
            25,
            152
        );
    }

    drawPowerupHud(me);
    drawFireballChargeMeter();
    drawGoldStatus();

    // Gold reward message
    if (
        Date.now() <
        goldRewardMessageUntil
    ) {
        ctx.fillStyle =
            "rgba(0,0,0,0.85)";

        ctx.fillRect(
            canvas.width / 2 - 190,
            canvas.height / 2 - 40,
            380,
            80
        );

        ctx.fillStyle = "#ffd700";
        ctx.font = "bold 24px Arial";
        ctx.textAlign = "center";

        ctx.fillText(
            goldRewardMessage,
            canvas.width / 2,
            canvas.height / 2 + 8
        );

        ctx.textAlign = "left";
    }

    // Map change message
    if (
        Date.now() <
        mapChangeMessageUntil
    ) {
        ctx.fillStyle =
            "rgba(0,0,0,0.82)";

        ctx.fillRect(
            canvas.width / 2 - 190,
            canvas.height / 2 - 40,
            380,
            80
        );

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 24px Arial";
        ctx.textAlign = "center";

        ctx.fillText(
            mapIsLarge
                ? "6+ PLAYERS - MAP EXPANDED!"
                : "MAP SHRUNK!",
            canvas.width / 2,
            canvas.height / 2 + 8
        );

        ctx.textAlign = "left";
    }

    // New branch layout
    if (
        Date.now() <
        platformMessageUntil
    ) {
        ctx.fillStyle =
            "rgba(0,0,0,0.8)";

        ctx.fillRect(
            canvas.width / 2 - 160,
            canvas.height / 2 - 30,
            320,
            60
        );

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 22px Arial";
        ctx.textAlign = "center";

        ctx.fillText(
            "NEW APPLE TREE BRANCHES!",
            canvas.width / 2,
            canvas.height / 2 + 7
        );

        ctx.textAlign = "left";
    }

    // Death and respawn screen
    if (me && me.dead) {
        ctx.fillStyle =
            "rgba(0,0,0,0.72)";

        ctx.fillRect(
            0,
            0,
            canvas.width,
            canvas.height
        );

        ctx.fillStyle = "#ff453a";
        ctx.font = "bold 52px Arial";
        ctx.textAlign = "center";

        ctx.fillText(
            "SQUISHED APPLE!",
            canvas.width / 2,
            canvas.height / 2 - 70
        );

        ctx.fillStyle = "#ffffff";
        ctx.font = "18px Arial";

        ctx.fillText(
            "You lost all powerups.",
            canvas.width / 2,
            canvas.height / 2 - 35
        );

        const remainingMs = Math.max(
            0,
            (
                me.respawnAllowedAt || 0
            ) - Date.now()
        );

        const seconds = Math.ceil(
            remainingMs / 1000
        );

        respawnButton = {
            x: canvas.width / 2 - 105,
            y: canvas.height / 2,
            width: 210,
            height: 58,
            enabled: remainingMs <= 0
        };

        ctx.fillStyle =
            respawnButton.enabled
                ? "#32d74b"
                : "#666666";

        ctx.fillRect(
            respawnButton.x,
            respawnButton.y,
            respawnButton.width,
            respawnButton.height
        );

        ctx.fillStyle =
            respawnButton.enabled
                ? "#000000"
                : "#dddddd";

        ctx.font = "bold 20px Arial";

        ctx.fillText(
            respawnButton.enabled
                ? "RESPAWN"
                : "RESPAWN IN " + seconds,
            canvas.width / 2,
            respawnButton.y + 36
        );

        ctx.font = "14px Arial";
        ctx.fillStyle = "#ffffff";

        ctx.fillText(
            "Your dropped powerup stays on the map.",
            canvas.width / 2,
            respawnButton.y + 88
        );

        ctx.textAlign = "left";
    } else {
        respawnButton = null;
    }
}

// =====================================================
// RESPAWN BUTTON
// =====================================================

canvas.addEventListener("click", event => {
    const me = players[myId];

    if (
        !me ||
        !me.dead ||
        !respawnButton ||
        !respawnButton.enabled
    ) {
        return;
    }

    const rect =
        canvas.getBoundingClientRect();

    const mouseX =
        (
            event.clientX -
            rect.left
        ) *
        (
            canvas.width /
            rect.width
        );

    const mouseY =
        (
            event.clientY -
            rect.top
        ) *
        (
            canvas.height /
            rect.height
        );

    if (
        mouseX >= respawnButton.x &&
        mouseX <=
            respawnButton.x +
            respawnButton.width &&

        mouseY >= respawnButton.y &&
        mouseY <=
            respawnButton.y +
            respawnButton.height
    ) {
        socket.emit("respawnPlayer");
    }
});

// =====================================================
// GAME LOOP
// =====================================================

function gameLoop() {
    updatePlayer();
    updateFireballs();
    updatePowerupPickup();
    draw();

    requestAnimationFrame(gameLoop);
}

gameLoop();

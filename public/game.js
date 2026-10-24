
const socket = io();
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// =====================================================
// BLOCK BATTLE - GAME.JS
// ORIGINAL GRAPHICS + HUD OUTSIDE PLAYING AREA
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
// OUTSIDE HUD LAYOUT
// =====================================================

const hudStyle = document.createElement("style");

hudStyle.textContent = `
#appleBattleLayout {
    display: grid;
    grid-template-columns: 295px minmax(0, auto) 250px;
    grid-template-areas: "health center powerups";
    gap: 12px;
    align-items: start;
    justify-content: center;
    width: max-content;
    max-width: 100%;
    margin: 12px auto;
}

#appleHealthPanel {
    grid-area: health;
    width: 295px;
    height: 165px;
    display: block;
}

#applePowerupPanel {
    grid-area: powerups;
    width: 250px;
    height: 180px;
    display: block;
}

#appleCenterColumn {
    grid-area: center;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
}

#appleChargePanel {
    display: block;
    width: 580px;
    max-width: 100%;
    height: 150px;
}

#appleCenterColumn #gameCanvas {
    display: block;
    max-width: none;
}

@media (max-width: 1150px) {
    #appleBattleLayout {
        display: flex;
        flex-wrap: wrap;
        width: 100%;
    }

    #appleCenterColumn {
        order: 1;
        width: 100%;
        overflow-x: auto;
    }

    #appleHealthPanel {
        order: 2;
    }

    #applePowerupPanel {
        order: 3;
    }
}
`;

document.head.appendChild(hudStyle);

const appleLayout = document.createElement("div");
appleLayout.id = "appleBattleLayout";

const appleCenterColumn = document.createElement("div");
appleCenterColumn.id = "appleCenterColumn";

const healthCanvas = document.createElement("canvas");
healthCanvas.id = "appleHealthPanel";
healthCanvas.width = 295;
healthCanvas.height = 165;

const powerupCanvas = document.createElement("canvas");
powerupCanvas.id = "applePowerupPanel";
powerupCanvas.width = 250;
powerupCanvas.height = 180;

const chargeCanvas = document.createElement("canvas");
chargeCanvas.id = "appleChargePanel";
chargeCanvas.width = 580;
chargeCanvas.height = 150;

const healthCtx = healthCanvas.getContext("2d");
const powerupCtx = powerupCanvas.getContext("2d");
const chargeCtx = chargeCanvas.getContext("2d");

const originalCanvasParent = canvas.parentNode;

originalCanvasParent.insertBefore(
    appleLayout,
    canvas
);

appleLayout.appendChild(healthCanvas);
appleLayout.appendChild(appleCenterColumn);
appleLayout.appendChild(powerupCanvas);

appleCenterColumn.appendChild(chargeCanvas);
appleCenterColumn.appendChild(canvas);

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
            nicknameStatus.textContent = "Enter a nickname.";
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
    nicknameButton.addEventListener("click", saveNickname);
}

socket.on("nicknameChanged", data => {
    if (data && players[data.id]) {
        players[data.id].nickname = data.nickname;
    }
});

// =====================================================
// HELPERS
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

function normalizePlayer(player) {
    if (!player) return player;

    player.dashLevel = player.dashLevel || 0;
    player.greenLevel = player.greenLevel || 0;
    player.spikeLevel = player.spikeLevel || 0;
    player.spikeReadyAt = player.spikeReadyAt || 0;
    player.maxHealth = player.maxHealth || BASE_MAX_HEALTH;
    player.health = player.health ?? player.maxHealth;
    player.facing = player.facing || 1;
    player.nickname = player.nickname || "PLAYER";

    return player;
}

// =====================================================
// SOCKET EVENTS
// =====================================================

socket.on("connect", () => {
    myId = socket.id;
    socket.emit("setNickname", myNickname);
});

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
        greenFireball: "GREEN FIREBALL",
        spike: "SPIKES"
    };

    goldRewardMessage =
        "GOLD REWARD: " +
        (names[data.type] || "POWERUP") +
        "!";

    goldRewardMessageUntil = Date.now() + 3500;
});

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

socket.on("currentPlayers", serverPlayers => {
    players = serverPlayers || {};

    for (const id in players) {
        normalizePlayer(players[id]);
    }

    const me = players[myId];

    if (me) facing = me.facing || 1;
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
        player.respawnAllowedAt = data.respawnAllowedAt;
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

    player.health = data.health ?? player.health;
    player.maxHealth = data.maxHealth ?? player.maxHealth;
    player.dashLevel = data.dashLevel ?? player.dashLevel ?? 0;
    player.greenLevel = data.greenLevel ?? player.greenLevel ?? 0;
    player.spikeLevel = data.spikeLevel ?? player.spikeLevel ?? 0;
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

socket.on("receiveKnockback", data => {
    const me = players[myId];
    if (!me || me.dead) return;

    velocityX += data.velocityX;
    velocityY += data.velocityY;
    onGround = false;
});

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
// DROP THROUGH PLATFORMS
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

        if (!overlaps || !standingOn || isGround) {
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

    if (event.code === "ArrowDown" && !event.repeat) {
        dropThroughCurrentPlatform();
    }

    if (event.code === "Space" && !spaceHeld) {
        spaceHeld = true;
        spacePressedAt = Date.now();
    }

    if (event.code === "KeyF" && !event.repeat) {
        performFAction();
    }

    if (event.code === "KeyG" && !event.repeat) {
        performDash();
    }

    if (event.code === "KeyE" && !event.repeat) {
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

    const heldTime = Date.now() - spacePressedAt;

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

    if (!me || me.dead || !me.dashLevel) return;

    if (
        Date.now() - lastDashTime <
        getDashCooldown(me)
    ) {
        return;
    }

    const power = getDashPower(me);
    const left = leftHeld();
    const right = rightHeld();

    if (jumpHeld() && !left && !right) {
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
        Math.min(canvas.width - PLAYER_SIZE, me.x)
    );

    socket.emit("playerMove", {
        x: me.x,
        y: me.y,
        facing
    });
}

// =====================================================
// SPIKES
// =====================================================

function activateSpikes() {
    const me = players[myId];

    if (!me || me.dead || !me.spikeLevel) return;

    if (Date.now() < (me.spikeReadyAt || 0)) return;

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

    if (!me || me.dead || me.greenLevel > 0) return;

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
            facing === 1 ? dx >= 0 : dx <= 0;

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
            velocityX: facing * MELEE_KNOCKBACK
        });
    }
}

// =====================================================
// RED FIREBALL
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
        velocityX: facing * FIREBALL_SPEED,
        velocityY: 0,
        radius: 10
    };

    fireballs.push(fireball);
    socket.emit("shootFireball", fireball);
}

// =====================================================
// GREEN FIREBALL
// =====================================================

function shootGreenFireball() {
    const me = players[myId];

    if (!me || me.dead || !me.greenLevel) return;

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
            const length = Math.hypot(dx, dy) || 1;

            vx = dx / length * FIREBALL_SPEED;
            vy = dy / length * FIREBALL_SPEED;
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
    socket.emit("shootGreenFireball", fireball);
}

// =====================================================
// FIREBALL UPDATES
// =====================================================

function updateFireballs() {
    for (let i = fireballs.length - 1; i >= 0; i--) {
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

        if (fireball.ownerId !== myId) continue;

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
                        fireball.velocityX < 0 ? -1 : 1
                });
            } else {
                socket.emit("fireballHit", {
                    targetId: id
                });

                socket.emit("knockbackPlayer", {
                    targetId: id,
                    velocityX:
                        (fireball.velocityX >= 0 ? 1 : -1) *
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

    const centerX = me.x + PLAYER_SIZE / 2;
    const centerY = me.y + PLAYER_SIZE / 2;

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
            const last = powerupPickupAttempts[id] || 0;

            if (Date.now() - last > 500) {
                powerupPickupAttempts[id] = Date.now();
                socket.emit("pickupPowerup", id);
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

    if (leftHeld() && !rightHeld()) {
        velocityX = -MOVE_SPEED;
        facing = -1;
    } else if (rightHeld() && !leftHeld()) {
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
        Math.min(canvas.width - PLAYER_SIZE, me.x)
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

            if (overlapsX && crossedTop && !ignored) {
                me.y = platform.y - PLAYER_SIZE;
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
                Math.min(300, canvas.width - 200)
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
// ORIGINAL GRAPHICS
// =====================================================

function drawEye(player) {
    const direction = player.facing === -1 ? -1 : 1;

    const eyeX = direction === 1
        ? player.x + PLAYER_SIZE - 9
        : player.x + 4;

    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.roundRect(eyeX, player.y + 7, 5, 13, 3);
    ctx.fill();
}

function drawPlatform(platform) {
    ctx.fillStyle =
        platform.isGold ? "#ffd700" : "#dddddd";

    ctx.fillRect(
        platform.x,
        platform.y,
        platform.width,
        platform.height
    );

    if (platform.isGold) {
        ctx.strokeStyle = "#fff4a3";
        ctx.lineWidth = 3;

        ctx.strokeRect(
            platform.x,
            platform.y,
            platform.width,
            platform.height
        );
    }
}

// =====================================================
// SWORD
// =====================================================

function drawSword(player, swing) {
    const elapsed = Date.now() - swing.start;
    if (elapsed > SWORD_SWING_TIME) return;

    const progress = elapsed / SWORD_SWING_TIME;

    const startAngle =
        swing.facing === 1 ? -1.1 : Math.PI + 1.1;

    const endAngle =
        swing.facing === 1 ? 0.8 : Math.PI - 0.8;

    const angle =
        startAngle + (endAngle - startAngle) * progress;

    const handX = player.x + PLAYER_SIZE / 2;
    const handY = player.y + PLAYER_SIZE / 2;

    const handleX = handX + Math.cos(angle) * 8;
    const handleY = handY + Math.sin(angle) * 8;

    const tipX = handX + Math.cos(angle) * 46;
    const tipY = handY + Math.sin(angle) * 46;

    ctx.strokeStyle = "#8b5a2b";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(handX, handY);
    ctx.lineTo(handleX, handleY);
    ctx.stroke();

    ctx.strokeStyle = "#e8edf2";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(handleX, handleY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(handleX, handleY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
}

// =====================================================
// POWERUPS
// =====================================================

function drawPowerup(powerup) {
    const colors = {
        health: "#ff3b30",
        dash: "#4fd5ff",
        greenFireball: "#32ff5a",
        spike: "#a970ff"
    };

    const letters = {
        health: "+",
        dash: "G",
        greenFireball: "F",
        spike: "E"
    };

    ctx.beginPath();
    ctx.arc(
        powerup.x,
        powerup.y,
        POWERUP_RADIUS,
        0,
        Math.PI * 2
    );

    ctx.fillStyle = colors[powerup.type] || "#32ff5a";
    ctx.fill();

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 15px Arial";
    ctx.textAlign = "center";

    ctx.fillText(
        letters[powerup.type] || "F",
        powerup.x,
        powerup.y + 5
    );

    ctx.textAlign = "left";
}

// =====================================================
// SPIKES
// =====================================================

function drawActiveSpikes() {
    const now = Date.now();

    for (const id in activeSpikes) {
        const spike = activeSpikes[id];

        if (
            !spike ||
            (spike.expiresAt && now >= spike.expiresAt)
        ) {
            continue;
        }

        ctx.fillStyle =
            spike.ownerId === myId
                ? "#a970ff"
                : "#ff5c7a";

        for (
            let x = spike.x;
            x < spike.x + spike.width;
            x += 18
        ) {
            const right = Math.min(
                x + 18,
                spike.x + spike.width
            );

            const middle = (x + right) / 2;

            ctx.beginPath();
            ctx.moveTo(x, spike.y);
            ctx.lineTo(middle, spike.y - 18);
            ctx.lineTo(right, spike.y);
            ctx.closePath();
            ctx.fill();
        }
    }
}

// =====================================================
// FIREBALLS
// =====================================================

function drawFireball(fireball) {
    ctx.beginPath();

    ctx.arc(
        fireball.x,
        fireball.y,
        fireball.radius,
        0,
        Math.PI * 2
    );

    ctx.fillStyle =
        fireball.type === "green"
            ? "#00ff55"
            : "#ff7b00";

    ctx.fill();

    ctx.beginPath();

    ctx.arc(
        fireball.x,
        fireball.y,
        Math.max(3, fireball.radius / 2),
        0,
        Math.PI * 2
    );

    ctx.fillStyle =
        fireball.type === "green"
            ? "#c8ff00"
            : "#ffe600";

    ctx.fill();
}

// =====================================================
// CUBE PLAYERS
// =====================================================

function drawPlayer(id, player) {
    if (!player) return;

    ctx.save();
    ctx.globalAlpha = player.dead ? 0.25 : 1;

    ctx.fillStyle = player.color || "#ffffff";
    ctx.fillRect(player.x, player.y, PLAYER_SIZE, PLAYER_SIZE);
    drawEye(player);

    ctx.restore();

    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 12px Arial";
    ctx.textAlign = "center";

    const label =
        id === myId
            ? "YOU"
            : player.nickname || "PLAYER";

    ctx.fillText(
        label,
        player.x + PLAYER_SIZE / 2,
        player.y - 10
    );

    ctx.restore();

    const maxHealth =
        player.maxHealth || BASE_MAX_HEALTH;

    const health =
        player.health ?? maxHealth;

    ctx.fillStyle = "#333333";
    ctx.fillRect(player.x, player.y - 5, PLAYER_SIZE, 3);

    ctx.fillStyle =
        health > maxHealth * 0.3
            ? "#32d74b"
            : "#ff453a";

    ctx.fillRect(
        player.x,
        player.y - 5,
        PLAYER_SIZE * Math.max(0, health / maxHealth),
        3
    );

    if (meleeSwings[id] && !(player.greenLevel > 0)) {
        const elapsed =
            Date.now() - meleeSwings[id].start;

        if (elapsed <= SWORD_SWING_TIME) {
            drawSword(player, meleeSwings[id]);
        } else {
            delete meleeSwings[id];
        }
    }
}

// =====================================================
// LEFT PANEL: HEALTH AND CONTROLS
// =====================================================

function drawHealthPanel() {
    healthCtx.clearRect(0, 0, 295, 165);

    const me = players[myId];
    if (!me) return;

    healthCtx.fillStyle = "rgba(0,0,0,0.76)";
    healthCtx.fillRect(0, 0, 295, 165);

    healthCtx.fillStyle = "#ffffff";
    healthCtx.font = "bold 16px Arial";
    healthCtx.fillText("YOUR HEALTH", 13, 22);

    const maxHealth =
        me.maxHealth || BASE_MAX_HEALTH;

    const health =
        me.health ?? maxHealth;

    const count = Math.ceil(maxHealth / 2);

    healthCtx.font = "22px Arial";

    for (let i = 0; i < count; i++) {
        const row = Math.floor(i / 10);
        const column = i % 10;
        const amount = health - i * 2;

        healthCtx.fillStyle =
            amount >= 2
                ? "#ff3030"
                : amount === 1
                    ? "#ff9f1c"
                    : "#666666";

        healthCtx.fillText(
            amount > 0 ? "♥" : "♡",
            13 + column * 23,
            49 + row * 23
        );
    }

    healthCtx.fillStyle = "#bbbbbb";
    healthCtx.font = "12px Arial";

    healthCtx.fillText(
        "F = Sword / Green Fireball",
        13,
        106
    );

    healthCtx.fillText(
        "G = Dash | E = Spikes",
        13,
        124
    );

    healthCtx.fillText(
        "DOWN = Drop through platform",
        13,
        142
    );
}

// =====================================================
// RIGHT PANEL: POWERUPS
// =====================================================

function drawPowerupPanel() {
    powerupCtx.clearRect(0, 0, 250, 180);

    const me = players[myId];
    if (!me || me.dead) return;

    powerupCtx.fillStyle = "rgba(0,0,0,0.76)";
    powerupCtx.fillRect(0, 0, 250, 180);

    powerupCtx.fillStyle = "#ffffff";
    powerupCtx.font = "bold 14px Arial";
    powerupCtx.fillText("POWERUPS", 15, 21);

    const bonusHearts = Math.max(
        0,
        (
            (me.maxHealth || BASE_MAX_HEALTH) -
            BASE_MAX_HEALTH
        ) / 2
    );

    powerupCtx.font = "12px Arial";
    powerupCtx.fillStyle = "#ff6b63";

    powerupCtx.fillText(
        "Health: +" + bonusHearts + " hearts",
        15,
        45
    );

    powerupCtx.fillStyle = "#4fd5ff";

    if (me.dashLevel > 0) {
        const remaining = Math.max(
            0,
            getDashCooldown(me) -
                (Date.now() - lastDashTime)
        );

        powerupCtx.fillText(
            "Dash Lv " +
                me.dashLevel +
                ": " +
                (
                    remaining <= 0
                        ? "READY"
                        : (remaining / 1000).toFixed(1) + "s"
                ),
            15,
            68
        );

        powerupCtx.fillText(
            "Dash distance: " +
                getDashDistancePercent(me) +
                "%",
            15,
            88
        );
    } else {
        powerupCtx.fillText("Dash: locked", 15, 68);
        powerupCtx.fillText("Dash distance: locked", 15, 88);
    }

    powerupCtx.fillStyle = "#32ff5a";

    if (me.greenLevel > 0) {
        const remaining = Math.max(
            0,
            getGreenCooldown(me) -
                (Date.now() - lastGreenFireballTime)
        );

        powerupCtx.fillText(
            "Green Fireball Lv " +
                me.greenLevel +
                ": " +
                (
                    remaining <= 0
                        ? "READY"
                        : (remaining / 1000).toFixed(1) + "s"
                ),
            15,
            112
        );
    } else {
        powerupCtx.fillText(
            "Green Fireball: locked",
            15,
            112
        );
    }

    powerupCtx.fillStyle = "#a970ff";

    if (me.spikeLevel > 0) {
        const active = Object.values(activeSpikes).find(
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
                        active.expiresAt - Date.now()
                    ) / 1000
                ).toFixed(1) +
                "s";
        } else {
            const remaining = Math.max(
                0,
                (me.spikeReadyAt || 0) - Date.now()
            );

            status =
                remaining <= 0
                    ? "READY - E"
                    : (remaining / 1000).toFixed(1) + "s";
        }

        powerupCtx.fillText(
            "Spikes: " + status,
            15,
            136
        );
    } else {
        powerupCtx.fillText(
            "Spikes: locked",
            15,
            136
        );
    }

    powerupCtx.fillStyle = "#ffd700";

    powerupCtx.fillText(
        "Gold platform: 15 sec reward",
        15,
        160
    );
}

// =====================================================
// TOP PANEL: CHARGING BARS
// =====================================================

function drawChargingBars() {
    chargeCtx.clearRect(0, 0, 580, 150);

    const me = players[myId];
    if (!me || me.dead) return;

    const width = 280;
    const x = 150;

    // Red fireball charge
    if (spaceHeld) {
        const charge = Math.min(
            (Date.now() - spacePressedAt) /
                FIREBALL_CHARGE_TIME,
            1
        );

        const y = 5;

        chargeCtx.fillStyle = "rgba(0,0,0,0.82)";
        chargeCtx.fillRect(x, y, width, 58);

        chargeCtx.fillStyle = "#ffffff";
        chargeCtx.font = "bold 14px Arial";
        chargeCtx.textAlign = "center";

        chargeCtx.fillText(
            charge >= 1
                ? "FIREBALL READY!"
                : "CHARGING FIREBALL",
            290,
            y + 18
        );

        chargeCtx.fillStyle = "#333333";
        chargeCtx.fillRect(x + 15, y + 27, width - 30, 15);

        chargeCtx.fillStyle =
            charge >= 1
                ? "#ff4040"
                : "#ffd60a";

        chargeCtx.fillRect(
            x + 15,
            y + 27,
            (width - 30) * charge,
            15
        );

        chargeCtx.strokeStyle = "#ffffff";
        chargeCtx.lineWidth = 1;

        chargeCtx.strokeRect(
            x + 15,
            y + 27,
            width - 30,
            15
        );

        chargeCtx.fillStyle = "#ffffff";
        chargeCtx.font = "11px Arial";

        chargeCtx.fillText(
            charge >= 1
                ? "Release SPACE to throw!"
                : Math.round(charge * 100) + "%",
            290,
            y + 54
        );
    }

    // Gold platform progress
    if (goldControllerId === myId) {
        const y = 83;

        chargeCtx.fillStyle = "rgba(0,0,0,0.82)";
        chargeCtx.fillRect(x, y, width, 58);

        chargeCtx.fillStyle = "#ffd700";
        chargeCtx.font = "bold 14px Arial";
        chargeCtx.textAlign = "center";

        chargeCtx.fillText(
            "GOLD PLATFORM",
            290,
            y + 18
        );

        chargeCtx.fillStyle = "#333333";
        chargeCtx.fillRect(x + 15, y + 27, width - 30, 15);

        chargeCtx.fillStyle = "#ffd700";
        chargeCtx.fillRect(
            x + 15,
            y + 27,
            (width - 30) * goldProgress,
            15
        );

        chargeCtx.strokeStyle = "#ffffff";
        chargeCtx.lineWidth = 1;

        chargeCtx.strokeRect(
            x + 15,
            y + 27,
            width - 30,
            15
        );

        chargeCtx.fillStyle = "#ffffff";
        chargeCtx.font = "11px Arial";

        chargeCtx.fillText(
            goldRemaining.toFixed(1) + " seconds",
            290,
            y + 54
        );
    }

    chargeCtx.textAlign = "left";
}

// =====================================================
// GAME MESSAGES
// =====================================================

function drawCenteredMessage(text, color, width = 380) {
    const x = canvas.width / 2 - width / 2;
    const y = canvas.height / 2 - 40;

    ctx.fillStyle = "rgba(0,0,0,0.85)";
    ctx.fillRect(x, y, width, 80);

    ctx.fillStyle = color;
    ctx.font = "bold 24px Arial";
    ctx.textAlign = "center";

    ctx.fillText(
        text,
        canvas.width / 2,
        canvas.height / 2 + 8
    );

    ctx.textAlign = "left";
}

// =====================================================
// RESPAWN SCREEN
// =====================================================

function drawRespawnScreen(me) {
    ctx.fillStyle = "rgba(0,0,0,0.72)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#ff453a";
    ctx.font = "bold 52px Arial";
    ctx.textAlign = "center";

    ctx.fillText(
        "YOU DIED",
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
        (me.respawnAllowedAt || 0) - Date.now()
    );

    const seconds = Math.ceil(remainingMs / 1000);

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
}

// =====================================================
// DRAW GAME
// NO HUD BOXES INSIDE THE PLAYING AREA
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

    // Platforms
    for (const platform of platforms) {
        drawPlatform(platform);
    }

    // Spikes
    drawActiveSpikes();

    // Powerups
    for (const id in powerups) {
        drawPowerup(powerups[id]);
    }

    // Players
    for (const id in players) {
        drawPlayer(id, players[id]);
    }

    // Fireballs
    for (const fireball of fireballs) {
        drawFireball(fireball);
    }

    // Temporary game messages
    if (Date.now() < goldRewardMessageUntil) {
        drawCenteredMessage(
            goldRewardMessage,
            "#ffd700"
        );
    }

    if (Date.now() < mapChangeMessageUntil) {
        drawCenteredMessage(
            mapIsLarge
                ? "6+ PLAYERS - MAP EXPANDED!"
                : "MAP SHRUNK!",
            "#ffffff"
        );
    }

    if (Date.now() < platformMessageUntil) {
        drawCenteredMessage(
            "NEW PLATFORM LAYOUT!",
            "#ffffff"
        );
    }

    // Respawn overlay stays inside game
    const me = players[myId];

    if (me && me.dead) {
        drawRespawnScreen(me);
    } else {
        respawnButton = null;
    }

    // These draw ONLY on separate HUD canvases
    drawHealthPanel();
    drawPowerupPanel();
    drawChargingBars();
}

// =====================================================
// RESPAWN BUTTON CLICK
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

    const rect = canvas.getBoundingClientRect();

    const mouseX =
        (event.clientX - rect.left) *
        (canvas.width / rect.width);

    const mouseY =
        (event.clientY - rect.top) *
        (canvas.height / rect.height);

    if (
        mouseX >= respawnButton.x &&
        mouseX <= respawnButton.x + respawnButton.width &&
        mouseY >= respawnButton.y &&
        mouseY <= respawnButton.y + respawnButton.height
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

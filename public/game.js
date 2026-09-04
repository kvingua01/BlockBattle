const socket = io();

const canvas =
    document.getElementById("gameCanvas");

const ctx =
    canvas.getContext("2d");

// =====================================================
// GAME SETTINGS
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

const MAX_HEALTH = 20;

// =====================================================
// GAME DATA
// =====================================================

let myId = null;
let players = {};
let fireballs = [];
let meleeSwings = {};
let keys = {};

let velocityX = 0;
let velocityY = 0;

let onGround = false;
let facing = 1;

let spaceHeld = false;
let spacePressedAt = 0;

let lastMeleeTime = 0;
let respawnButton = null;

// =====================================================
// PLATFORMS
// =====================================================

const platforms = [
    { x: 0, y: 570, width: 800, height: 30 },
    { x: 80, y: 490, width: 180, height: 20 },
    { x: 350, y: 420, width: 180, height: 20 },
    { x: 100, y: 340, width: 170, height: 20 },
    { x: 430, y: 270, width: 170, height: 20 },
    { x: 180, y: 190, width: 170, height: 20 },
    { x: 450, y: 110, width: 170, height: 20 },
    { x: 280, y: 40, width: 220, height: 20 }
];

// =====================================================
// CONTROL HELPERS
// =====================================================

function leftHeld() {
    return keys["KeyA"] || keys["ArrowLeft"];
}

function rightHeld() {
    return keys["KeyD"] || keys["ArrowRight"];
}

function jumpHeld() {
    return keys["KeyW"] || keys["ArrowUp"];
}

// =====================================================
// SOCKET EVENTS
// =====================================================

socket.on("connect", () => {
    myId = socket.id;
});

socket.on("currentPlayers", (serverPlayers) => {
    players = serverPlayers;

    const me = players[myId];

    if (me) {
        facing = me.facing || 1;
    }
});

socket.on("newPlayer", (player) => {
    players[player.id] = player;
});

socket.on("playerMoved", (data) => {
    if (!players[data.id]) return;

    players[data.id].x = data.x;
    players[data.id].y = data.y;
    players[data.id].facing = data.facing || 1;
});

socket.on("playerDisconnected", (id) => {
    delete players[id];
    delete meleeSwings[id];
});

socket.on("playerHealthChanged", (data) => {
    if (!players[data.id]) return;

    players[data.id].health = data.health;
    players[data.id].dead = data.dead;

    if (data.id === myId && data.dead) {
        velocityX = 0;
        velocityY = 0;
    }
});

socket.on("playerRespawned", (data) => {
    if (!players[data.id]) {
        players[data.id] = {};
    }

    players[data.id].x = data.x;
    players[data.id].y = data.y;
    players[data.id].health = data.health;
    players[data.id].dead = false;
    players[data.id].facing = data.facing || 1;

    if (data.id === myId) {
        velocityX = 0;
        velocityY = 0;
        facing = data.facing || 1;
    }
});

socket.on("receiveKnockback", (data) => {
    const me = players[myId];

    if (!me || me.dead) return;

    velocityX += data.velocityX;
    velocityY += data.velocityY;
});

socket.on("playerMeleeSwing", (data) => {
    meleeSwings[data.id] = {
        start: Date.now(),
        facing: data.facing
    };
});

socket.on("spawnFireball", (fireball) => {
    fireballs.push(fireball);
});

socket.on("removeFireball", (data) => {
    fireballs = fireballs.filter(
        fireball => fireball.id !== data.id
    );
});

// =====================================================
// KEYBOARD
// =====================================================

document.addEventListener("keydown", (event) => {

    // Prevent arrow keys and space from scrolling page
    if (
        event.code === "ArrowLeft" ||
        event.code === "ArrowRight" ||
        event.code === "ArrowUp" ||
        event.code === "ArrowDown" ||
        event.code === "Space"
    ) {
        event.preventDefault();
    }

    keys[event.code] = true;

    const me = players[myId];

    if (!me || me.dead) return;

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
        performMeleeAttack();
    }
});

document.addEventListener("keyup", (event) => {

    if (
        event.code === "ArrowLeft" ||
        event.code === "ArrowRight" ||
        event.code === "ArrowUp" ||
        event.code === "ArrowDown" ||
        event.code === "Space"
    ) {
        event.preventDefault();
    }

    keys[event.code] = false;

    if (event.code === "Space") {

        const me = players[myId];

        if (!me || me.dead) {
            spaceHeld = false;
            return;
        }

        const heldTime =
            Date.now() - spacePressedAt;

        if (
            heldTime >=
            FIREBALL_CHARGE_TIME
        ) {
            shootFireball();
        } else {
            normalShove();
        }

        spaceHeld = false;
    }
});

// =====================================================
// NORMAL SHOVE
// =====================================================

function normalShove() {

    const me = players[myId];

    if (!me || me.dead) return;

    for (const id in players) {

        if (id === myId) continue;

        const target = players[id];

        if (!target || target.dead) continue;

        const myCenterX =
            me.x + PLAYER_SIZE / 2;

        const myCenterY =
            me.y + PLAYER_SIZE / 2;

        const targetCenterX =
            target.x + PLAYER_SIZE / 2;

        const targetCenterY =
            target.y + PLAYER_SIZE / 2;

        const dx =
            targetCenterX - myCenterX;

        const dy =
            targetCenterY - myCenterY;

        const distance =
            Math.sqrt(dx * dx + dy * dy);

        if (
            distance <=
            NORMAL_SHOVE_RANGE
        ) {
            const direction =
                dx >= 0 ? 1 : -1;

            socket.emit(
                "knockbackPlayer",
                {
                    targetId: id,
                    velocityX:
                        direction *
                        NORMAL_KNOCKBACK,
                    velocityY: -4
                }
            );
        }
    }
}

// =====================================================
// SWORD ATTACK
// =====================================================

function performMeleeAttack() {

    const me = players[myId];

    if (!me || me.dead) return;

    const now = Date.now();

    if (
        now - lastMeleeTime <
        MELEE_COOLDOWN
    ) {
        return;
    }

    lastMeleeTime = now;

    meleeSwings[myId] = {
        start: now,
        facing: facing
    };

    socket.emit(
        "meleeSwing",
        {
            facing: facing
        }
    );

    let closestTarget = null;
    let closestDistance = Infinity;

    for (const id in players) {

        if (id === myId) continue;

        const target = players[id];

        if (!target || target.dead) continue;

        const myCenterX =
            me.x + PLAYER_SIZE / 2;

        const myCenterY =
            me.y + PLAYER_SIZE / 2;

        const targetCenterX =
            target.x + PLAYER_SIZE / 2;

        const targetCenterY =
            target.y + PLAYER_SIZE / 2;

        const dx =
            targetCenterX - myCenterX;

        const dy =
            targetCenterY - myCenterY;

        const distance =
            Math.sqrt(dx * dx + dy * dy);

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

            closestTarget = {
                id: id,
                player: target
            };
        }
    }

    if (!closestTarget) return;

    socket.emit(
        "meleeHit",
        {
            targetId:
                closestTarget.id,

            velocityX:
                facing *
                MELEE_KNOCKBACK
        }
    );
}

// =====================================================
// FIREBALL
// =====================================================

function shootFireball() {

    const me = players[myId];

    if (!me || me.dead) return;

    const fireball = {
        id:
            myId +
            "-" +
            Date.now() +
            "-" +
            Math.random(),

        ownerId: myId,

        x:
            me.x +
            PLAYER_SIZE / 2,

        y:
            me.y +
            PLAYER_SIZE / 2,

        velocityX:
            facing *
            FIREBALL_SPEED,

        radius: 10
    };

    fireballs.push(fireball);

    socket.emit(
        "shootFireball",
        fireball
    );
}

// =====================================================
// UPDATE FIREBALLS
// =====================================================

function updateFireballs() {

    for (
        let i =
            fireballs.length - 1;
        i >= 0;
        i--
    ) {
        const fireball =
            fireballs[i];

        fireball.x +=
            fireball.velocityX;

        if (
            fireball.x < -100 ||
            fireball.x >
                canvas.width + 100
        ) {
            if (
                fireball.ownerId ===
                myId
            ) {
                socket.emit(
                    "removeFireball",
                    {
                        id:
                            fireball.id
                    }
                );
            }

            fireballs.splice(i, 1);

            continue;
        }

        if (
            fireball.ownerId !==
            myId
        ) {
            continue;
        }

        for (const id in players) {

            if (
                id ===
                fireball.ownerId
            ) {
                continue;
            }

            const target =
                players[id];

            if (!target || target.dead) {
                continue;
            }

            const centerX =
                target.x +
                PLAYER_SIZE / 2;

            const centerY =
                target.y +
                PLAYER_SIZE / 2;

            const dx =
                fireball.x -
                centerX;

            const dy =
                fireball.y -
                centerY;

            const distance =
                Math.sqrt(
                    dx * dx +
                    dy * dy
                );

            if (
                distance <
                fireball.radius +
                    PLAYER_SIZE / 2
            ) {
                socket.emit(
                    "fireballHit",
                    {
                        targetId: id
                    }
                );

                const direction =
                    fireball.velocityX >= 0
                        ? 1
                        : -1;

                socket.emit(
                    "knockbackPlayer",
                    {
                        targetId: id,

                        velocityX:
                            direction *
                            FIREBALL_KNOCKBACK,

                        velocityY: -10
                    }
                );

                socket.emit(
                    "removeFireball",
                    {
                        id:
                            fireball.id
                    }
                );

                fireballs.splice(i, 1);

                break;
            }
        }
    }
}

// =====================================================
// UPDATE PLAYER
// =====================================================

function updatePlayer() {

    const me = players[myId];

    if (!me) return;

    if (me.dead) {
        velocityX = 0;
        velocityY = 0;
        return;
    }

    // LEFT: A or Left Arrow
    if (
        leftHeld() &&
        !rightHeld()
    ) {
        velocityX = -MOVE_SPEED;
        facing = -1;
    }

    // RIGHT: D or Right Arrow
    else if (
        rightHeld() &&
        !leftHeld()
    ) {
        velocityX = MOVE_SPEED;
        facing = 1;
    }

    else {
        velocityX *= 0.8;

        if (
            Math.abs(velocityX) <
            0.1
        ) {
            velocityX = 0;
        }
    }

    // JUMP: W or Up Arrow
    // Holding either key keeps auto-jump.
    if (
        jumpHeld() &&
        onGround
    ) {
        velocityY =
            -JUMP_POWER;

        onGround = false;
    }

    me.x += velocityX;

    if (me.x < 0) {
        me.x = 0;
    }

    if (
        me.x >
        canvas.width -
            PLAYER_SIZE
    ) {
        me.x =
            canvas.width -
            PLAYER_SIZE;
    }

    const oldY = me.y;

    velocityY += GRAVITY;

    me.y += velocityY;

    onGround = false;

    if (velocityY >= 0) {

        for (
            const platform
            of platforms
        ) {
            const oldBottom =
                oldY +
                PLAYER_SIZE;

            const newBottom =
                me.y +
                PLAYER_SIZE;

            const overlapsX =
                me.x +
                    PLAYER_SIZE >
                    platform.x &&
                me.x <
                    platform.x +
                        platform.width;

            const crossedTop =
                oldBottom <=
                    platform.y &&
                newBottom >=
                    platform.y;

            if (
                overlapsX &&
                crossedTop
            ) {
                me.y =
                    platform.y -
                    PLAYER_SIZE;

                velocityY = 0;

                onGround = true;

                break;
            }
        }
    }

    if (
        me.y >
        canvas.height + 100
    ) {
        me.x =
            100 +
            Math.random() * 300;

        me.y = 500;

        velocityX = 0;
        velocityY = 0;
    }

    me.facing = facing;

    socket.emit(
        "playerMove",
        {
            x: me.x,
            y: me.y,
            facing: facing
        }
    );
}

// =====================================================
// DRAW HEARTS
// =====================================================

function drawHearts(
    x,
    y,
    health
) {
    ctx.font = "24px Arial";

    for (
        let heart = 0;
        heart < 10;
        heart++
    ) {
        const amount =
            health -
            heart * 2;

        if (amount >= 2) {
            ctx.fillStyle =
                "#ff3030";

            ctx.fillText(
                "♥",
                x +
                    heart * 25,
                y
            );
        } else if (
            amount === 1
        ) {
            ctx.fillStyle =
                "#ff9f1c";

            ctx.fillText(
                "♥",
                x +
                    heart * 25,
                y
            );
        } else {
            ctx.fillStyle =
                "#666666";

            ctx.fillText(
                "♡",
                x +
                    heart * 25,
                y
            );
        }
    }
}

// =====================================================
// DRAW SWORD
// =====================================================

function drawSword(
    player,
    swing
) {
    if (
        !swing ||
        player.dead
    ) {
        return;
    }

    const elapsed =
        Date.now() -
        swing.start;

    if (
        elapsed >
        SWORD_SWING_TIME
    ) {
        return;
    }

    const progress =
        elapsed /
        SWORD_SWING_TIME;

    const direction =
        swing.facing;

    const startAngle =
        direction === 1
            ? -1.1
            : Math.PI + 1.1;

    const endAngle =
        direction === 1
            ? 0.8
            : Math.PI - 0.8;

    const angle =
        startAngle +
        (
            endAngle -
            startAngle
        ) *
        progress;

    const handX =
        player.x +
        PLAYER_SIZE / 2;

    const handY =
        player.y +
        PLAYER_SIZE / 2;

    const handleLength = 8;
    const bladeLength = 38;

    const handleEndX =
        handX +
        Math.cos(angle) *
        handleLength;

    const handleEndY =
        handY +
        Math.sin(angle) *
        handleLength;

    const swordEndX =
        handX +
        Math.cos(angle) *
        (
            handleLength +
            bladeLength
        );

    const swordEndY =
        handY +
        Math.sin(angle) *
        (
            handleLength +
            bladeLength
        );

    ctx.strokeStyle =
        "#8b5a2b";

    ctx.lineWidth = 7;

    ctx.beginPath();

    ctx.moveTo(
        handX,
        handY
    );

    ctx.lineTo(
        handleEndX,
        handleEndY
    );

    ctx.stroke();

    ctx.strokeStyle =
        "#e8edf2";

    ctx.lineWidth = 6;

    ctx.beginPath();

    ctx.moveTo(
        handleEndX,
        handleEndY
    );

    ctx.lineTo(
        swordEndX,
        swordEndY
    );

    ctx.stroke();

    ctx.strokeStyle =
        "#ffffff";

    ctx.lineWidth = 2;

    ctx.beginPath();

    ctx.moveTo(
        handleEndX,
        handleEndY
    );

    ctx.lineTo(
        swordEndX,
        swordEndY
    );

    ctx.stroke();
}

// =====================================================
// DRAW GAME
// =====================================================

function draw() {

    ctx.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
    );

    ctx.fillStyle =
        "#11111b";

    ctx.fillRect(
        0,
        0,
        canvas.width,
        canvas.height
    );

    ctx.fillStyle =
        "#dddddd";

    for (
        const platform
        of platforms
    ) {
        ctx.fillRect(
            platform.x,
            platform.y,
            platform.width,
            platform.height
        );
    }

    for (const id in players) {

        const player =
            players[id];

        if (!player) continue;

        ctx.globalAlpha =
            player.dead
                ? 0.25
                : 1;

        ctx.fillStyle =
            player.color ||
            "#ffffff";

        ctx.fillRect(
            player.x,
            player.y,
            PLAYER_SIZE,
            PLAYER_SIZE
        );

        ctx.globalAlpha = 1;

        if (id === myId) {
            ctx.fillStyle =
                "#ffffff";

            ctx.font =
                "bold 12px Arial";

            ctx.fillText(
                "YOU",
                player.x,
                player.y - 8
            );
        }

        const health =
            player.health ??
            MAX_HEALTH;

        ctx.fillStyle =
            "#333333";

        ctx.fillRect(
            player.x,
            player.y - 5,
            PLAYER_SIZE,
            3
        );

        ctx.fillStyle =
            health > 6
                ? "#32d74b"
                : "#ff453a";

        ctx.fillRect(
            player.x,
            player.y - 5,

            PLAYER_SIZE *
                (
                    health /
                    MAX_HEALTH
                ),

            3
        );

        const swing =
            meleeSwings[id];

        if (swing) {

            const elapsed =
                Date.now() -
                swing.start;

            if (
                elapsed <=
                SWORD_SWING_TIME
            ) {
                drawSword(
                    player,
                    swing
                );
            } else {
                delete meleeSwings[id];
            }
        }
    }

    for (
        const fireball
        of fireballs
    ) {
        ctx.beginPath();

        ctx.arc(
            fireball.x,
            fireball.y,
            fireball.radius,
            0,
            Math.PI * 2
        );

        ctx.fillStyle =
            "#ff7b00";

        ctx.fill();

        ctx.beginPath();

        ctx.arc(
            fireball.x,
            fireball.y,
            5,
            0,
            Math.PI * 2
        );

        ctx.fillStyle =
            "#ffe600";

        ctx.fill();
    }

    const me =
        players[myId];

    if (me) {

        ctx.fillStyle =
            "rgba(0,0,0,0.75)";

        ctx.fillRect(
            12,
            10,
            310,
            115
        );

        ctx.fillStyle =
            "#ffffff";

        ctx.font =
            "bold 16px Arial";

        ctx.fillText(
            "YOUR HEALTH",
            25,
            34
        );

        drawHearts(
            25,
            64,
            me.health ??
                MAX_HEALTH
        );

        ctx.fillStyle =
            "#ffffff";

        ctx.font =
            "14px Arial";

        ctx.fillText(
            "Sword hit = 1/2 heart",
            25,
            91
        );

        ctx.fillStyle =
            "#bbbbbb";

        ctx.font =
            "12px Arial";

        ctx.fillText(
            "WASD or Arrows | F Sword | Space Attack",
            25,
            112
        );
    }

    if (
        spaceHeld &&
        me &&
        !me.dead
    ) {

        const heldTime =
            Date.now() -
            spacePressedAt;

        const charge =
            Math.min(
                heldTime /
                    FIREBALL_CHARGE_TIME,
                1
            );

        const barWidth = 250;

        const x =
            canvas.width / 2 -
            barWidth / 2;

        const y = 15;

        ctx.fillStyle =
            "#333333";

        ctx.fillRect(
            x,
            y,
            barWidth,
            20
        );

        ctx.fillStyle =
            charge >= 1
                ? "#ff7b00"
                : "#ffd60a";

        ctx.fillRect(
            x,
            y,
            barWidth * charge,
            20
        );

        ctx.strokeStyle =
            "#ffffff";

        ctx.strokeRect(
            x,
            y,
            barWidth,
            20
        );

        ctx.fillStyle =
            "#ffffff";

        ctx.font =
            "bold 12px Arial";

        ctx.textAlign =
            "center";

        ctx.fillText(
            charge >= 1
                ? "FIREBALL READY!"
                : "CHARGING...",

            canvas.width / 2,
            30
        );

        ctx.textAlign =
            "left";
    }

    if (
        me &&
        me.dead
    ) {

        ctx.fillStyle =
            "rgba(0,0,0,0.70)";

        ctx.fillRect(
            0,
            0,
            canvas.width,
            canvas.height
        );

        ctx.fillStyle =
            "#ff453a";

        ctx.font =
            "bold 52px Arial";

        ctx.textAlign =
            "center";

        ctx.fillText(
            "YOU DIED",
            canvas.width / 2,
            canvas.height / 2 - 45
        );

        respawnButton = {
            x:
                canvas.width / 2 -
                100,

            y:
                canvas.height / 2,

            width: 200,
            height: 55
        };

        ctx.fillStyle =
            "#32d74b";

        ctx.fillRect(
            respawnButton.x,
            respawnButton.y,
            respawnButton.width,
            respawnButton.height
        );

        ctx.fillStyle =
            "#000000";

        ctx.font =
            "bold 20px Arial";

        ctx.fillText(
            "RESPAWN",
            canvas.width / 2,
            respawnButton.y + 35
        );

        ctx.textAlign =
            "left";
    } else {
        respawnButton = null;
    }
}

// =====================================================
// RESPAWN CLICK
// =====================================================

canvas.addEventListener(
    "click",
    (event) => {

        const me =
            players[myId];

        if (
            !me ||
            !me.dead ||
            !respawnButton
        ) {
            return;
        }

        const rect =
            canvas.getBoundingClientRect();

        const scaleX =
            canvas.width /
            rect.width;

        const scaleY =
            canvas.height /
            rect.height;

        const mouseX =
            (
                event.clientX -
                rect.left
            ) *
            scaleX;

        const mouseY =
            (
                event.clientY -
                rect.top
            ) *
            scaleY;

        if (
            mouseX >=
                respawnButton.x &&

            mouseX <=
                respawnButton.x +
                respawnButton.width &&

            mouseY >=
                respawnButton.y &&

            mouseY <=
                respawnButton.y +
                respawnButton.height
        ) {
            socket.emit(
                "respawnPlayer"
            );
        }
    }
);

// =====================================================
// GAME LOOP
// =====================================================

function gameLoop() {

    updatePlayer();

    updateFireballs();

    draw();

    requestAnimationFrame(
        gameLoop
    );
}

gameLoop();

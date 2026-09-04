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

const BASE_MAX_HEALTH = 20;

// =====================================================
// DASH SETTINGS
// =====================================================

// Old dash power was 15.
//
// Level 1 is now DOUBLE that = 30.
//
// Each additional level adds 25%
// of the NEW base dash distance.
//
// Level 1 = 30
// Level 2 = 37.5
// Level 3 = 45
// Level 4 = 52.5
// Level 5+ = 60 MAX

const BASE_DASH_POWER = 30;

const MAX_DASH_DISTANCE_UPGRADES = 4;

const POWERUP_RADIUS = 13;

// =====================================================
// GAME DATA
// =====================================================

let myId = null;

let players = {};

let platforms = [];

let powerups = {};

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

let lastDashTime = 0;

let lastGreenFireballTime = 0;

let respawnButton = null;

let platformMessageUntil = 0;

let powerupPickupAttempts = {};

// =====================================================
// CONTROL HELPERS
// =====================================================

function leftHeld() {

    return (
        keys["KeyA"] ||
        keys["ArrowLeft"]
    );
}

function rightHeld() {

    return (
        keys["KeyD"] ||
        keys["ArrowRight"]
    );
}

function jumpHeld() {

    return (
        keys["KeyW"] ||
        keys["ArrowUp"]
    );
}

// =====================================================
// DASH COOLDOWN
// =====================================================

function getDashCooldown(player) {

    if (
        !player ||
        player.dashLevel <= 0
    ) {
        return 0;
    }

    // Level 1 = 7 sec
    // Level 2 = 6 sec
    // Level 3 = 5 sec
    // Level 4+ = 4 sec

    return Math.max(
        4,
        8 - player.dashLevel
    ) * 1000;
}

// =====================================================
// DASH DISTANCE / POWER
// =====================================================

function getDashPower(player) {

    if (
        !player ||
        player.dashLevel <= 0
    ) {
        return 0;
    }

    // Level 1 starts at BASE_DASH_POWER.
    //
    // Then levels 2-5 add 25% each.
    //
    // Level 1 = 30
    // Level 2 = 37.5
    // Level 3 = 45
    // Level 4 = 52.5
    // Level 5+ = 60

    const distanceUpgrades =
        Math.min(
            Math.max(
                player.dashLevel - 1,
                0
            ),
            MAX_DASH_DISTANCE_UPGRADES
        );

    const multiplier =
        1 +
        distanceUpgrades * 0.25;

    return (
        BASE_DASH_POWER *
        multiplier
    );
}

// =====================================================
// GREEN FIREBALL COOLDOWN
// =====================================================

function getGreenCooldown(player) {

    if (
        !player ||
        player.greenLevel <= 0
    ) {
        return 0;
    }

    // Level 1 = 2 sec
    // Level 2 = 1.5 sec
    // Level 3+ = 1 sec

    return Math.max(
        1000,
        2500 -
            player.greenLevel * 500
    );
}

// =====================================================
// CONNECTION
// =====================================================

socket.on(
    "connect",
    () => {

        myId =
            socket.id;
    }
);

// =====================================================
// PLATFORM EVENTS
// =====================================================

socket.on(
    "platformLayout",
    (newPlatforms) => {

        platforms =
            newPlatforms;
    }
);

socket.on(
    "platformLayoutChanged",
    (newPlatforms) => {

        platforms =
            newPlatforms;

        platformMessageUntil =
            Date.now() + 3000;

        const me =
            players[myId];

        if (
            me &&
            !me.dead
        ) {

            me.x =
                100 +
                Math.random() * 300;

            me.y =
                500;

            velocityX = 0;
            velocityY = 0;

            onGround = false;

            socket.emit(
                "playerMove",
                {
                    x: me.x,
                    y: me.y,
                    facing: facing
                }
            );
        }
    }
);

// =====================================================
// POWERUP EVENTS
// =====================================================

socket.on(
    "currentPowerups",
    (serverPowerups) => {

        powerups =
            serverPowerups || {};
    }
);

socket.on(
    "powerupSpawned",
    (powerup) => {

        powerups[
            powerup.id
        ] =
            powerup;
    }
);

socket.on(
    "powerupRemoved",
    (powerupId) => {

        delete powerups[
            powerupId
        ];

        delete powerupPickupAttempts[
            powerupId
        ];
    }
);

// =====================================================
// PLAYER EVENTS
// =====================================================

socket.on(
    "currentPlayers",
    (serverPlayers) => {

        players =
            serverPlayers;

        const me =
            players[myId];

        if (me) {

            facing =
                me.facing || 1;
        }
    }
);

socket.on(
    "newPlayer",
    (player) => {

        players[
            player.id
        ] =
            player;
    }
);

socket.on(
    "playerMoved",
    (data) => {

        if (
            !players[
                data.id
            ]
        ) {
            return;
        }

        players[
            data.id
        ].x =
            data.x;

        players[
            data.id
        ].y =
            data.y;

        if (
            data.facing === 1 ||
            data.facing === -1
        ) {

            players[
                data.id
            ].facing =
                data.facing;
        }
    }
);

socket.on(
    "playerDisconnected",
    (id) => {

        delete players[id];

        delete meleeSwings[id];
    }
);

// =====================================================
// HEALTH EVENTS
// =====================================================

socket.on(
    "playerHealthChanged",
    (data) => {

        const player =
            players[
                data.id
            ];

        if (!player) {
            return;
        }

        player.health =
            data.health;

        if (
            data.maxHealth !==
            undefined
        ) {

            player.maxHealth =
                data.maxHealth;
        }

        player.dead =
            data.dead;

        if (
            data.respawnAllowedAt !==
            undefined
        ) {

            player.respawnAllowedAt =
                data.respawnAllowedAt;
        }

        if (
            data.id === myId &&
            data.dead
        ) {

            velocityX = 0;

            velocityY = 0;

            spaceHeld = false;
        }
    }
);

// =====================================================
// POWERUP LEVEL EVENTS
// =====================================================

socket.on(
    "playerPowerupChanged",
    (data) => {

        const player =
            players[
                data.id
            ];

        if (!player) {
            return;
        }

        player.health =
            data.health;

        player.maxHealth =
            data.maxHealth;

        player.dashLevel =
            data.dashLevel;

        player.greenLevel =
            data.greenLevel;

        if (
            data.id === myId &&
            data.dashLevel === 0
        ) {

            lastDashTime = 0;
        }

        if (
            data.id === myId &&
            data.greenLevel === 0
        ) {

            lastGreenFireballTime = 0;
        }
    }
);

// =====================================================
// RESPAWN
// =====================================================

socket.on(
    "playerRespawned",
    (data) => {

        if (
            !players[
                data.id
            ]
        ) {

            players[
                data.id
            ] = {};
        }

        const player =
            players[
                data.id
            ];

        player.x =
            data.x;

        player.y =
            data.y;

        player.health =
            data.health;

        player.maxHealth =
            data.maxHealth;

        player.dead =
            false;

        player.facing =
            data.facing || 1;

        player.dashLevel =
            data.dashLevel || 0;

        player.greenLevel =
            data.greenLevel || 0;

        player.respawnAllowedAt =
            0;

        if (
            data.id === myId
        ) {

            velocityX = 0;

            velocityY = 0;

            facing =
                player.facing;

            lastDashTime = 0;

            lastGreenFireballTime = 0;

            lastMeleeTime = 0;
        }
    }
);

// =====================================================
// KNOCKBACK
// =====================================================

socket.on(
    "receiveKnockback",
    (data) => {

        const me =
            players[myId];

        if (
            !me ||
            me.dead
        ) {
            return;
        }

        velocityX +=
            data.velocityX;

        velocityY +=
            data.velocityY;
    }
);

// =====================================================
// SWORD VISUAL
// =====================================================

socket.on(
    "playerMeleeSwing",
    (data) => {

        meleeSwings[
            data.id
        ] = {

            start:
                Date.now(),

            facing:
                data.facing
        };
    }
);

// =====================================================
// FIREBALL EVENTS
// =====================================================

socket.on(
    "spawnFireball",
    (fireball) => {

        fireballs.push(
            fireball
        );
    }
);

socket.on(
    "removeFireball",
    (data) => {

        fireballs =
            fireballs.filter(
                fireball =>
                    fireball.id !==
                    data.id
            );
    }
);

// =====================================================
// KEYBOARD
// =====================================================

document.addEventListener(
    "keydown",
    (event) => {

        if (
            event.code === "ArrowLeft" ||
            event.code === "ArrowRight" ||
            event.code === "ArrowUp" ||
            event.code === "ArrowDown" ||
            event.code === "Space"
        ) {

            event.preventDefault();
        }

        keys[
            event.code
        ] =
            true;

        const me =
            players[myId];

        if (
            !me ||
            me.dead
        ) {
            return;
        }

        // SPACE
        if (
            event.code === "Space" &&
            !spaceHeld
        ) {

            spaceHeld =
                true;

            spacePressedAt =
                Date.now();
        }

        // F
        if (
            event.code === "KeyF" &&
            !event.repeat
        ) {

            performFAction();
        }

        // G = DASH
        if (
            event.code === "KeyG" &&
            !event.repeat
        ) {

            performDash();
        }
    }
);

document.addEventListener(
    "keyup",
    (event) => {

        if (
            event.code === "ArrowLeft" ||
            event.code === "ArrowRight" ||
            event.code === "ArrowUp" ||
            event.code === "ArrowDown" ||
            event.code === "Space"
        ) {

            event.preventDefault();
        }

        keys[
            event.code
        ] =
            false;

        if (
            event.code ===
            "Space"
        ) {

            const me =
                players[myId];

            if (
                !me ||
                me.dead
            ) {

                spaceHeld =
                    false;

                return;
            }

            const heldTime =
                Date.now() -
                spacePressedAt;

            if (
                heldTime >=
                FIREBALL_CHARGE_TIME
            ) {

                shootNormalFireball();

            } else {

                normalShove();
            }

            spaceHeld =
                false;
        }
    }
);

// =====================================================
// DASH
// =====================================================

function performDash() {

    const me =
        players[myId];

    if (
        !me ||
        me.dead ||
        me.dashLevel <= 0
    ) {
        return;
    }

    const cooldown =
        getDashCooldown(me);

    const now =
        Date.now();

    if (
        now -
        lastDashTime <
        cooldown
    ) {
        return;
    }

    lastDashTime =
        now;

    // Calculate dash strength based
    // on how many Dash powerups you have.
    const dashPower =
        getDashPower(me);

    // UPWARD DASH:
    // W or Up Arrow must be held,
    // and NO left/right key can be held.
    const upwardDash =
        jumpHeld() &&
        !leftHeld() &&
        !rightHeld();

    if (
        upwardDash
    ) {

        velocityX =
            0;

        velocityY =
            -dashPower;

        onGround =
            false;

    } else {

        let direction =
            facing;

        if (
            leftHeld() &&
            !rightHeld()
        ) {

            direction =
                -1;
        }

        if (
            rightHeld() &&
            !leftHeld()
        ) {

            direction =
                1;
        }

        facing =
            direction;

        velocityX =
            direction *
            dashPower;
    }
}

// =====================================================
// F BUTTON
// =====================================================

function performFAction() {

    const me =
        players[myId];

    if (
        !me ||
        me.dead
    ) {
        return;
    }

    if (
        me.greenLevel > 0
    ) {

        shootGreenFireball();

    } else {

        performMeleeAttack();
    }
}

// =====================================================
// NORMAL SHOVE
// =====================================================

function normalShove() {

    const me =
        players[myId];

    if (
        !me ||
        me.dead
    ) {
        return;
    }

    for (
        const id in players
    ) {

        if (
            id === myId
        ) {
            continue;
        }

        const target =
            players[id];

        if (
            !target ||
            target.dead
        ) {
            continue;
        }

        const myX =
            me.x +
            PLAYER_SIZE / 2;

        const myY =
            me.y +
            PLAYER_SIZE / 2;

        const targetX =
            target.x +
            PLAYER_SIZE / 2;

        const targetY =
            target.y +
            PLAYER_SIZE / 2;

        const dx =
            targetX - myX;

        const dy =
            targetY - myY;

        const distance =
            Math.sqrt(
                dx * dx +
                dy * dy
            );

        if (
            distance <=
            NORMAL_SHOVE_RANGE
        ) {

            const direction =
                dx >= 0
                    ? 1
                    : -1;

            socket.emit(
                "knockbackPlayer",
                {
                    targetId:
                        id,

                    velocityX:
                        direction *
                        NORMAL_KNOCKBACK,

                    velocityY:
                        -4
                }
            );
        }
    }
}

// =====================================================
// SWORD
// =====================================================

function performMeleeAttack() {

    const me =
        players[myId];

    if (
        !me ||
        me.dead ||
        me.greenLevel > 0
    ) {
        return;
    }

    const now =
        Date.now();

    if (
        now -
        lastMeleeTime <
        MELEE_COOLDOWN
    ) {
        return;
    }

    lastMeleeTime =
        now;

    meleeSwings[
        myId
    ] = {

        start:
            now,

        facing:
            facing
    };

    socket.emit(
        "meleeSwing",
        {
            facing:
                facing
        }
    );

    let closestTarget =
        null;

    let closestDistance =
        Infinity;

    for (
        const id in players
    ) {

        if (
            id === myId
        ) {
            continue;
        }

        const target =
            players[id];

        if (
            !target ||
            target.dead
        ) {
            continue;
        }

        const myX =
            me.x +
            PLAYER_SIZE / 2;

        const myY =
            me.y +
            PLAYER_SIZE / 2;

        const targetX =
            target.x +
            PLAYER_SIZE / 2;

        const targetY =
            target.y +
            PLAYER_SIZE / 2;

        const dx =
            targetX - myX;

        const dy =
            targetY - myY;

        const distance =
            Math.sqrt(
                dx * dx +
                dy * dy
            );

        const inFront =
            facing === 1
                ? dx >= 0
                : dx <= 0;

        if (
            inFront &&
            distance <=
                MELEE_RANGE &&
            distance <
                closestDistance
        ) {

            closestDistance =
                distance;

            closestTarget =
                id;
        }
    }

    if (
        !closestTarget
    ) {
        return;
    }

    socket.emit(
        "meleeHit",
        {
            targetId:
                closestTarget,

            velocityX:
                facing *
                MELEE_KNOCKBACK
        }
    );
}

// =====================================================
// NORMAL FIREBALL
// =====================================================

function shootNormalFireball() {

    const me =
        players[myId];

    if (
        !me ||
        me.dead
    ) {
        return;
    }

    const fireball = {

        id:
            myId +
            "-normal-" +
            Date.now() +
            "-" +
            Math.random(),

        ownerId:
            myId,

        type:
            "normal",

        x:
            me.x +
            PLAYER_SIZE / 2,

        y:
            me.y +
            PLAYER_SIZE / 2,

        velocityX:
            facing *
            FIREBALL_SPEED,

        velocityY:
            0,

        radius:
            10
    };

    fireballs.push(
        fireball
    );

    socket.emit(
        "shootFireball",
        fireball
    );
}

// =====================================================
// GREEN FIREBALL
// =====================================================

function shootGreenFireball() {

    const me =
        players[myId];

    if (
        !me ||
        me.dead ||
        me.greenLevel <= 0
    ) {
        return;
    }

    const cooldown =
        getGreenCooldown(me);

    const now =
        Date.now();

    if (
        now -
        lastGreenFireballTime <
        cooldown
    ) {
        return;
    }

    lastGreenFireballTime =
        now;

    let velocityX =
        facing *
        FIREBALL_SPEED;

    let velocityY =
        0;

    // 25% chance to aim at nearest player.
    const homingShot =
        Math.random() < 0.25;

    if (
        homingShot
    ) {

        let nearestPlayer =
            null;

        let nearestDistance =
            Infinity;

        for (
            const id in players
        ) {

            if (
                id === myId
            ) {
                continue;
            }

            const target =
                players[id];

            if (
                !target ||
                target.dead
            ) {
                continue;
            }

            const dx =
                target.x -
                me.x;

            const dy =
                target.y -
                me.y;

            const distance =
                Math.sqrt(
                    dx * dx +
                    dy * dy
                );

            if (
                distance <
                nearestDistance
            ) {

                nearestDistance =
                    distance;

                nearestPlayer =
                    target;
            }
        }

        if (
            nearestPlayer
        ) {

            const startX =
                me.x +
                PLAYER_SIZE / 2;

            const startY =
                me.y +
                PLAYER_SIZE / 2;

            const targetX =
                nearestPlayer.x +
                PLAYER_SIZE / 2;

            const targetY =
                nearestPlayer.y +
                PLAYER_SIZE / 2;

            const dx =
                targetX -
                startX;

            const dy =
                targetY -
                startY;

            const length =
                Math.sqrt(
                    dx * dx +
                    dy * dy
                ) || 1;

            velocityX =
                (
                    dx /
                    length
                ) *
                FIREBALL_SPEED;

            velocityY =
                (
                    dy /
                    length
                ) *
                FIREBALL_SPEED;
        }
    }

    const fireball = {

        id:
            myId +
            "-green-" +
            Date.now() +
            "-" +
            Math.random(),

        ownerId:
            myId,

        type:
            "green",

        x:
            me.x +
            PLAYER_SIZE / 2,

        y:
            me.y +
            PLAYER_SIZE / 2,

        velocityX:
            velocityX,

        velocityY:
            velocityY,

        radius:
            11,

        homingShot:
            homingShot
    };

    fireballs.push(
        fireball
    );

    socket.emit(
        "shootGreenFireball",
        fireball
    );
}

// =====================================================
// FIREBALL UPDATE
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

        fireball.y +=
            fireball.velocityY || 0;

        if (
            fireball.x < -100 ||
            fireball.x >
                canvas.width + 100 ||
            fireball.y < -100 ||
            fireball.y >
                canvas.height + 100
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

            fireballs.splice(
                i,
                1
            );

            continue;
        }

        if (
            fireball.ownerId !==
            myId
        ) {
            continue;
        }

        for (
            const id in players
        ) {

            if (
                id ===
                fireball.ownerId
            ) {
                continue;
            }

            const target =
                players[id];

            if (
                !target ||
                target.dead
            ) {
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

                if (
                    fireball.type ===
                    "green"
                ) {

                    socket.emit(
                        "greenFireballHit",
                        {
                            targetId:
                                id,

                            direction:
                                fireball.velocityX <
                                0
                                    ? -1
                                    : 1
                        }
                    );

                } else {

                    socket.emit(
                        "fireballHit",
                        {
                            targetId:
                                id
                        }
                    );

                    const direction =
                        fireball.velocityX >=
                        0
                            ? 1
                            : -1;

                    socket.emit(
                        "knockbackPlayer",
                        {
                            targetId:
                                id,

                            velocityX:
                                direction *
                                FIREBALL_KNOCKBACK,

                            velocityY:
                                -10
                        }
                    );
                }

                socket.emit(
                    "removeFireball",
                    {
                        id:
                            fireball.id
                    }
                );

                fireballs.splice(
                    i,
                    1
                );

                break;
            }
        }
    }
}

// =====================================================
// POWERUP PICKUP CHECK
// =====================================================

function updatePowerupPickup() {

    const me =
        players[myId];

    if (
        !me ||
        me.dead
    ) {
        return;
    }

    const myX =
        me.x +
        PLAYER_SIZE / 2;

    const myY =
        me.y +
        PLAYER_SIZE / 2;

    const now =
        Date.now();

    for (
        const id in powerups
    ) {

        const powerup =
            powerups[id];

        const dx =
            myX -
            powerup.x;

        const dy =
            myY -
            powerup.y;

        const distance =
            Math.sqrt(
                dx * dx +
                dy * dy
            );

        if (
            distance <
            PLAYER_SIZE / 2 +
                POWERUP_RADIUS
        ) {

            const lastAttempt =
                powerupPickupAttempts[
                    id
                ] || 0;

            if (
                now -
                lastAttempt >
                500
            ) {

                powerupPickupAttempts[
                    id
                ] =
                    now;

                socket.emit(
                    "pickupPowerup",
                    id
                );
            }
        }
    }
}

// =====================================================
// PLAYER MOVEMENT
// =====================================================

function updatePlayer() {

    const me =
        players[myId];

    if (!me) {
        return;
    }

    if (
        me.dead
    ) {

        velocityX = 0;

        velocityY = 0;

        return;
    }

    // LEFT
    if (
        leftHeld() &&
        !rightHeld()
    ) {

        velocityX =
            -MOVE_SPEED;

        facing =
            -1;
    }

    // RIGHT
    else if (
        rightHeld() &&
        !leftHeld()
    ) {

        velocityX =
            MOVE_SPEED;

        facing =
            1;
    }

    else {

        velocityX *=
            0.8;

        if (
            Math.abs(
                velocityX
            ) < 0.1
        ) {

            velocityX =
                0;
        }
    }

    // HOLD W / UP TO AUTO-JUMP
    if (
        jumpHeld() &&
        onGround
    ) {

        velocityY =
            -JUMP_POWER;

        onGround =
            false;
    }

    me.x +=
        velocityX;

    if (
        me.x < 0
    ) {

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

    const oldY =
        me.y;

    velocityY +=
        GRAVITY;

    me.y +=
        velocityY;

    onGround =
        false;

    if (
        velocityY >= 0
    ) {

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

                velocityY =
                    0;

                onGround =
                    true;

                break;
            }
        }
    }

    if (
        me.y >
        canvas.height +
            100
    ) {

        me.x =
            100 +
            Math.random() * 300;

        me.y =
            500;

        velocityX =
            0;

        velocityY =
            0;
    }

    me.facing =
        facing;

    socket.emit(
        "playerMove",
        {
            x:
                me.x,

            y:
                me.y,

            facing:
                facing
        }
    );
}

// =====================================================
// DRAW EYE
// =====================================================

function drawEye(player) {

    const lookDirection =
        player.facing === -1
            ? -1
            : 1;

    const eyeWidth =
        5;

    const eyeHeight =
        13;

    let eyeX;

    if (
        lookDirection === 1
    ) {

        eyeX =
            player.x +
            PLAYER_SIZE -
            eyeWidth -
            4;

    } else {

        eyeX =
            player.x +
            4;
    }

    const eyeY =
        player.y +
        7;

    ctx.fillStyle =
        "#000000";

    ctx.beginPath();

    ctx.roundRect(
        eyeX,
        eyeY,
        eyeWidth,
        eyeHeight,
        3
    );

    ctx.fill();
}

// =====================================================
// HEARTS
// =====================================================

function drawHearts(
    x,
    y,
    health,
    maxHealth
) {

    const totalHearts =
        Math.ceil(
            maxHealth / 2
        );

    ctx.font =
        "22px Arial";

    for (
        let heart = 0;

        heart <
        totalHearts;

        heart++
    ) {

        const row =
            Math.floor(
                heart / 10
            );

        const column =
            heart % 10;

        const heartX =
            x +
            column * 23;

        const heartY =
            y +
            row * 23;

        const amount =
            health -
            heart * 2;

        if (
            amount >= 2
        ) {

            ctx.fillStyle =
                "#ff3030";

            ctx.fillText(
                "♥",
                heartX,
                heartY
            );

        } else if (
            amount === 1
        ) {

            ctx.fillStyle =
                "#ff9f1c";

            ctx.fillText(
                "♥",
                heartX,
                heartY
            );

        } else {

            ctx.fillStyle =
                "#666666";

            ctx.fillText(
                "♡",
                heartX,
                heartY
            );
        }
    }
}

// =====================================================
// SWORD DRAWING
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

    const handleLength =
        8;

    const bladeLength =
        38;

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

    ctx.lineWidth =
        7;

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

    ctx.lineWidth =
        6;

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

    ctx.lineWidth =
        2;

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
// DRAW POWERUPS
// =====================================================

function drawPowerup(
    powerup
) {

    ctx.save();

    ctx.translate(
        powerup.x,
        powerup.y
    );

    ctx.beginPath();

    ctx.arc(
        0,
        0,
        POWERUP_RADIUS,
        0,
        Math.PI * 2
    );

    if (
        powerup.type ===
        "health"
    ) {

        ctx.fillStyle =
            "#ff3b30";

    } else if (
        powerup.type ===
        "dash"
    ) {

        ctx.fillStyle =
            "#4fd5ff";

    } else {

        ctx.fillStyle =
            "#32ff5a";
    }

    ctx.fill();

    ctx.strokeStyle =
        "#ffffff";

    ctx.lineWidth =
        2;

    ctx.stroke();

    ctx.fillStyle =
        "#ffffff";

    ctx.font =
        "bold 15px Arial";

    ctx.textAlign =
        "center";

    ctx.textBaseline =
        "middle";

    if (
        powerup.type ===
        "health"
    ) {

        ctx.fillText(
            "+",
            0,
            0
        );

    } else if (
        powerup.type ===
        "dash"
    ) {

        ctx.fillText(
            "G",
            0,
            0
        );

    } else {

        ctx.fillText(
            "F",
            0,
            0
        );
    }

    ctx.restore();
}

// =====================================================
// DRAW
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

    // PLATFORMS
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

    // POWERUPS
    for (
        const id in powerups
    ) {

        drawPowerup(
            powerups[id]
        );
    }

    // PLAYERS
    for (
        const id in players
    ) {

        const player =
            players[id];

        if (!player) {
            continue;
        }

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

        drawEye(
            player
        );

        ctx.globalAlpha =
            1;

        if (
            id === myId
        ) {

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

        const maxHealth =
            player.maxHealth ||
            BASE_MAX_HEALTH;

        const health =
            player.health ??
            maxHealth;

        ctx.fillStyle =
            "#333333";

        ctx.fillRect(
            player.x,
            player.y - 5,
            PLAYER_SIZE,
            3
        );

        ctx.fillStyle =
            health >
                maxHealth * 0.3
                ? "#32d74b"
                : "#ff453a";

        ctx.fillRect(
            player.x,
            player.y - 5,

            PLAYER_SIZE *
                (
                    health /
                    maxHealth
                ),

            3
        );

        const swing =
            meleeSwings[id];

        if (
            swing &&
            !player.greenLevel
        ) {

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

                delete meleeSwings[
                    id
                ];
            }
        }
    }

    // FIREBALLS
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

        if (
            fireball.type ===
            "green"
        ) {

            ctx.fillStyle =
                "#00ff55";

        } else {

            ctx.fillStyle =
                "#ff7b00";
        }

        ctx.fill();

        ctx.beginPath();

        ctx.arc(
            fireball.x,
            fireball.y,
            Math.max(
                3,
                fireball.radius / 2
            ),
            0,
            Math.PI * 2
        );

        if (
            fireball.type ===
            "green"
        ) {

            ctx.fillStyle =
                "#c8ff00";

        } else {

            ctx.fillStyle =
                "#ffe600";
        }

        ctx.fill();
    }

    const me =
        players[myId];

    // =================================================
    // HEALTH HUD
    // =================================================

    if (me) {

        const maxHealth =
            me.maxHealth ||
            BASE_MAX_HEALTH;

        const health =
            me.health ??
            maxHealth;

        ctx.fillStyle =
            "rgba(0,0,0,0.76)";

        ctx.fillRect(
            12,
            10,
            260,
            145
        );

        ctx.fillStyle =
            "#ffffff";

        ctx.font =
            "bold 16px Arial";

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

        ctx.fillStyle =
            "#bbbbbb";

        ctx.font =
            "12px Arial";

        ctx.fillText(
            "F = Sword / Green Fireball",
            25,
            116
        );

        ctx.fillText(
            "G = Dash when unlocked",
            25,
            134
        );
    }

    // =================================================
    // POWERUP HUD
    // =================================================

    if (
        me &&
        !me.dead
    ) {

        ctx.fillStyle =
            "rgba(0,0,0,0.76)";

        ctx.fillRect(
            570,
            10,
            218,
            132
        );

        ctx.fillStyle =
            "#ffffff";

        ctx.font =
            "bold 14px Arial";

        ctx.fillText(
            "POWERUPS",
            585,
            31
        );

        const bonusHearts =
            Math.max(
                0,
                (
                    (
                        me.maxHealth ||
                        BASE_MAX_HEALTH
                    ) -
                    BASE_MAX_HEALTH
                ) / 2
            );

        ctx.font =
            "12px Arial";

        ctx.fillStyle =
            "#ff6b63";

        ctx.fillText(
            "Health: +" +
                bonusHearts +
                " hearts",
            585,
            53
        );

        ctx.fillStyle =
            "#4fd5ff";

        if (
            me.dashLevel > 0
        ) {

            const cooldown =
                getDashCooldown(me);

            const remaining =
                Math.max(
                    0,
                    cooldown -
                        (
                            Date.now() -
                            lastDashTime
                        )
                );

            const dashText =
                remaining <= 0
                    ? "READY"
                    : (
                        remaining /
                        1000
                    ).toFixed(1) +
                    "s";

            ctx.fillText(
                "Dash Lv " +
                    me.dashLevel +
                    ": " +
                    dashText,
                585,
                74
            );

            // Show dash distance bonus.
            const distanceUpgradeCount =
                Math.min(
                    Math.max(
                        me.dashLevel - 1,
                        0
                    ),
                    MAX_DASH_DISTANCE_UPGRADES
                );

            const distancePercent =
                100 +
                distanceUpgradeCount *
                    25;

            ctx.fillText(
                "Dash distance: " +
                    distancePercent +
                    "%",
                585,
                94
            );

        } else {

            ctx.fillText(
                "Dash: locked",
                585,
                74
            );

            ctx.fillText(
                "Dash distance: locked",
                585,
                94
            );
        }

        ctx.fillStyle =
            "#32ff5a";

        if (
            me.greenLevel > 0
        ) {

            const cooldown =
                getGreenCooldown(me);

            const remaining =
                Math.max(
                    0,
                    cooldown -
                        (
                            Date.now() -
                            lastGreenFireballTime
                        )
                );

            const greenText =
                remaining <= 0
                    ? "READY"
                    : (
                        remaining /
                        1000
                    ).toFixed(1) +
                    "s";

            ctx.fillText(
                "Green Lv " +
                    me.greenLevel +
                    ": " +
                    greenText,
                585,
                116
            );

        } else {

            ctx.fillText(
                "Green Fireball: locked",
                585,
                116
            );
        }
    }

    // =================================================
    // FIREBALL CHARGE BAR
    // =================================================

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

        const barWidth =
            240;

        const x =
            canvas.width / 2 -
            barWidth / 2;

        const y =
            15;

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

    // =================================================
    // MAP CHANGE MESSAGE
    // =================================================

    if (
        Date.now() <
        platformMessageUntil
    ) {

        ctx.fillStyle =
            "rgba(0,0,0,0.8)";

        ctx.fillRect(
            250,
            255,
            300,
            60
        );

        ctx.fillStyle =
            "#ffffff";

        ctx.font =
            "bold 22px Arial";

        ctx.textAlign =
            "center";

        ctx.fillText(
            "NEW PLATFORM LAYOUT!",
            canvas.width / 2,
            292
        );

        ctx.textAlign =
            "left";
    }

    // =================================================
    // DEATH SCREEN
    // =================================================

    if (
        me &&
        me.dead
    ) {

        ctx.fillStyle =
            "rgba(0,0,0,0.72)";

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
            canvas.height / 2 - 70
        );

        ctx.fillStyle =
            "#ffffff";

        ctx.font =
            "18px Arial";

        ctx.fillText(
            "You lost all powerups.",
            canvas.width / 2,
            canvas.height / 2 - 35
        );

        const allowedAt =
            me.respawnAllowedAt || 0;

        const remainingMs =
            Math.max(
                0,
                allowedAt -
                    Date.now()
            );

        const remainingSeconds =
            Math.ceil(
                remainingMs /
                1000
            );

        respawnButton = {

            x:
                canvas.width / 2 -
                105,

            y:
                canvas.height / 2 +
                5,

            width:
                210,

            height:
                58,

            enabled:
                remainingMs <= 0
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

        ctx.font =
            "bold 20px Arial";

        if (
            respawnButton.enabled
        ) {

            ctx.fillText(
                "RESPAWN",
                canvas.width / 2,
                respawnButton.y + 36
            );

        } else {

            ctx.fillText(
                "RESPAWN IN " +
                    remainingSeconds,
                canvas.width / 2,
                respawnButton.y + 36
            );
        }

        ctx.font =
            "14px Arial";

        ctx.fillStyle =
            "#ffffff";

        ctx.fillText(
            "Your dropped powerup stays on the map.",
            canvas.width / 2,
            respawnButton.y + 90
        );

        ctx.textAlign =
            "left";

    } else {

        respawnButton =
            null;
    }
}

// =====================================================
// RESPAWN BUTTON
// =====================================================

canvas.addEventListener(
    "click",
    (event) => {

        const me =
            players[myId];

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

    updatePowerupPickup();

    draw();

    requestAnimationFrame(
        gameLoop
    );
}

gameLoop();

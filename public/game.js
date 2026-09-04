const socket = io();

const canvas =
    document.getElementById(
        "gameCanvas"
    );

const ctx =
    canvas.getContext("2d");

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
let mapChangeMessageUntil = 0;

let mapIsLarge = false;

let powerupPickupAttempts = {};

// =====================================================
// GOLD PLATFORM DATA
// =====================================================

let goldControllerId = null;
let goldProgress = 0;
let goldRemaining = 30;

let goldRewardMessage = "";
let goldRewardMessageUntil = 0;

// =====================================================
// CONTROLS
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
// DASH
// =====================================================

function getDashCooldown(
    player
) {

    if (
        !player ||
        player.dashLevel <= 0
    ) {
        return 0;
    }

    return Math.max(
        4,
        8 -
        player.dashLevel
    ) * 1000;
}

function getDashPower(
    player
) {

    if (
        !player ||
        player.dashLevel <= 0
    ) {
        return 0;
    }

    const upgrades =
        Math.min(
            Math.max(
                player.dashLevel - 1,
                0
            ),
            MAX_DASH_DISTANCE_UPGRADES
        );

    return (
        BASE_DASH_POWER *
        (
            1 +
            upgrades * 0.25
        )
    );
}

// =====================================================
// GREEN FIREBALL COOLDOWN
// =====================================================

function getGreenCooldown(
    player
) {

    if (
        !player ||
        player.greenLevel <= 0
    ) {
        return 0;
    }

    return Math.max(
        1000,
        2500 -
        player.greenLevel *
        500
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
// MAP
// =====================================================

socket.on(
    "mapState",
    (data) => {

        canvas.width =
            data.width;

        canvas.height =
            data.height;

        platforms =
            data.platforms || [];

        mapIsLarge =
            !!data.largeMap;
    }
);

socket.on(
    "mapChanged",
    (data) => {

        canvas.width =
            data.width;

        canvas.height =
            data.height;

        platforms =
            data.platforms || [];

        powerups =
            data.powerups || {};

        mapIsLarge =
            !!data.largeMap;

        mapChangeMessageUntil =
            Date.now() +
            4000;

        goldControllerId = null;
        goldProgress = 0;
        goldRemaining = 30;

        if (
            data.playerPositions
        ) {

            for (
                const id in
                data.playerPositions
            ) {

                const position =
                    data.playerPositions[
                        id
                    ];

                if (
                    players[id]
                ) {

                    players[id].x =
                        position.x;

                    players[id].y =
                        position.y;

                    players[id].facing =
                        position.facing;
                }
            }
        }

        velocityX = 0;
        velocityY = 0;
        onGround = false;
    }
);

socket.on(
    "platformLayoutChanged",
    (newPlatforms) => {

        platforms =
            newPlatforms;

        platformMessageUntil =
            Date.now() +
            3000;

        goldControllerId = null;
        goldProgress = 0;
        goldRemaining = 30;

        const me =
            players[myId];

        if (
            me &&
            !me.dead
        ) {

            me.x =
                100 +
                Math.random() *
                Math.min(
                    300,
                    canvas.width -
                    200
                );

            me.y =
                canvas.height -
                100;

            velocityX = 0;
            velocityY = 0;

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
    }
);

// =====================================================
// GOLD PLATFORM EVENTS
// =====================================================

socket.on(
    "goldPlatformStatus",
    (data) => {

        goldControllerId =
            data.controllerId;

        goldProgress =
            data.progress || 0;

        goldRemaining =
            data.remaining !==
            undefined
                ? data.remaining
                : 30;
    }
);

socket.on(
    "goldPlatformReward",
    (data) => {

        if (
            data.playerId ===
            myId
        ) {

            let rewardName =
                "POWERUP";

            if (
                data.type ===
                "health"
            ) {

                rewardName =
                    "HEALTH";
            }

            if (
                data.type ===
                "dash"
            ) {

                rewardName =
                    "DASH";
            }

            if (
                data.type ===
                "greenFireball"
            ) {

                rewardName =
                    "GREEN FIREBALL";
            }

            goldRewardMessage =
                "GOLD REWARD: " +
                rewardName +
                "!";

            goldRewardMessageUntil =
                Date.now() +
                3500;
        }
    }
);

// =====================================================
// POWERUPS
// =====================================================

socket.on(
    "currentPowerups",
    (serverPowerups) => {

        powerups =
            serverPowerups ||
            {};
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
// PLAYERS
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

        players[
            data.id
        ].facing =
            data.facing;
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
// HEALTH
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
// SWORD
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
// FIREBALLS
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

        if (
            event.code ===
            "Space" &&
            !spaceHeld
        ) {

            spaceHeld = true;

            spacePressedAt =
                Date.now();
        }

        if (
            event.code ===
            "KeyF" &&
            !event.repeat
        ) {

            performFAction();
        }

        if (
            event.code ===
            "KeyG" &&
            !event.repeat
        ) {

            performDash();
        }
    }
);

document.addEventListener(
    "keyup",
    (event) => {

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

                spaceHeld = false;

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

            spaceHeld = false;
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

    if (
        Date.now() -
        lastDashTime <
        cooldown
    ) {
        return;
    }

    lastDashTime =
        Date.now();

    const dashPower =
        getDashPower(me);

    if (
        jumpHeld() &&
        !leftHeld() &&
        !rightHeld()
    ) {

        velocityX = 0;

        velocityY =
            -dashPower;

        onGround = false;

        return;
    }

    let direction =
        facing;

    if (
        leftHeld() &&
        !rightHeld()
    ) {

        direction = -1;
    }

    if (
        rightHeld() &&
        !leftHeld()
    ) {

        direction = 1;
    }

    facing =
        direction;

    velocityX =
        direction *
        dashPower;
}

// =====================================================
// F ACTION
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
// SHOVE
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

        const dx =
            (
                target.x +
                PLAYER_SIZE / 2
            ) -
            (
                me.x +
                PLAYER_SIZE / 2
            );

        const dy =
            (
                target.y +
                PLAYER_SIZE / 2
            ) -
            (
                me.y +
                PLAYER_SIZE / 2
            );

        const distance =
            Math.sqrt(
                dx * dx +
                dy * dy
            );

        if (
            distance <=
            NORMAL_SHOVE_RANGE
        ) {

            socket.emit(
                "knockbackPlayer",
                {
                    targetId:
                        id,

                    velocityX:
                        (
                            dx >= 0
                                ? 1
                                : -1
                        ) *
                        NORMAL_KNOCKBACK,

                    velocityY:
                        -4
                }
            );
        }
    }
}

// =====================================================
// MELEE
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

    if (
        Date.now() -
        lastMeleeTime <
        MELEE_COOLDOWN
    ) {
        return;
    }

    lastMeleeTime =
        Date.now();

    meleeSwings[
        myId
    ] = {
        start:
            Date.now(),

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

    let closestTarget = null;
    let closestDistance = Infinity;

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
        closestTarget
    ) {

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
}

// =====================================================
// NORMAL FIREBALL
// =====================================================

function shootNormalFireball() {

    const me =
        players[myId];

    if (!me) {
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
        me.greenLevel <= 0
    ) {
        return;
    }

    const cooldown =
        getGreenCooldown(me);

    if (
        Date.now() -
        lastGreenFireballTime <
        cooldown
    ) {
        return;
    }

    lastGreenFireballTime =
        Date.now();

    let velocityX =
        facing *
        FIREBALL_SPEED;

    let velocityY = 0;

    if (
        Math.random() <
        0.25
    ) {

        let nearestPlayer = null;
        let nearestDistance = Infinity;

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

            const dx =
                nearestPlayer.x -
                me.x;

            const dy =
                nearestPlayer.y -
                me.y;

            const length =
                Math.sqrt(
                    dx * dx +
                    dy * dy
                ) || 1;

            velocityX =
                dx /
                length *
                FIREBALL_SPEED;

            velocityY =
                dy /
                length *
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
            11
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

            const dx =
                fireball.x -
                (
                    target.x +
                    PLAYER_SIZE / 2
                );

            const dy =
                fireball.y -
                (
                    target.y +
                    PLAYER_SIZE / 2
                );

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

                    socket.emit(
                        "knockbackPlayer",
                        {
                            targetId:
                                id,

                            velocityX:
                                (
                                    fireball.velocityX >=
                                    0
                                        ? 1
                                        : -1
                                ) *
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
// POWERUP PICKUP
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
                Date.now() -
                lastAttempt >
                500
            ) {

                powerupPickupAttempts[
                    id
                ] =
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
// MOVEMENT
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

    if (
        leftHeld() &&
        !rightHeld()
    ) {

        velocityX =
            -MOVE_SPEED;

        facing = -1;

    } else if (
        rightHeld() &&
        !leftHeld()
    ) {

        velocityX =
            MOVE_SPEED;

        facing = 1;

    } else {

        velocityX *=
            0.8;
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

    me.x =
        Math.max(
            0,
            Math.min(
                canvas.width -
                PLAYER_SIZE,
                me.x
            )
        );

    const oldY =
        me.y;

    velocityY +=
        GRAVITY;

    me.y +=
        velocityY;

    onGround = false;

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

                velocityY = 0;

                onGround = true;

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
            Math.random() *
            Math.min(
                300,
                canvas.width -
                200
            );

        me.y =
            canvas.height -
            100;

        velocityX = 0;
        velocityY = 0;
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
// EYE
// =====================================================

function drawEye(player) {

    const eyeWidth = 5;
    const eyeHeight = 13;

    const eyeX =
        player.facing === -1
            ? player.x + 4

            : player.x +
              PLAYER_SIZE -
              eyeWidth -
              4;

    const eyeY =
        player.y + 7;

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

        const amount =
            health -
            heart * 2;

        ctx.fillStyle =
            amount >= 2
                ? "#ff3030"

                : amount === 1
                    ? "#ff9f1c"

                    : "#666666";

        ctx.fillText(
            amount > 0
                ? "♥"
                : "♡",

            x +
            column * 23,

            y +
            row * 23
        );
    }
}

// =====================================================
// SWORD
// =====================================================

function drawSword(
    player,
    swing
) {

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

    const startAngle =
        swing.facing === 1
            ? -1.1
            : Math.PI + 1.1;

    const endAngle =
        swing.facing === 1
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

    const endX =
        handX +
        Math.cos(angle) *
        46;

    const endY =
        handY +
        Math.sin(angle) *
        46;

    ctx.strokeStyle =
        "#ffffff";

    ctx.lineWidth = 5;

    ctx.beginPath();

    ctx.moveTo(
        handX,
        handY
    );

    ctx.lineTo(
        endX,
        endY
    );

    ctx.stroke();
}

// =====================================================
// POWERUPS
// =====================================================

function drawPowerup(
    powerup
) {

    ctx.beginPath();

    ctx.arc(
        powerup.x,
        powerup.y,
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

    ctx.fillStyle =
        "#ffffff";

    ctx.font =
        "bold 15px Arial";

    ctx.textAlign =
        "center";

    ctx.fillText(
        powerup.type ===
        "health"
            ? "+"

            : powerup.type ===
              "dash"
                ? "G"
                : "F",

        powerup.x,
        powerup.y + 5
    );

    ctx.textAlign =
        "left";
}

// =====================================================
// DRAW GOLD PLATFORM BAR
// =====================================================

function drawGoldStatus() {

    if (
        goldControllerId !==
        myId
    ) {
        return;
    }

    const width = 280;

    const x =
        canvas.width / 2 -
        width / 2;

    const y = 50;

    ctx.fillStyle =
        "rgba(0,0,0,0.80)";

    ctx.fillRect(
        x,
        y,
        width,
        55
    );

    ctx.fillStyle =
        "#ffffff";

    ctx.font =
        "bold 14px Arial";

    ctx.textAlign =
        "center";

    ctx.fillText(
        "GOLD PLATFORM CONTROL",
        canvas.width / 2,
        y + 19
    );

    ctx.fillStyle =
        "#333333";

    ctx.fillRect(
        x + 15,
        y + 29,
        width - 30,
        14
    );

    ctx.fillStyle =
        "#ffd700";

    ctx.fillRect(
        x + 15,
        y + 29,

        (
            width - 30
        ) *
        goldProgress,

        14
    );

    ctx.strokeStyle =
        "#ffffff";

    ctx.strokeRect(
        x + 15,
        y + 29,
        width - 30,
        14
    );

    ctx.fillStyle =
        "#ffffff";

    ctx.font =
        "11px Arial";

    ctx.fillText(
        goldRemaining.toFixed(
            1
        ) +
        " seconds",

        canvas.width / 2,
        y + 53
    );

    ctx.textAlign =
        "left";
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

    // =================================================
    // PLATFORMS
    // =================================================

    for (
        const platform
        of platforms
    ) {

        if (
            platform.isGold
        ) {

            ctx.fillStyle =
                "#ffd700";

        } else {

            ctx.fillStyle =
                "#dddddd";
        }

        ctx.fillRect(
            platform.x,
            platform.y,
            platform.width,
            platform.height
        );

        if (
            platform.isGold
        ) {

            ctx.strokeStyle =
                "#fff4a3";

            ctx.lineWidth =
                3;

            ctx.strokeRect(
                platform.x,
                platform.y,
                platform.width,
                platform.height
            );
        }
    }

    // =================================================
    // POWERUPS
    // =================================================

    for (
        const id in powerups
    ) {

        drawPowerup(
            powerups[id]
        );
    }

    // =================================================
    // PLAYERS
    // =================================================

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

        ctx.globalAlpha = 1;

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
            "#32d74b";

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

        if (
            meleeSwings[id] &&
            !player.greenLevel
        ) {

            drawSword(
                player,
                meleeSwings[id]
            );
        }
    }

    // =================================================
    // FIREBALLS
    // =================================================

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
            fireball.type ===
            "green"
                ? "#00ff55"
                : "#ff7b00";

        ctx.fill();
    }

    const me =
        players[myId];

    // =================================================
    // HEALTH HUD
    // =================================================

    if (me) {

        ctx.fillStyle =
            "rgba(0,0,0,0.76)";

        ctx.fillRect(
            12,
            10,
            295,
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
            me.health,
            me.maxHealth
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

        const hudX =
            canvas.width -
            250;

        ctx.fillStyle =
            "rgba(0,0,0,0.76)";

        ctx.fillRect(
            hudX,
            10,
            238,
            130
        );

        ctx.fillStyle =
            "#ffffff";

        ctx.font =
            "bold 14px Arial";

        ctx.fillText(
            "POWERUPS",
            hudX + 15,
            31
        );

        ctx.font =
            "12px Arial";

        ctx.fillStyle =
            "#ff6b63";

        ctx.fillText(
            "Health: +" +
            Math.max(
                0,
                (
                    me.maxHealth -
                    BASE_MAX_HEALTH
                ) / 2
            ) +
            " hearts",

            hudX + 15,
            54
        );

        ctx.fillStyle =
            "#4fd5ff";

        ctx.fillText(
            me.dashLevel > 0
                ? "Dash Lv " +
                  me.dashLevel

                : "Dash: locked",

            hudX + 15,
            77
        );

        ctx.fillStyle =
            "#32ff5a";

        ctx.fillText(
            me.greenLevel > 0
                ? "Green Fireball Lv " +
                  me.greenLevel

                : "Green Fireball: locked",

            hudX + 15,
            100
        );

        ctx.fillStyle =
            "#ffd700";

        ctx.fillText(
            "Gold platform = 30 sec reward",
            hudX + 15,
            123
        );
    }

    // =================================================
    // GOLD CONTROL BAR
    // =================================================

    drawGoldStatus();

    // =================================================
    // GOLD REWARD MESSAGE
    // =================================================

    if (
        Date.now() <
        goldRewardMessageUntil
    ) {

        ctx.fillStyle =
            "rgba(0,0,0,0.85)";

        ctx.fillRect(
            canvas.width / 2 -
            190,
            canvas.height / 2 -
            40,
            380,
            80
        );

        ctx.fillStyle =
            "#ffd700";

        ctx.font =
            "bold 24px Arial";

        ctx.textAlign =
            "center";

        ctx.fillText(
            goldRewardMessage,
            canvas.width / 2,
            canvas.height / 2 + 8
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
            canvas.height / 2 -
            70
        );

        const allowedAt =
            me.respawnAllowedAt ||
            0;

        const remainingMs =
            Math.max(
                0,
                allowedAt -
                Date.now()
            );

        respawnButton = {

            x:
                canvas.width / 2 -
                105,

            y:
                canvas.height / 2,

            width: 210,

            height: 58,

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
            "#ffffff";

        ctx.font =
            "bold 20px Arial";

        ctx.fillText(
            respawnButton.enabled
                ? "RESPAWN"

                : "RESPAWN IN " +
                  Math.ceil(
                      remainingMs /
                      1000
                  ),

            canvas.width / 2,

            respawnButton.y +
            36
        );

        ctx.textAlign =
            "left";
    }
}

// =====================================================
// RESPAWN CLICK
// =====================================================

canvas.addEventListener(
    "click",
    (event) => {

        if (
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

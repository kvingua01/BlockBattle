const socket = io();

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const players = {};
const fireballs = [];

const platforms = [
    { x: 50, y: 550, width: 700, height: 20 },
    { x: 100, y: 470, width: 180, height: 20 },
    { x: 400, y: 450, width: 180, height: 20 },
    { x: 250, y: 360, width: 180, height: 20 },
    { x: 520, y: 300, width: 160, height: 20 },
    { x: 120, y: 260, width: 180, height: 20 },
    { x: 320, y: 180, width: 180, height: 20 },
    { x: 540, y: 120, width: 160, height: 20 },
    { x: 300, y: 50, width: 200, height: 20 }
];

let me = {
    x: 100,
    y: 500,
    width: 30,
    height: 40,
    velocityX: 0,
    velocityY: 0,
    speed: 0.6,
    jumpPower: 11,
    onGround: false,
    facing: 1
};

const keys = {};

let spaceHeld = false;
let spaceStartTime = 0;

const NORMAL_KNOCKBACK = 5;
const FIREBALL_KNOCKBACK = NORMAL_KNOCKBACK * 5;
const FIREBALL_SPEED = 9;
const FIREBALL_CHARGE_TIME = 1000;

document.addEventListener("keydown", (event) => {
    keys[event.code] = true;

    if (event.code === "Space") {
        event.preventDefault();

        if (!spaceHeld) {
            spaceHeld = true;
            spaceStartTime = Date.now();
        }
    }
});

document.addEventListener("keyup", (event) => {
    keys[event.code] = false;

    if (event.code === "Space") {
        event.preventDefault();

        const heldTime = Date.now() - spaceStartTime;

        if (heldTime >= FIREBALL_CHARGE_TIME) {
            shootFireball();
        } else {
            normalKnockback();
        }

        spaceHeld = false;
    }
});

socket.on("currentPlayers", (serverPlayers) => {
    Object.assign(players, serverPlayers);

    if (players[socket.id]) {
        me.x = players[socket.id].x;
        me.y = players[socket.id].y;
    }
});

socket.on("newPlayer", (player) => {
    players[player.id] = player;
});

socket.on("playerMoved", (player) => {
    if (players[player.id]) {
        players[player.id].x = player.x;
        players[player.id].y = player.y;
    }
});

socket.on("playerDisconnected", (id) => {
    delete players[id];
});

function normalKnockback() {
    for (const id in players) {
        if (id === socket.id) continue;

        const player = players[id];

        const myCenterX = me.x + me.width / 2;
        const myCenterY = me.y + me.height / 2;

        const otherCenterX = player.x + 15;
        const otherCenterY = player.y + 20;

        const dx = otherCenterX - myCenterX;
        const dy = otherCenterY - myCenterY;

        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < 70) {
            const direction = dx >= 0 ? 1 : -1;

            socket.emit("knockbackPlayer", {
                targetId: id,
                velocityX: direction * NORMAL_KNOCKBACK,
                velocityY: -3
            });
        }
    }
}

function shootFireball() {
    const fireball = {
        x: me.x + me.width / 2,
        y: me.y + me.height / 2,
        radius: 8,
        velocityX: me.facing * FIREBALL_SPEED,
        ownerId: socket.id
    };

    fireballs.push(fireball);

    socket.emit("shootFireball", fireball);
}

socket.on("spawnFireball", (fireball) => {
    if (fireball.ownerId !== socket.id) {
        fireballs.push(fireball);
    }
});

socket.on("receiveKnockback", (data) => {
    me.velocityX += data.velocityX;
    me.velocityY += data.velocityY;
});

function update() {
    if (keys["KeyA"]) {
        me.velocityX -= me.speed;
        me.facing = -1;
    }

    if (keys["KeyD"]) {
        me.velocityX += me.speed;
        me.facing = 1;
    }

    me.velocityX *= 0.85;

    if (keys["KeyW"] && me.onGround) {
        me.velocityY = -me.jumpPower;
        me.onGround = false;
    }

    me.velocityY += 0.5;

    me.x += me.velocityX;
    me.y += me.velocityY;

    if (me.x < 0) {
        me.x = 0;
        me.velocityX = 0;
    }

    if (me.x + me.width > canvas.width) {
        me.x = canvas.width - me.width;
        me.velocityX = 0;
    }

    me.onGround = false;

    platforms.forEach((platform) => {
        const playerBottom = me.y + me.height;
        const previousBottom = playerBottom - me.velocityY;

        const insidePlatform =
            me.x + me.width > platform.x &&
            me.x < platform.x + platform.width;

        if (
            insidePlatform &&
            me.velocityY >= 0 &&
            previousBottom <= platform.y &&
            playerBottom >= platform.y
        ) {
            me.y = platform.y - me.height;
            me.velocityY = 0;
            me.onGround = true;
        }
    });

    if (me.y > canvas.height) {
        me.x = 100;
        me.y = 500;
        me.velocityX = 0;
        me.velocityY = 0;
    }

    updateFireballs();

    if (players[socket.id]) {
        players[socket.id].x = me.x;
        players[socket.id].y = me.y;
    }

    socket.emit("playerMove", {
        x: me.x,
        y: me.y
    });
}

function updateFireballs() {
    for (let i = fireballs.length - 1; i >= 0; i--) {
        const fireball = fireballs[i];

        fireball.x += fireball.velocityX;

        if (fireball.ownerId === socket.id) {
            for (const id in players) {
                if (id === socket.id) continue;

                const player = players[id];

                const closestX = Math.max(
                    player.x,
                    Math.min(fireball.x, player.x + 30)
                );

                const closestY = Math.max(
                    player.y,
                    Math.min(fireball.y, player.y + 40)
                );

                const dx = fireball.x - closestX;
                const dy = fireball.y - closestY;

                const hit =
                    dx * dx + dy * dy <
                    fireball.radius * fireball.radius;

                if (hit) {
                    const direction =
                        fireball.velocityX >= 0 ? 1 : -1;

                    socket.emit("knockbackPlayer", {
                        targetId: id,
                        velocityX:
                            direction *
                            FIREBALL_KNOCKBACK,
                        velocityY: -8
                    });

                    socket.emit("removeFireball", {
                        ownerId: fireball.ownerId,
                        x: fireball.x
                    });

                    fireballs.splice(i, 1);
                    break;
                }
            }
        }

        if (
            fireball &&
            (fireball.x < -50 ||
                fireball.x > canvas.width + 50)
        ) {
            fireballs.splice(i, 1);
        }
    }
}

socket.on("removeFireball", (data) => {
    for (let i = fireballs.length - 1; i >= 0; i--) {
        if (fireballs[i].ownerId === data.ownerId) {
            fireballs.splice(i, 1);
            break;
        }
    }
});

function draw() {
    ctx.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
    );

    ctx.fillStyle = "#87CEEB";
    ctx.fillRect(
        0,
        0,
        canvas.width,
        canvas.height
    );

    platforms.forEach((platform, index) => {
        ctx.fillStyle =
            index === platforms.length - 1
                ? "gold"
                : "#555";

        ctx.fillRect(
            platform.x,
            platform.y,
            platform.width,
            platform.height
        );
    });

    for (const id in players) {
        const player = players[id];

        ctx.fillStyle =
            player.color || "red";

        ctx.fillRect(
            player.x,
            player.y,
            30,
            40
        );
    }

    for (const fireball of fireballs) {
        ctx.beginPath();
        ctx.arc(
            fireball.x,
            fireball.y,
            fireball.radius,
            0,
            Math.PI * 2
        );

        ctx.fillStyle = "orange";
        ctx.fill();

        ctx.beginPath();
        ctx.arc(
            fireball.x,
            fireball.y,
            4,
            0,
            Math.PI * 2
        );

        ctx.fillStyle = "yellow";
        ctx.fill();
    }

    if (spaceHeld) {
        const heldTime =
            Date.now() - spaceStartTime;

        const charge =
            Math.min(
                heldTime /
                    FIREBALL_CHARGE_TIME,
                1
            );

        ctx.fillStyle = "white";
        ctx.fillRect(
            20,
            20,
            200,
            20
        );

        ctx.fillStyle =
            charge >= 1
                ? "orange"
                : "red";

        ctx.fillRect(
            20,
            20,
            200 * charge,
            20
        );

        ctx.fillStyle = "black";
        ctx.font = "14px Arial";
        ctx.fillText(
            charge >= 1
                ? "FIREBALL READY!"
                : "Charging...",
            25,
            35
        );
    }
}

function gameLoop() {
    update();
    draw();

    requestAnimationFrame(gameLoop);
}

gameLoop();
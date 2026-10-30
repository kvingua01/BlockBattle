const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../public/game.js'), 'utf8');
const playerUpdate = source.slice(source.indexOf('function updatePlayer()'), source.indexOf('// ORIGINAL GRAPHICS', source.indexOf('function updatePlayer()')));
const fireballUpdate = source.slice(source.indexOf('function updateFireballs()'), source.indexOf('function updatePowerupPickup()'));
const loop = source.slice(source.indexOf('const PHYSICS_STEP_MS'));

function simulation() {
    const state = {
        players: { me: { x: 100, y: 500, health: 20 } }, myId: 'me',
        fireballs: [{ x: 0, y: 0, velocityX: 9, velocityY: 0, ownerId: 'other' }],
        canvas: { width: 10000, height: 10000 }, platforms: [],
        velocityX: 0, velocityY: 0, facing: 1, onGround: true,
        MOVE_SPEED: 4, PLAYER_SIZE: 30, JUMP_POWER: 11, GRAVITY: 0.5,
        keys: {}, dropThroughPlatform: null, dropThroughUntil: 0,
        leftHeld: () => false, rightHeld: () => true, jumpHeld: () => true,
        socket: { emit() {} }, updatePowerupPickup() {}, draw() {},
        requestAnimationFrame() {}, document: { addEventListener(event, callback) { state.visibilityChange = callback; } },
    };
    vm.createContext(state);
    vm.runInContext(playerUpdate + fireballUpdate + loop, state);
    return state;
}

for (const fps of [5, 15, 30, 60, 120, 144, 240, 360]) {
    test(`movement, jump/gravity and projectiles match 60 Hz at ${fps} FPS`, () => {
        const state = simulation();
        state.gameLoop(0);
        for (let frame = 1; frame <= fps; frame++) state.gameLoop(frame * 1000 / fps);
        assert.equal(state.players.me.x, 340); // 60 steps at 4 pixels
        assert.equal(state.fireballs[0].x, 540); // 60 steps at 9 pixels
        assert.equal(state.players.me.y, 755); // same jump and gravity trajectory
        assert.equal(state.velocityY, 19);
    });
}

test('long stalls cannot cause a giant catch-up jump', () => {
    const state = simulation();
    state.gameLoop(0);
    state.gameLoop(60000);
    assert.equal(state.players.me.x, 160); // at most 15 physics steps
});

test('returning from a hidden tab discards paused time', () => {
    const state = simulation();
    state.gameLoop(0);
    state.visibilityChange();
    state.gameLoop(60000);
    assert.equal(state.players.me.x, 100);
    state.gameLoop(60000 + 1000 / 60);
    assert.equal(state.players.me.x, 104);
});

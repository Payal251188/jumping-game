const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JumpGame } = require('../engine.js');
const create = () => new JumpGame({ random: () => 0.5 });
function advance(game, seconds) {
  for (let t = 0; t < seconds && game.status === 'playing'; t += 1 / 120) game.step(1 / 120);
}

test('starts on solid ground and runs automatically', () => {
  const g = create();
  assert.equal(g.status, 'playing');
  assert.equal(g.player.grounded, true);
  assert.equal(g.score, 0);
  advance(g, 0.5);
  assert.ok(g.player.x > 200);
  assert.equal(g.player.y, 378);
  assert.equal(g.player.grounded, true);
  assert.ok(g.distance >= 10);
});

test('supports a ground jump and one air jump, not unlimited jumps', () => {
  const g = create();
  assert.equal(g.jump(), true);
  advance(g, 0.15);
  assert.ok(g.player.y < 378);
  assert.equal(g.jump(), true);
  assert.equal(g.player.jumps, 2);
  assert.equal(g.jump(), false);
  const jumps = g.drainEvents().filter((e) => e.type === 'jump');
  assert.equal(jumps.length, 2);
  assert.equal(jumps[1].double, true);
});

test('landing restores both jumps without sinking into the ground', () => {
  const g = create();
  g.jump();
  advance(g, 0.8);
  assert.equal(g.player.grounded, true);
  assert.equal(g.player.y + g.player.h, 420);
  assert.equal(g.player.vy, 0);
  assert.equal(g.player.jumps, 0);
  assert.equal(g.jump(), true);
});

test('a short coyote window allows a first jump just after leaving an edge', () => {
  const g = create();
  g.player.x = 851;
  g.obstacles = [];
  g.step(0.025);
  assert.equal(g.player.grounded, false);
  assert.ok(g.coyote > 0);
  assert.equal(g.jump(), true);
  assert.equal(g.player.jumps, 1);
});

test('walking off an edge only leaves the air jump after coyote time expires', () => {
  const g = create();
  g.player.x = 851;
  g.obstacles = [];
  advance(g, 0.15);
  assert.equal(g.coyote, 0);
  assert.equal(g.jump(), true);
  assert.equal(g.player.jumps, 2);
  assert.equal(g.jump(), false);
});

test('a jump buffered just before landing is performed on landing', () => {
  const g = create();
  g.player.y = 372;
  g.player.vy = 180;
  g.player.grounded = false;
  g.player.jumps = 2;
  g.coyote = 0;
  assert.equal(g.jump(), false);
  advance(g, 0.05);
  assert.ok(g.player.vy < 0);
  assert.equal(g.player.jumps, 1);
});

test('running into a stump ends the run, jumping clears it', () => {
  const g = create();
  advance(g, 2.5);
  assert.equal(g.status, 'over');
  assert.equal(g.drainEvents().at(-1).reason, 'stump');
  const before = { ...g.player };
  g.step(0.1);
  assert.deepEqual(g.player, before);
  assert.equal(g.jump(), false);

  const jumper = create();
  while (jumper.player.x < 490) jumper.step(1 / 120);
  jumper.jump();
  while (jumper.player.x < 650 && jumper.status === 'playing') jumper.step(1 / 120);
  assert.equal(jumper.status, 'playing');
  assert.ok(jumper.player.x >= 650);
});

test('falling into a gap ends the run; a well-timed jump crosses it', () => {
  const faller = create();
  faller.player.x = 850;
  faller.obstacles = [];
  advance(faller, 1);
  assert.equal(faller.status, 'over');
  assert.equal(faller.drainEvents().at(-1).reason, 'fall');

  const jumper = create();
  jumper.player.x = 810;
  jumper.obstacles = [];
  jumper.jump();
  advance(jumper, 0.9);
  assert.equal(jumper.status, 'playing');
  assert.equal(jumper.player.grounded, true);
  assert.ok(jumper.player.x > 980);
});

test('gems award 25 points and cannot be collected twice', () => {
  const g = create();
  g.gems = [{ x: 118, y: 398, taken: false }];
  g.step(1 / 120);
  assert.equal(g.collected, 1);
  assert.equal(g.score, 25);
  g.step(1 / 120);
  assert.equal(g.collected, 1);
  assert.equal(g.drainEvents().filter((e) => e.type === 'gem').length, 1);
  assert.deepEqual(g.drainEvents(), []);
});

test('generated terrain has bounded, jumpable gaps and safely inset obstacles', () => {
  for (const random of [() => 0, () => 0.5, () => 0.999]) {
    const g = new JumpGame({ random });
    for (let i = 1; i < g.platforms.length; i++) {
      const p = g.platforms[i];
      const previous = g.platforms[i - 1];
      const gap = p.x - previous.x - previous.w;
      assert.ok(gap >= 90 && gap <= 135);
      assert.ok(p.y >= 400 && p.y <= 435);
      assert.ok(p.w >= 330 && p.w <= 520);
    }
    for (const o of g.obstacles) {
      const p = g.platforms.find((p) => o.x >= p.x && o.x + o.w <= p.x + p.w);
      assert.ok(p);
      assert.ok(o.x - p.x > 120);
      assert.ok(p.x + p.w - o.x - o.w > 120);
    }
  }
});

test('long runs prune old terrain and cap speed', () => {
  const g = create();
  for (let i = 0; i < 100; i++) {
    g.player.x += 1000;
    g.player.y = 100;
    g.player.vy = 0;
    g.obstacles = [];
    g.generate();
    g.step(1 / 120);
  }
  assert.equal(g.speed, 340);
  assert.ok(g.platforms.length < 10);
  assert.ok(g.gems.length < 30);
  assert.ok(g.obstacles.length < 10);
});

test('reset restores the starting run and invalid time steps are harmless', () => {
  const g = create();
  advance(g, 3);
  g.reset();
  assert.equal(g.player.x, 100);
  assert.equal(g.score, 0);
  assert.equal(g.collected, 0);
  assert.equal(g.status, 'playing');
  for (const dt of [0, -1, NaN, Infinity]) g.step(dt);
  assert.equal(g.player.x, 100);
  assert.equal(g.time, 0);
});

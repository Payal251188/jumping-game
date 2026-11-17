const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const { JumpGame } = require('../engine.js');

function load({ storage = new Map(), blocked = false } = {}) {
  const elements = new Map();
  const noop = () => {};
  let focused;
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      textContent: '', hidden: false, disabled: false, dataset: {}, attrs: {}, listeners: {},
      tagName: id.endsWith('Button') ? 'BUTTON' : 'CANVAS',
      setAttribute(name, value) { this.attrs[name] = value; },
      addEventListener(name, fn) { this.listeners[name] = fn; },
      focus() { focused = id; },
      closest() { return this.tagName === 'BUTTON' ? this : null; },
      getBoundingClientRect: () => ({ width: 960, height: 540 }),
    });
    return elements.get(id);
  }
  const gradient = () => ({ addColorStop: noop });
  const ctx = new Proxy({}, { get: (_, name) => name.startsWith('create') ? gradient : noop, set: () => true });
  element('game').getContext = () => ctx;
  const events = {};
  const docEvents = {};
  const document = {
    getElementById: element, querySelector: element, hidden: false,
    addEventListener: (name, fn) => { docEvents[name] = fn; },
  };
  let game;
  let frame;
  let time = 0;
  const sandbox = {
    JumpGame: class extends JumpGame { constructor() { super({ random: () => 0.5 }); game = this; } },
    document,
    window: { matchMedia: () => ({ matches: true }), devicePixelRatio: 1,
      addEventListener: (name, fn) => { events[name] = fn; } },
    localStorage: {
      getItem: (key) => { if (blocked) throw Error('Blocked'); return storage.get(key) ?? null; },
      setItem: (key, value) => { if (blocked) throw Error('Blocked'); storage.set(key, value); },
    },
    ResizeObserver: class { observe() {} },
    requestAnimationFrame: (callback) => { frame = callback; },
  };
  vm.runInNewContext(readFileSync(join(__dirname, '..', 'game.js'), 'utf8'), sandbox);
  return {
    game, element, storage, events, document, docEvents,
    click: (id) => element(id).listeners.click(),
    key: (key, extra = {}) => events.keydown({ key, target: element('game'), preventDefault: noop, ...extra }),
    state: () => element('.game-card').dataset.state,
    focus: () => focused,
    advance(seconds) { for (let i = 0; i < Math.ceil(seconds * 60); i++) { time += 1000 / 60; frame(time); } },
  };
}

test('start, jump, double jump, pause, resume and restart work through the UI', () => {
  const ui = load();
  assert.equal(ui.state(), 'ready');
  ui.click('playButton');
  assert.equal(ui.state(), 'playing');
  assert.equal(ui.focus(), 'game');
  assert.equal(ui.element('overlay').hidden, true);
  ui.key(' ');
  ui.advance(0.1);
  assert.ok(ui.game.player.y < 378);
  ui.key('w');
  assert.equal(ui.game.player.jumps, 2);
  ui.key('p');
  assert.equal(ui.state(), 'paused');
  const before = { ...ui.game.player };
  ui.advance(2);
  assert.deepEqual(ui.game.player, before);
  ui.click('playButton');
  ui.advance(0.1);
  assert.equal(ui.state(), 'playing');
  assert.ok(ui.game.player.x > before.x);
  ui.key('r');
  assert.equal(ui.game.player.x, 100);
  assert.equal(ui.game.score, 0);
  assert.equal(ui.game.player.jumps, 0);
});

test('collisions show replay, persist a best score and reset cleanly', () => {
  const ui = load();
  ui.click('playButton');
  ui.advance(3);
  assert.equal(ui.state(), 'over');
  assert.equal(ui.element('overlay').hidden, false);
  assert.equal(ui.element('pauseButton').disabled, true);
  const best = ui.game.score;
  assert.ok(best > 0);
  assert.equal(Number(ui.storage.get('cloudstep-best-v1')), best);
  assert.equal(Number(load({ storage: ui.storage }).element('best').textContent), best);
  ui.click('playButton');
  assert.equal(ui.state(), 'playing');
  assert.equal(ui.game.score, 0);
  assert.equal(Number(ui.element('best').textContent), best);
});

test('blur and hidden tabs pause automatically and do not catch up on resume', () => {
  const ui = load();
  ui.click('playButton');
  ui.advance(0.5);
  ui.events.blur();
  assert.equal(ui.state(), 'paused');
  const x = ui.game.player.x;
  ui.advance(30);
  ui.key(' ');
  ui.advance(1 / 60);
  assert.equal(ui.game.player.x, x);
  ui.document.hidden = true;
  ui.docEvents.visibilitychange();
  assert.equal(ui.state(), 'paused');
});

test('touch button and primary canvas presses jump without duplicate input', () => {
  const ui = load();
  ui.click('playButton');
  ui.click('jumpButton');
  assert.equal(ui.game.player.jumps, 1);
  ui.element('game').listeners.pointerdown({ isPrimary: true, button: 0, preventDefault() {} });
  assert.equal(ui.game.player.jumps, 2);
  ui.element('game').listeners.pointerdown({ isPrimary: false, button: 0, preventDefault() {} });
  assert.equal(ui.game.player.jumps, 2);
});

test('native button Space, repeated keys and browser shortcuts are not hijacked', () => {
  const ui = load();
  ui.key(' ', { target: ui.element('playButton') });
  assert.equal(ui.state(), 'ready');
  ui.key(' ', { repeat: true });
  assert.equal(ui.state(), 'ready');
  ui.key('r', { ctrlKey: true });
  assert.equal(ui.state(), 'ready');
  ui.key('ArrowUp');
  assert.equal(ui.state(), 'playing');
  assert.equal(ui.game.player.jumps, 1);
});

test('blocked and corrupt local storage never prevent a run', () => {
  const ui = load({ blocked: true });
  ui.click('playButton');
  ui.advance(3);
  assert.equal(ui.state(), 'over');
  assert.ok(Number(ui.element('best').textContent) > 0);
  assert.match(ui.element('storageNote').textContent, /session/);
  for (const invalid of ['NaN', '-4', 'Infinity', '3.5', '99999999999999999999']) {
    const other = load({ storage: new Map([['cloudstep-best-v1', invalid]]) });
    assert.equal(other.element('best').textContent, '0000');
  }
});

test('collecting a gem updates the HUD and live announcement', () => {
  const ui = load();
  ui.click('playButton');
  ui.game.gems = [{ x: 118, y: 398, taken: false }];
  ui.advance(0.1);
  assert.equal(ui.element('gems').textContent, 1);
  assert.ok(Number(ui.element('score').textContent) >= 25);
  assert.match(ui.element('announcer').textContent, /gem collected/);
});

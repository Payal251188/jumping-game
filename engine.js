/* Deterministic, DOM-free runner rules. */
(function (root) {
  'use strict';
  class JumpGame {
    constructor({ random = Math.random } = {}) { this.random = random; this.reset(); }
    reset() {
      this.player = { x: 100, y: 378, w: 32, h: 42, vy: 0, grounded: true, jumps: 0 };
      this.platforms = [{ x: -200, y: 420, w: 1050 }];
      this.obstacles = [{ x: 590, y: 384, w: 32, h: 36 }];
      this.gems = [{ x: 600, y: 315, taken: false }];
      this.collected = 0;
      this.status = 'playing';
      this.time = 0;
      this.coyote = 0.1;
      this.buffer = 0;
      this.events = [];
      this.generate();
    }
    get distance() { return Math.max(0, Math.floor((this.player.x - 100) / 10)); }
    get score() { return this.distance + this.collected * 25; }
    get speed() { return Math.min(340, 220 + this.distance * 0.35); }
    generate() {
      let last = this.platforms.at(-1);
      while (last.x + last.w < this.player.x + 1800) {
        const gap = 90 + this.random() * 45;
        const platform = { x: last.x + last.w + gap, y: 400 + this.random() * 35, w: 330 + this.random() * 190 };
        this.platforms.push(platform);
        for (let i = 0; i < 3; i++) {
          this.gems.push({ x: last.x + last.w + gap * (i + 1) / 4, y: Math.min(last.y, platform.y) - 65 - (i === 1 ? 22 : 0), taken: false });
        }
        if (this.random() > 0.2) {
          this.obstacles.push({ x: platform.x + platform.w * 0.52, y: platform.y - 36, w: 32, h: 36 });
          this.gems.push({ x: platform.x + platform.w * 0.52 + 16, y: platform.y - 105, taken: false });
        }
        last = platform;
      }
    }
    jump() {
      if (this.status !== 'playing') return false;
      const p = this.player;
      if (p.grounded || this.coyote > 0) p.jumps = 0;
      else p.jumps = Math.max(1, p.jumps);
      if (p.jumps >= 2) { this.buffer = 0.12; return false; }
      p.jumps++;
      p.vy = p.jumps === 1 ? -545 : -500;
      p.grounded = false;
      this.coyote = 0;
      this.buffer = 0;
      this.events.push({ type: 'jump', x: p.x + 16, y: p.y + p.h, double: p.jumps === 2 });
      return true;
    }
    step(dt) {
      if (this.status !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
      // Fixed-size substeps also keep direct engine consumers safe from tunneling.
      let remaining = Math.min(dt, 0.25);
      while (remaining > 0 && this.status === 'playing') {
        const step = Math.min(remaining, 1 / 120);
        this.integrate(step);
        remaining -= step;
      }
    }
    integrate(dt) {
      const p = this.player;
      this.time += dt;
      this.buffer = Math.max(0, this.buffer - dt);
      this.coyote = p.grounded ? 0.1 : Math.max(0, this.coyote - dt);
      const bottom = p.y + p.h;
      p.x += this.speed * dt;
      p.vy += 1550 * dt;
      p.y += p.vy * dt;
      p.grounded = false;
      for (const platform of this.platforms) {
        if (p.vy >= 0 && p.x + p.w - 4 > platform.x && p.x + 4 < platform.x + platform.w && bottom <= platform.y + 1 && p.y + p.h >= platform.y) {
          p.y = platform.y - p.h;
          p.vy = 0;
          p.grounded = true;
          p.jumps = 0;
          break;
        }
      }
      if (p.grounded && this.buffer > 0) this.jump();
      for (const gem of this.gems) {
        if (!gem.taken && Math.abs(p.x + p.w / 2 - gem.x) < 25 && Math.abs(p.y + p.h / 2 - gem.y) < 32) {
          gem.taken = true;
          this.collected++;
          this.events.push({ type: 'gem', x: gem.x, y: gem.y });
        }
      }
      const hit = this.obstacles.some((o) => p.x + p.w - 6 > o.x + 3 && p.x + 6 < o.x + o.w - 3 && p.y + p.h - 3 > o.y + 4 && p.y + 8 < o.y + o.h);
      if (hit || p.y > 640) {
        this.status = 'over';
        this.events.push({ type: 'over', reason: hit ? 'stump' : 'fall', x: p.x, y: p.y });
      }
      this.generate();
      this.platforms = this.platforms.filter((v) => v.x + v.w > p.x - 500);
      this.obstacles = this.obstacles.filter((v) => v.x + v.w > p.x - 500);
      this.gems = this.gems.filter((v) => v.x > p.x - 500);
    }
    drainEvents() { return this.events.splice(0); }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { JumpGame };
  else root.JumpGame = JumpGame;
})(typeof globalThis !== 'undefined' ? globalThis : this);

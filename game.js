(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  const game = new JumpGame();
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const storageKey = 'cloudstep-best-v1';
  let state = 'ready';
  let best = 0;
  let startingBest = 0;
  let storageOK = true;
  let lastSaved = 0;
  let lastTime = null;
  let accumulator = 0;
  let viewWidth = 1080;
  let camera = 0;
  let particles = [];
  let audio = null;
  let sound = false;

  function storageFallback() {
    storageOK = false;
    $('storageNote').textContent = 'Best kept for this session. Browser storage is unavailable.';
  }
  try {
    const stored = Number(localStorage.getItem(storageKey));
    best = Number.isSafeInteger(stored) && stored > 0 ? stored : 0;
    localStorage.setItem(storageKey, String(best));
  } catch { storageFallback(); }
  function saveBest() {
    if (storageOK) {
      try { localStorage.setItem(storageKey, String(best)); }
      catch { storageFallback(); }
    }
    lastSaved = game.time;
  }
  const announce = (message) => { $('announcer').textContent = message; };
  const format = (number) => String(number).padStart(4, '0');
  function hud() {
    best = Math.max(best, game.score);
    $('score').textContent = format(game.score);
    $('best').textContent = format(best);
    $('distance').textContent = game.distance;
    $('gems').textContent = game.collected;
    if (game.time - lastSaved >= 1) saveBest();
  }
  function setState(next) {
    state = next;
    document.querySelector('.game-card').dataset.state = state;
    $('status').textContent = { ready: 'THE MEADOW IS WAITING', playing: 'A LITTLE FURTHER, A LITTLE BRAVER', paused: 'STOP AND SMELL THE FLOWERS', over: 'WHAT A LOVELY LITTLE JOURNEY' }[state];
    $('overlay').hidden = state === 'playing';
    $('pauseButton').disabled = !['playing', 'paused'].includes(state);
    $('pauseButton').textContent = state === 'paused' ? '▷ RESUME' : 'Ⅱ PAUSE';
    $('pauseButton').setAttribute('aria-label', state === 'paused' ? 'Resume game' : 'Pause game');
    lastTime = null;
    accumulator = 0;
  }
  function overlay(tag, title, text, button, hint) {
    $('overlayTag').textContent = tag;
    $('overlayTitle').textContent = title;
    $('overlayText').textContent = text;
    $('playLabel').textContent = button;
    $('overlayHint').textContent = hint;
    $('playButton').focus({ preventScroll: true });
  }
  function start() {
    saveBest();
    game.reset();
    particles = [];
    startingBest = best;
    lastSaved = 0;
    setState('playing');
    hud();
    canvas.focus({ preventScroll: true });
    announce('Adventure started. Jump with Space, Up, W, or tap. Jump again in the air for a double jump.');
  }
  function pause() {
    if (state === 'playing') {
      saveBest();
      setState('paused');
      overlay('THE MEADOW ISN’T GOING ANYWHERE', 'Take a little breather.', 'Your adventure will be right here.\nReady whenever you are.', 'KEEP WANDERING', 'press P or space to resume');
      announce('Game paused.');
    } else if (state === 'paused') {
      setState('playing');
      canvas.focus({ preventScroll: true });
      announce('Game resumed.');
    }
  }
  function jumpAction() {
    if (state === 'ready' || state === 'over') { start(); game.jump(); }
    else if (state === 'paused') pause();
    else game.jump();
  }
  function tone(frequency, duration = 0.1, slide = frequency) {
    if (!sound || !audio) return;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, audio.currentTime);
    osc.frequency.exponentialRampToValueAtTime(slide, audio.currentTime + duration);
    gain.gain.setValueAtTime(0.035, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
    osc.connect(gain); gain.connect(audio.destination);
    osc.start(); osc.stop(audio.currentTime + duration);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }
  function burst(x, y, color, count) {
    if (reduced) return;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 25 + Math.random() * 95;
      particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 30, life: 0.6, color });
    }
  }
  function events() {
    for (const event of game.drainEvents()) {
      if (event.type === 'jump') {
        burst(event.x, event.y, event.double ? '#fff6ca' : '#fffdf1', event.double ? 14 : 8);
        tone(event.double ? 520 : 320, 0.12, event.double ? 850 : 550);
      }
      if (event.type === 'gem') {
        burst(event.x, event.y, '#f8d886', 12);
        tone(880, 0.12, 1200);
        announce(`${game.collected} ${game.collected === 1 ? 'gem' : 'gems'} collected. Twenty-five bonus points.`);
      }
      if (event.type === 'over') {
        hud(); saveBest();
        setState('over');
        burst(game.player.x + 16, game.player.y + 20, '#f5dac1', 18);
        tone(260, 0.25, 110);
        overlay(best > startingBest ? 'A NEW PERSONAL BEST. LOOK AT YOU!' : 'EVERY LITTLE LEAP WAS WORTH IT', 'Another little adventure?',
          `${game.distance} m explored · ${game.collected} gems · ${game.score} points\n${event.reason === 'stump' ? 'Hop over the tree stumps — they’re sneakier than they look.' : 'Try a second jump in the air to cross the gaps.'}`,
          'WANDER AGAIN', 'or press space for a fresh start');
        announce(`Adventure finished. ${game.score} points, ${game.distance} meters and ${game.collected} gems. Personal best ${best}.`);
      }
    }
  }

  // All scenery is drawn locally: no images, fonts, or network requests needed.
  function ellipse(x, y, rx, ry, color) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  }
  function rect(x, y, w, h, radius, color) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.fill();
  }
  function cloud(x, y, scale, alpha) {
    ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); ctx.scale(scale, scale);
    ellipse(0, 0, 55, 14, '#fffdf8'); ellipse(-22, -9, 27, 18, '#fffdf8'); ellipse(14, -17, 31, 23, '#fffdf8'); ellipse(42, -3, 25, 15, '#fffdf8');
    ctx.restore();
  }
  function hillLayer(base, amplitude, color, factor, period) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, 560);
    for (let x = -20; x <= viewWidth + 20; x += 12) {
      const world = x + camera * factor;
      const y = base + Math.sin(world / period) * amplitude + Math.sin(world / (period * 0.47)) * amplitude * 0.22;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(viewWidth + 20, 560); ctx.closePath(); ctx.fill();
  }
  function tree(x, y, scale, color, trunk) {
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
    ctx.fillStyle = trunk; ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(-3, -98); ctx.lineTo(7, -98); ctx.lineTo(10, 0); ctx.fill();
    ctx.strokeStyle = trunk; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(1, -45); ctx.lineTo(-25, -77); ctx.moveTo(4, -65); ctx.lineTo(30, -100); ctx.stroke();
    ellipse(0, -125, 44, 54, color); ellipse(-26, -104, 29, 38, color); ellipse(30, -107, 34, 40, color);
    ellipse(-8, -141, 27, 30, '#ffffff0c');
    ctx.restore();
  }
  function background(time) {
    const sky = ctx.createLinearGradient(0, 0, 0, 540);
    sky.addColorStop(0, '#cedce9'); sky.addColorStop(0.48, '#f3e4dc'); sky.addColorStop(1, '#f6eccd');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, viewWidth, 540);
    const sunX = viewWidth * 0.74;
    const glow = ctx.createRadialGradient(sunX, 113, 12, sunX, 113, 135);
    glow.addColorStop(0, '#fff7cf88'); glow.addColorStop(1, '#fff7cf00');
    ctx.fillStyle = glow; ctx.fillRect(sunX - 135, 0, 270, 250);
    ellipse(sunX, 113, 43, 43, '#fff5ce');
    const drift = reduced ? 0 : time * 4;
    for (let i = -1; i < Math.ceil(viewWidth / 330) + 2; i++) {
      const x = i * 330 - ((camera * 0.08 + drift) % 330);
      cloud(x + 80, 85 + Math.sin(i * 4) * 30, 0.65 + ((i + 5) % 3) * 0.13, 0.6);
    }
    hillLayer(288, 62, '#b9b8ce', 0.1, 200);
    hillLayer(335, 48, '#b4c6c7', 0.19, 147);
    hillLayer(380, 39, '#91b0ac', 0.3, 187);
    for (let i = -1; i < Math.ceil(viewWidth / 180) + 2; i++) {
      const x = i * 180 - (camera * 0.4 % 180);
      tree(x + 50, 415 + Math.sin(i * 3) * 16, 0.65 + Math.abs(Math.sin(i * 2)) * 0.35, '#829f99', '#7d9390');
    }
    hillLayer(447, 20, '#73978b', 0.5, 133);
    hillLayer(493, 24, '#597f77', 0.65, 190);
    // Little birds in the distance.
    ctx.strokeStyle = '#7c8d9d88'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      const x = viewWidth * 0.46 + i * 21 - (camera * 0.03 % 80);
      const y = 127 + Math.sin(i * 2) * 14;
      ctx.beginPath(); ctx.moveTo(x - 5, y); ctx.quadraticCurveTo(x - 2, y - 4, x, y); ctx.quadraticCurveTo(x + 3, y - 4, x + 6, y); ctx.stroke();
    }
  }
  function platform(p) {
    const x = p.x - camera;
    if (x > viewWidth + 30 || x + p.w < -30) return;
    const rock = ctx.createLinearGradient(0, p.y, 0, p.y + 180);
    rock.addColorStop(0, '#8b8294'); rock.addColorStop(1, '#645f7c');
    ctx.fillStyle = rock;
    ctx.beginPath(); ctx.moveTo(x, p.y + 6); ctx.lineTo(x + p.w, p.y + 6);
    ctx.lineTo(x + p.w - 12, p.y + 97); ctx.lineTo(x + p.w - 43, p.y + 137);
    ctx.lineTo(x + p.w * 0.62, p.y + 151); ctx.lineTo(x + p.w * 0.5, p.y + 180);
    ctx.lineTo(x + p.w * 0.21, p.y + 148); ctx.lineTo(x + 14, p.y + 111); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffffff09'; ctx.beginPath(); ctx.moveTo(x + 12, p.y + 23); ctx.lineTo(x + p.w * 0.4, p.y + 32); ctx.lineTo(x + p.w * 0.21, p.y + 148); ctx.lineTo(x + 14, p.y + 111); ctx.closePath(); ctx.fill();
    rect(x, p.y, p.w, 17, 7, '#587e69');
    rect(x, p.y - 4, p.w, 12, 6, '#9cbd89');
    rect(x + 3, p.y - 4, p.w - 6, 4, 2, '#c0d59b');
    for (let gx = 18; gx < p.w - 12; gx += 26) {
      const sway = Math.sin((p.x + gx) * 2);
      ctx.strokeStyle = '#769b72'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x + gx, p.y); ctx.lineTo(x + gx - 3, p.y - 7 - sway * 2); ctx.moveTo(x + gx, p.y); ctx.lineTo(x + gx + 4, p.y - 5); ctx.stroke();
      if (Math.floor(gx / 26) % 4 === 1) {
        ctx.strokeStyle = '#6e996f'; ctx.beginPath(); ctx.moveTo(x + gx + 8, p.y); ctx.lineTo(x + gx + 8, p.y - 11); ctx.stroke();
        ellipse(x + gx + 8, p.y - 12, 3.5, 3.5, Math.sin(gx) > 0 ? '#f4d8bd' : '#f2eac1');
        ellipse(x + gx + 8, p.y - 12, 1.3, 1.3, '#d4af6c');
      }
    }
    // Small trailing vines along the island edges.
    for (const vx of [x + 16, x + p.w - 19]) {
      ctx.strokeStyle = '#5b806a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(vx, p.y + 10); ctx.quadraticCurveTo(vx - 7, p.y + 43, vx + 2, p.y + 62); ctx.stroke();
      ellipse(vx - 4, p.y + 31, 5, 3, '#749976'); ellipse(vx, p.y + 48, 5, 3, '#749976');
    }
  }
  function stump(o) {
    const x = o.x - camera;
    rect(x - 4, o.y + 26, o.w + 8, 12, 4, '#82695e');
    rect(x, o.y, o.w, o.h, 5, '#9c7a64');
    rect(x + 3, o.y + 7, 5, o.h - 10, 2, '#b49170');
    rect(x + 22, o.y + 11, 3, o.h - 14, 1, '#7d6158');
    ellipse(x + o.w / 2, o.y + 2, o.w / 2, 6, '#d7b88c');
    ctx.strokeStyle = '#ac8b6d'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.ellipse(x + o.w / 2, o.y + 2, 9, 3, 0, 0, Math.PI * 2); ctx.stroke();
    ellipse(x + 9, o.y + o.h, 8, 3, '#799673');
  }
  function gem(g, time) {
    const x = g.x - camera;
    const y = g.y + (reduced ? 0 : Math.sin(time * 3 + g.x) * 3);
    if (g.taken || x < -30 || x > viewWidth + 30) return;
    ctx.save();
    ctx.shadowColor = '#fff1aa88'; ctx.shadowBlur = reduced ? 0 : 15;
    ctx.fillStyle = '#f6d487'; ctx.beginPath(); ctx.moveTo(x, y - 11); ctx.lineTo(x + 8, y); ctx.lineTo(x, y + 11); ctx.lineTo(x - 8, y); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff0ba'; ctx.beginPath(); ctx.moveTo(x, y - 11); ctx.lineTo(x, y + 5); ctx.lineTo(x - 8, y); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function rabbit(time) {
    const p = game.player;
    const x = p.x - camera;
    const running = state === 'playing' && p.grounded;
    const bounce = running && !reduced ? Math.sin(time * 22) * 1.8 : 0;
    if (p.grounded) ellipse(x + 16, p.y + p.h + 1, 23, 5, '#3e62502d');
    ctx.save(); ctx.translate(x + 16, p.y + 22 + bounce);
    if (!p.grounded) ctx.rotate(Math.max(-0.14, Math.min(0.18, p.vy / 2500)));
    // Floppy ears, little tail, and a wind-blown coral scarf.
    const ear = running && !reduced ? Math.sin(time * 18) * 3 : 0;
    ctx.save(); ctx.rotate(-0.17);
    rect(-3, -44 + ear, 9, 31, 5, '#faf0dc'); rect(0, -40 + ear, 3.5, 20, 2, '#e8b8ad');
    rect(10, -42 - ear * 0.4, 9, 29, 5, '#fff6e4'); rect(13, -38 - ear * 0.4, 3.5, 18, 2, '#e8b8ad'); ctx.restore();
    ellipse(-14, 7, 9, 9, '#eee6d3');
    ellipse(0, 6, 16, 17, '#f4ead6');
    ellipse(4, 9, 10, 12, '#fff7e8');
    const leg = running && !reduced ? Math.sin(time * 22) * 4 : 0;
    ellipse(-7 + leg, 17, 8, 4.5, '#e9ddc7'); ellipse(10 - leg, 17, 8, 4.5, '#fff3dd');
    ctx.fillStyle = '#d98f7c'; ctx.beginPath(); ctx.moveTo(-6, -5); ctx.lineTo(-28, -9 + Math.sin(time * 14) * (reduced ? 0 : 3)); ctx.lineTo(-24, -2); ctx.lineTo(-28, 2); ctx.lineTo(-3, 1); ctx.closePath(); ctx.fill();
    rect(-8, -10, 24, 8, 4, '#e59e87');
    ellipse(7, -16, 17, 15, '#fff5e2'); ellipse(19, -11, 8, 7, '#fff7e7');
    ellipse(17, -19, 2.2, 2.8, '#40534b'); ellipse(17.7, -20, 0.7, 0.8, '#fff');
    ellipse(25, -13, 2.3, 1.8, '#a8756b'); ellipse(13, -10, 4, 2, '#efc8b5');
    ctx.restore();
    if (state === 'playing' && !p.grounded && p.jumps === 1) {
      ellipse(x + 16, p.y - 34, 2.5, 2.5, '#fff7d3');
    }
  }
  function draw() {
    const time = reduced ? 0 : game.time;
    camera = game.player.x - Math.min(175, viewWidth * 0.25);
    ctx.clearRect(0, 0, viewWidth, 540);
    background(time);
    // Mist separates the foreground islands from the distant forest.
    const mist = ctx.createLinearGradient(0, 410, 0, 540);
    mist.addColorStop(0, '#e4e9dc00'); mist.addColorStop(1, '#d2e2d466');
    ctx.fillStyle = mist; ctx.fillRect(0, 410, viewWidth, 130);
    game.platforms.forEach(platform);
    game.obstacles.forEach((o) => { if (o.x - camera < viewWidth + 40 && o.x - camera > -60) stump(o); });
    game.gems.forEach((g) => gem(g, time));
    rabbit(time);
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / 0.6);
      ellipse(p.x - camera, p.y, 3, 3, p.color);
    }
    ctx.globalAlpha = 1;
    if (!reduced) {
      for (let i = 0; i < 12; i++) {
        const x = ((i * 137.7 - camera * 0.7) % (viewWidth + 40) + viewWidth + 40) % (viewWidth + 40) - 20;
        const y = 200 + Math.sin(i * 9.7 + time * 0.5) * 105;
        ellipse(x, y, 1.6, 1.6, '#fff9d880');
      }
    }
  }
  function resize() {
    const bounds = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(bounds.width * dpr));
    canvas.height = Math.max(1, Math.round(bounds.height * dpr));
    viewWidth = 540 * bounds.width / Math.max(1, bounds.height);
    ctx.setTransform(canvas.width / viewWidth, 0, 0, canvas.height / 540, 0, 0);
    draw();
  }

  $('playButton').addEventListener('click', () => state === 'paused' ? pause() : start());
  $('restartButton').addEventListener('click', start);
  $('pauseButton').addEventListener('click', pause);
  $('jumpButton').addEventListener('click', jumpAction);
  canvas.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    jumpAction();
  });
  window.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (key === ' ' && event.target.closest('button, a')) return;
    if ([' ', 'ArrowUp', 'w', 'p', 'Escape', 'r'].includes(key)) event.preventDefault();
    if (event.repeat) return;
    if ([' ', 'ArrowUp', 'w'].includes(key)) jumpAction();
    if (key === 'p' || key === 'Escape') pause();
    if (key === 'r') start();
  });
  window.addEventListener('blur', () => { if (state === 'playing') pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'playing') pause(); });
  window.addEventListener('pagehide', saveBest);
  $('soundButton').addEventListener('click', async () => {
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) throw new Error('Audio unavailable');
      if (!audio) audio = new Audio();
      if (audio.state === 'suspended') await audio.resume();
      sound = !sound;
      $('soundLabel').textContent = sound ? 'SOUND ON' : 'SOUND OFF';
      $('soundButton').setAttribute('aria-pressed', String(sound));
      $('soundButton').setAttribute('aria-label', sound ? 'Turn sound off' : 'Turn sound on');
      tone(660);
    } catch {
      sound = false;
      $('soundLabel').textContent = 'UNAVAILABLE';
      $('soundButton').setAttribute('aria-pressed', 'false');
      $('soundButton').setAttribute('aria-label', 'Sound unavailable');
      $('soundButton').disabled = true;
    }
  });
  function frame(time) {
    if (state === 'playing') {
      if (lastTime !== null) accumulator += Math.min((time - lastTime) / 1000, 0.1);
      lastTime = time;
      while (accumulator >= 1 / 120 && state === 'playing') {
        game.step(1 / 120);
        accumulator -= 1 / 120;
        for (const p of particles) { p.x += p.vx / 120; p.y += p.vy / 120; p.life -= 1 / 120; }
        particles = particles.filter((p) => p.life > 0);
        events();
      }
      hud();
    }
    draw();
    requestAnimationFrame(frame);
  }
  new ResizeObserver(resize).observe($('scene'));
  hud(); setState('ready'); resize(); requestAnimationFrame(frame);
})();

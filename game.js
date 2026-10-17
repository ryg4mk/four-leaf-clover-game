(() => {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const fieldWrap = document.getElementById('fieldWrap');
  const missLayer = document.getElementById('missLayer');
  const startScreen = document.getElementById('startScreen');
  const resultScreen = document.getElementById('resultScreen');
  const startButton = document.getElementById('startButton');
  const retryButton = document.getElementById('retryButton');
  const timeValue = document.getElementById('timeValue');
  const bestValue = document.getElementById('bestValue');
  const resultTime = document.getElementById('resultTime');
  const resultTaps = document.getElementById('resultTaps');
  const resultBest = document.getElementById('resultBest');
  const recordText = document.getElementById('recordText');

  const BEST_KEY = 'four-leaf-clover-game-best-v1';
  const DPR_CAP = 2;
  const TAU = Math.PI * 2;

  const state = {
    width: 540, height: 820, dpr: 1,
    running: false, found: false,
    startTime: 0, elapsed: 0, taps: 0,
    best: loadBest(), clovers: [], target: null,
    grass: [], speckles: [], lastFrame: performance.now(), reveal: 0
  };

  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function loadBest() {
    try {
      const n = Number(localStorage.getItem(BEST_KEY));
      return Number.isFinite(n) && n > 0 ? n : null;
    } catch (_) { return null; }
  }

  function saveBest(v) {
    try { localStorage.setItem(BEST_KEY, String(v)); } catch (_) {}
    state.best = v;
  }

  function fmt(v) { return Number.isFinite(v) ? v.toFixed(2) : '--.--'; }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    state.width = Math.max(320, Math.round(rect.width));
    state.height = Math.max(520, Math.round(rect.height));
    state.dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    canvas.width = Math.round(state.width * state.dpr);
    canvas.height = Math.round(state.height * state.dpr);
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    buildGround();
    if (!state.running && !state.found) buildRound();
  }

  function buildGround() {
    state.grass = [];
    state.speckles = [];
    const grassCount = Math.min(1600, Math.floor(state.width * state.height / 380));
    for (let i = 0; i < grassCount; i++) {
      state.grass.push({
        x: rand(0, state.width), y: rand(0, state.height),
        len: rand(8, 31), lean: rand(-.65, .65), w: rand(.45, 1.4),
        hue: rand(92, 132), light: rand(16, 39), alpha: rand(.12, .35)
      });
    }
    const dotCount = Math.min(1300, Math.floor(state.width * state.height / 500));
    for (let i = 0; i < dotCount; i++) {
      state.speckles.push({x: rand(0, state.width), y: rand(0, state.height), r: rand(.35, 1.8), a: rand(.025, .10)});
    }
  }

  function buildRound() {
    state.clovers = [];
    state.found = false;
    state.elapsed = 0;
    state.taps = 0;
    state.reveal = 0;
    timeValue.textContent = '0.00';

    const density = state.width < 390 ? 720 : 850;
    const count = clamp(Math.floor(state.width * state.height / density), 360, 720);
    const topSafe = 88, bottomSafe = 30;

    for (let i = 0; i < count; i++) state.clovers.push(makeClover(false, topSafe, bottomSafe));

    const target = makeClover(true, topSafe, bottomSafe);
    target.id = 'target';
    state.target = target;
    state.clovers.push(target);
    state.clovers.sort((a, b) => a.depth - b.depth);
  }

  function makeClover(isTarget, topSafe, bottomSafe) {
    const size = rand(7.8, 12.8);
    const edge = size * 2.1 + 4;
    return {
      id: Math.random().toString(36).slice(2),
      isTarget, leaves: isTarget ? 4 : 3,
      x: rand(edge, state.width - edge),
      y: rand(topSafe + edge, state.height - bottomSafe - edge),
      size, rot: rand(0, TAU), depth: rand(0, 1),
      hue: rand(105, 126), sat: rand(43, 66), light: rand(27, 42),
      skew: rand(.84, 1.12), spread: rand(.52, .74),
      stem: rand(9, 27), stemLean: rand(-.45, .45),
      leafNoise: Array.from({length: isTarget ? 4 : 3}, () => ({
        scale: rand(.90, 1.08), curl: rand(-.18, .18),
        light: rand(-3.5, 4.5), notch: rand(.07, .15),
        vein: rand(.13, .24), spot: Math.random() < .18
      }))
    };
  }

  function drawGround() {
    const g = ctx.createLinearGradient(0, 0, state.width, state.height);
    g.addColorStop(0, '#244f28');
    g.addColorStop(.42, '#1f4725');
    g.addColorStop(1, '#183a1f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, state.width, state.height);

    for (const s of state.speckles) {
      ctx.fillStyle = `rgba(224,235,190,${s.a})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
    }

    for (const b of state.grass) {
      ctx.save();
      ctx.translate(b.x, b.y); ctx.rotate(b.lean);
      ctx.strokeStyle = `hsla(${b.hue},45%,${b.light}%,${b.alpha})`;
      ctx.lineWidth = b.w; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(b.len * .12, -b.len * .48, 0, -b.len);
      ctx.stroke(); ctx.restore();
    }

    const light = ctx.createRadialGradient(
      state.width * .38, state.height * .30, 0,
      state.width * .38, state.height * .30, Math.max(state.width, state.height) * .68
    );
    light.addColorStop(0, 'rgba(255,246,199,.12)');
    light.addColorStop(.52, 'rgba(255,255,255,.015)');
    light.addColorStop(1, 'rgba(0,0,0,.25)');
    ctx.fillStyle = light; ctx.fillRect(0, 0, state.width, state.height);
  }

  function leafPath(size, notch, skew) {
    ctx.beginPath();
    ctx.moveTo(0, size * .13);
    ctx.bezierCurveTo(-size * (.38 + notch), -size * .10, -size * .83, size * .06, -size * .80, size * .47);
    ctx.bezierCurveTo(-size * .75, size * .87, -size * .26, size * 1.05, 0, size * 1.18);
    ctx.bezierCurveTo(size * .31 * skew, size * 1.04, size * .76 * skew, size * .82, size * .79 * skew, size * .43);
    ctx.bezierCurveTo(size * .83 * skew, size * .08, size * (.36 + notch) * skew, -size * .10, 0, size * .13);
    ctx.closePath();
  }

  function drawLeaf(size, clover, detail, angle) {
    ctx.save();
    ctx.rotate(angle + detail.curl);
    ctx.translate(0, size * clover.spread);

    const leafSize = size * detail.scale;
    const hue = clover.hue;
    const light = clover.light + detail.light;

    ctx.shadowColor = 'rgba(3,20,5,.24)';
    ctx.shadowBlur = 2.2; ctx.shadowOffsetY = 1.2;

    leafPath(leafSize, detail.notch, clover.skew);
    const grad = ctx.createRadialGradient(
      -leafSize * .18, leafSize * .28, leafSize * .05,
      leafSize * .05, leafSize * .48, leafSize * 1.25
    );
    grad.addColorStop(0, `hsl(${hue},${clover.sat + 5}%,${light + 12}%)`);
    grad.addColorStop(.42, `hsl(${hue},${clover.sat}%,${light + 2}%)`);
    grad.addColorStop(1, `hsl(${hue - 4},${clover.sat + 4}%,${light - 9}%)`);
    ctx.fillStyle = grad; ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(4,42,9,.40)';
    ctx.lineWidth = Math.max(.42, leafSize * .055); ctx.stroke();

    ctx.strokeStyle = `rgba(222,242,191,${detail.vein})`;
    ctx.lineWidth = Math.max(.35, leafSize * .038);
    ctx.beginPath(); ctx.moveTo(0, leafSize * 1.05);
    ctx.quadraticCurveTo(leafSize * .02, leafSize * .62, 0, leafSize * .18); ctx.stroke();

    for (let i = 0; i < 3; i++) {
      const yy = leafSize * (.42 + i * .16);
      ctx.globalAlpha = .6; ctx.beginPath();
      ctx.moveTo(0, yy);
      ctx.quadraticCurveTo(-leafSize * .22, yy - leafSize * .05, -leafSize * (.34 + i * .04), yy - leafSize * .12);
      ctx.moveTo(0, yy);
      ctx.quadraticCurveTo(leafSize * .22, yy - leafSize * .04, leafSize * (.34 + i * .04), yy - leafSize * .11);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    if (detail.spot) {
      ctx.fillStyle = 'rgba(225,240,178,.13)';
      ctx.beginPath(); ctx.ellipse(-leafSize * .18, leafSize * .57, leafSize * .10, leafSize * .04, -.45, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function drawClover(c) {
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.rot);

    ctx.fillStyle = 'rgba(0,0,0,.12)';
    ctx.beginPath(); ctx.ellipse(1.5, c.size * 1.15, c.size * 1.55, c.size * .46, 0, 0, TAU); ctx.fill();

    ctx.strokeStyle = `hsla(${c.hue - 5},47%,21%,.76)`;
    ctx.lineWidth = Math.max(.75, c.size * .10); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, c.size * .65);
    ctx.quadraticCurveTo(c.stemLean * c.size, c.stem * .58, c.stemLean * c.size * .7, c.stem); ctx.stroke();

    const base = -Math.PI / 2;
    for (let i = 0; i < c.leaves; i++) drawLeaf(c.size, c, c.leafNoise[i], base + i * TAU / c.leaves);

    const center = ctx.createRadialGradient(0,0,0,0,0,c.size*.34);
    center.addColorStop(0,'rgba(220,238,161,.82)');
    center.addColorStop(.45,`hsla(${c.hue},55%,33%,.92)`);
    center.addColorStop(1,`hsla(${c.hue - 5},58%,20%,.94)`);
    ctx.fillStyle = center; ctx.beginPath(); ctx.arc(0,0,c.size*.27,0,TAU); ctx.fill();

    if (state.reveal > 0 && c.isTarget) {
      ctx.globalAlpha = clamp(state.reveal, 0, 1);
      ctx.strokeStyle = '#f2ff89'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0,0,c.size*2.2,0,TAU); ctx.stroke();
    }
    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0, 0, state.width, state.height);
    drawGround();
    for (const c of state.clovers) drawClover(c);
  }

  function hitTarget(x, y) {
    const t = state.target;
    if (!t) return false;

    const dx = x - t.x, dy = y - t.y;
    const cr = Math.cos(-t.rot), sr = Math.sin(-t.rot);
    const lx = dx * cr - dy * sr, ly = dx * sr + dy * cr;

    for (let i = 0; i < 4; i++) {
      const a = -Math.PI / 2 + i * TAU / 4;
      const cx = Math.cos(a) * t.size * t.spread;
      const cy = Math.sin(a) * t.size * t.spread;
      const ddx = lx - cx, ddy = ly - cy, r = t.size * .77;
      if (ddx * ddx + ddy * ddy <= r * r) return true;
    }
    return lx * lx + ly * ly < (t.size * .40) ** 2;
  }

  function showMiss(clientX, clientY) {
    const rect = fieldWrap.getBoundingClientRect();
    const el = document.createElement('span');
    el.className = 'miss'; el.textContent = '×';
    el.style.left = `${clientX - rect.left}px`;
    el.style.top = `${clientY - rect.top}px`;
    missLayer.appendChild(el);
    setTimeout(() => el.remove(), 600);
  }

  function startGame() {
    buildRound();
    state.running = true; state.found = false;
    state.startTime = performance.now();
    startScreen.classList.add('hidden');
    resultScreen.classList.add('hidden');
  }

  function finishGame() {
    state.running = false; state.found = true; state.reveal = 1;
    const finalTime = Number(state.elapsed.toFixed(2));
    const isBest = state.best == null || finalTime < state.best;
    if (isBest) saveBest(finalTime);

    resultTime.textContent = finalTime.toFixed(2);
    resultTaps.textContent = `${state.taps}回`;
    resultBest.textContent = `${fmt(state.best)}秒`;
    recordText.textContent = isBest ? '★ NEW BEST! ★' : '';
    bestValue.textContent = fmt(state.best);

    draw();
    setTimeout(() => resultScreen.classList.remove('hidden'), 430);
  }

  function onPointer(e) {
    if (!state.running || state.found) return;
    state.taps++;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * state.width / rect.width;
    const y = (e.clientY - rect.top) * state.height / rect.height;

    if (hitTarget(x, y)) {
      state.elapsed = (performance.now() - state.startTime) / 1000;
      finishGame();
    } else {
      showMiss(e.clientX, e.clientY);
    }
  }

  function frame(now) {
    state.lastFrame = now;
    if (state.running && !state.found) {
      state.elapsed = (performance.now() - state.startTime) / 1000;
      timeValue.textContent = state.elapsed.toFixed(2);
    }
    draw();
    requestAnimationFrame(frame);
  }

  canvas.addEventListener('pointerdown', onPointer, {passive:true});
  startButton.addEventListener('click', startGame);
  retryButton.addEventListener('click', startGame);
  window.addEventListener('resize', resize);

  bestValue.textContent = fmt(state.best);
  resize();
  requestAnimationFrame(frame);
})();

/* =========================================================================
   POLDO HD — "Il banchetto dei colori"
   Tributo amatoriale al platformer Amiga del 1988 (Grandslam Interactive).
   Personaggio da main.jpg, musica da theme.mp3, altri sprite procedurali.
   ========================================================================= */
(() => {
'use strict';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = 1280, H = 720;
const FALL_DAMAGE = 280;   // caduta oltre questa altezza costa una vita

/* ---------- Asset: frame del personaggio da main.jpg ---------- */
const MAIN_FRAMES = window.__CHUBBY_MAIN__ || [];
const imgCache = {};
function loadImg(src) {
  if (!src) return null;
  if (imgCache[src]) return imgCache[src];
  const im = new Image();
  im.src = src;
  imgCache[src] = im;
  return im;
}
const playerImgs = MAIN_FRAMES.map(loadImg);
/* Immagine della schermata intro, nella cartella base del progetto. */
const introImg = loadImg('Poldo.png');
/* Frame del vigile da vigile.gif, animati manualmente sul canvas. */
const VIGILE_FRAMES = window.__VIGILE_FRAMES__ || [];
const VIGILE_DURATIONS = window.__VIGILE_DURATIONS__ || [200, 200, 200, 200, 200, 200, 200, 200, 200, 2000];
const vigileImgs = (VIGILE_FRAMES.length ? VIGILE_FRAMES : ['vigile.gif']).map(loadImg);
/* Auto del vigile: maggiolone.png rielaborato nello stile degli sprite di Poldo. */
const maggioloneImg = loadImg(window.__MAGGIO_FRAME__ || 'maggiolone.png');

/* Musica: theme.mp3 in loop, esattamente come fornita */
let musicEl = null;
function startMusic() {
  if (musicEl) return;
  try {
    musicEl = new Audio('theme.mp3');
    musicEl.loop = true;
    musicEl.volume = 0.45;
    musicEl.play().catch(() => {});
  } catch (e) { musicEl = null; }
}
function stopMusic() {
  if (musicEl) { musicEl.pause(); musicEl = null; }
}
function setMusicVolume(v) {
  if (musicEl) musicEl.volume = v;
}

/* ---------- Canvas ad alta risoluzione (DPR) ---------- */
function fitCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
}
fitCanvas();
window.addEventListener('resize', fitCanvas);

/* ---------- Input ---------- */
const keys = { left: false, right: false, up: false, down: false, jump: false };
const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', Space: 'jump'
};

function pressAction(code) {
  if (code === 'Enter' || code === 'NumpadEnter') {
    if (state === 'title' || state === 'gameover' || state === 'victory') startGame();
  }
  if (code === 'KeyP' || code === 'Escape') {
    if (state === 'play') state = 'paused';
    else if (state === 'paused') state = 'play';
  }
  if (code === 'KeyM') { muted = !muted; setMusicVolume(muted ? 0 : .45); }
  if (code === 'KeyR' && state === 'play') { prepLevel(levelIndex); state = 'play'; }
}

addEventListener('keydown', e => {
  const a = KEYMAP[e.code];
  if (a) { keys[a] = true; e.preventDefault(); }
  if (!e.repeat) pressAction(e.code);
});
addEventListener('keyup', e => {
  const a = KEYMAP[e.code];
  if (a) { keys[a] = false; e.preventDefault(); }
});
addEventListener('blur', () => {
  for (const k in keys) keys[k] = false;
  if (state === 'play') state = 'paused';
});

document.querySelectorAll('#touch button').forEach(btn => {
  const k = btn.dataset.key;
  const on  = e => { e.preventDefault(); keys[k] = true; ensureAudio(); };
  const off = e => { e.preventDefault(); keys[k] = false; };
  btn.addEventListener('pointerdown', on);
  btn.addEventListener('pointerup', off);
  btn.addEventListener('pointercancel', off);
  btn.addEventListener('pointerleave', off);
});

/* ---------- Audio (WebAudio, nessun file) ---------- */
let actx = null, muted = false;
function ensureAudio() {
  if (!actx) {
    try { actx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) { actx = null; }
  }
  if (actx && actx.state === 'suspended') actx.resume();
}
function snd(freq, dur, type = 'square', vol = .07, slide = 0) {
  if (muted) return;
  ensureAudio();
  if (!actx) return;
  const now = actx.currentTime;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, now);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), now + dur);
  g.gain.setValueAtTime(vol, now);
  g.gain.exponentialRampToValueAtTime(.0001, now + dur);
  o.connect(g); g.connect(actx.destination);
  o.start(now); o.stop(now + dur + .02);
}
const SFX = {
  jump:    () => snd(300, .16, 'square', .055, 280),
  collect: n => snd(480 + (n % 6) * 70, .18, 'triangle', .085, 200),
  hit:     () => snd(190, .32, 'sawtooth', .09, -130),
  stomp:   () => snd(230, .12, 'square', .075, 160),
  fine:    () => { snd(880, .10, 'square', .05, 0); setTimeout(() => snd(660, .16, 'square', .05, -60), 90); },
  clear:   () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => snd(f, .28, 'triangle', .08), i * 115)),
  win:     () => [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => setTimeout(() => snd(f, .34, 'triangle', .075), i * 130))
};

/* ---------- Dati dei livelli ----------
   Coordinate in un mondo schermo da 1280x720.
   Piattaforme: [x, y, larghezza, altezza]  (y = bordo superiore)
   Scale:       [x, y, larghezza, altezza]
   Cibo:        [x, y, tipo]
   Nemici:      {x, y, min, max, tipo, speed, float?, baseY?}
*/
const LEVELS = [
  {
    name: 'La Cucina Reale', theme: 'kitchen',
    tip: 'Raccogli tutto e salta oltre le prime punte!',
    palette: {
      sky: ['#fff3cf', '#ffad68'], far: '#ffd9a0', mid: '#f6a05e', near: '#d9643e',
      top: '#ffe08a', side: '#c85a3c', line: '#963d28', ladder: '#7d4527',
      accent: '#ff5f5f', ink: '#5b2a1c'
    },
    platforms: [
      [0, 660, 1280, 60],
      [120, 540, 220, 24], [420, 460, 220, 24], [760, 540, 220, 24],
      [1020, 430, 220, 24], [520, 330, 240, 24], [150, 400, 200, 24],
      [180, 250, 220, 24], [1030, 250, 210, 24]
    ],
    ladders: [
      [350, 540, 24, 120], [650, 460, 24, 200], [990, 250, 24, 410],
      [470, 330, 24, 130], [130, 400, 24, 140], [150, 250, 24, 150]
    ],
    foods: [
      [220, 500, 'apple'], [290, 500, 'cake'], [500, 420, 'fish'], [600, 420, 'cheese'],
      [830, 500, 'donut'], [1100, 390, 'chicken'], [600, 290, 'croissant'],
      [240, 210, 'apple'], [240, 360, 'cake'], [1100, 210, 'fish'],
      [700, 620, 'carrot'], [80, 620, 'donut'], [560, 290, 'cheese']
    ],
    enemies: [
      { x: 430, y: 630, min: 400, max: 720, type: 'rat', speed: 1.35 },
      { x: 800, y: 512, min: 780, max: 950, type: 'rat', speed: 1.15 },
      { x: 600, y: 280, min: 530, max: 740, type: 'ghost', speed: 1.0, float: true, baseY: 280 },
      { x: 1080, y: 392, min: 1040, max: 1210, type: 'fire', speed: 1.6, float: true, baseY: 392 }
    ],
    hazards: [
      ['spikes', 480, 660, 44], ['spikes', 880, 660, 44]
    ],
    start: [95, 604], door: [1200, 580, 62, 80]
  },
  {
    name: 'Il Giardino Incantato', theme: 'garden',
    tip: 'Api, punte e fiamme: salta, ma non calpestare le fiamme!',
    palette: {
      sky: ['#c9f4ff', '#79d0ff'], far: '#bdecaa', mid: '#74cf8b', near: '#35a56b',
      top: '#b6ef9d', side: '#3f8f57', line: '#2c6c40', ladder: '#8b5a2b',
      accent: '#ff6f91', ink: '#1f5537'
    },
    platforms: [
      [0, 660, 1280, 60],
      [100, 550, 200, 24], [430, 480, 220, 24], [770, 560, 200, 24],
      [1030, 450, 210, 24], [150, 400, 200, 24], [520, 350, 240, 24],
      [180, 250, 220, 24], [790, 250, 230, 24]
    ],
    ladders: [
      [310, 550, 24, 110], [660, 480, 24, 180], [980, 560, 24, 100],
      [1000, 450, 24, 210], [130, 400, 24, 150], [490, 350, 24, 130],
      [150, 250, 24, 150], [760, 250, 24, 100]
    ],
    foods: [
      [170, 510, 'apple'], [250, 510, 'carrot'], [500, 440, 'cheese'], [580, 440, 'apple'],
      [830, 520, 'croissant'], [1100, 410, 'cake'], [600, 310, 'donut'],
      [250, 210, 'fish'], [250, 360, 'carrot'], [880, 210, 'apple'],
      [1030, 210, 'cake'], [730, 620, 'cheese'], [60, 620, 'carrot']
    ],
    enemies: [
      { x: 360, y: 634, min: 330, max: 660, type: 'snail', speed: .85 },
      { x: 790, y: 530, min: 780, max: 950, type: 'bee', speed: 1.7, float: true, baseY: 530 },
      { x: 540, y: 320, min: 530, max: 740, type: 'butterfly', speed: 1.5, float: true, baseY: 320 },
      { x: 1080, y: 420, min: 1040, max: 1210, type: 'snail', speed: 1.05 }
    ],
    hazards: [
      ['spikes', 500, 660, 44], ['spikes', 900, 660, 44], ['spikes', 880, 560, 40],
      ['flame', 350, 660, 28], ['flame', 1170, 450, 28]
    ],
    scene: { signX: 945, carX: 975, vigileX: 1085 },
    start: [90, 604], door: [1195, 580, 62, 80]
  },
  {
    name: 'La Panetteria Dorata', theme: 'bakery',
    tip: 'Razzi in arrivo: scegli il momento giusto per passare!',
    palette: {
      sky: ['#fff6d9', '#ffcf86'], far: '#ffe4ad', mid: '#f2c471', near: '#d59a4b',
      top: '#ffd98a', side: '#a96835', line: '#80491f', ladder: '#6d4224',
      accent: '#ff8a3d', ink: '#63391c'
    },
    platforms: [
      [0, 660, 1280, 60],
      [80, 560, 240, 24], [400, 470, 240, 24], [720, 550, 240, 24],
      [1000, 440, 240, 24], [180, 380, 220, 24], [560, 350, 220, 24],
      [1020, 300, 220, 24], [260, 240, 200, 24]
    ],
    ladders: [
      [330, 560, 24, 100], [650, 470, 24, 190], [980, 300, 24, 360],
      [100, 380, 24, 180], [530, 350, 24, 120], [200, 240, 24, 140]
    ],
    foods: [
      [160, 520, 'croissant'], [260, 520, 'donut'], [460, 430, 'cake'], [560, 430, 'croissant'],
      [780, 510, 'fish'], [1080, 400, 'chicken'], [250, 340, 'apple'],
      [620, 310, 'donut'], [1100, 260, 'cake'], [330, 200, 'croissant'],
      [700, 620, 'cheese'], [1180, 620, 'apple'], [420, 620, 'fish']
    ],
    enemies: [
      { x: 380, y: 630, min: 350, max: 700, type: 'rat', speed: 1.4 },
      { x: 750, y: 522, min: 730, max: 940, type: 'fire', speed: 1.5, float: true, baseY: 522 },
      { x: 580, y: 310, min: 570, max: 760, type: 'ghost', speed: 1.15, float: true, baseY: 310 },
      { x: 1050, y: 410, min: 1010, max: 1210, type: 'fire', speed: 1.75, float: true, baseY: 410 },
      { x: 220, y: 352, min: 190, max: 380, type: 'bee', speed: 1.5, float: true, baseY: 352 }
    ],
    hazards: [
      ['spikes', 520, 660, 44], ['spikes', 780, 660, 44], ['spikes', 860, 550, 40],
      ['flame', 620, 470, 28], ['flame', 1180, 440, 28],
      ['rocket', 280, 610, 280, 960, 2.4], ['rocket', 700, 272, 700, 1180, 2.0]
    ],
    start: [120, 604], door: [40, 580, 62, 80]
  },
  {
    name: 'La Sala del Banchetto', theme: 'banquet',
    tip: 'Stalattiti, razzi e fiamme: il banchetto è pericolosissimo!',
    palette: {
      sky: ['#3b1e6e', '#7b3fa0'], far: '#5b2c8c', mid: '#42206e', near: '#2b134c',
      top: '#ffd76e', side: '#6b3fa0', line: '#452470', ladder: '#e0b45c',
      accent: '#ffe17a', ink: '#1d0f36'
    },
    platforms: [
      [0, 660, 1280, 60],
      [100, 540, 220, 24], [400, 460, 240, 24], [740, 540, 220, 24],
      [1010, 430, 230, 24], [180, 370, 200, 24], [520, 330, 240, 24],
      [1020, 300, 220, 24], [300, 230, 220, 24], [640, 230, 200, 24]
    ],
    ladders: [
      [330, 540, 24, 120], [650, 460, 24, 200], [975, 540, 24, 120],
      [990, 300, 24, 240], [150, 370, 24, 170], [500, 330, 24, 130],
      [280, 230, 24, 140], [620, 230, 24, 100]
    ],
    foods: [
      [180, 500, 'chicken'], [270, 500, 'cake'], [480, 420, 'fish'], [580, 420, 'cheese'],
      [820, 500, 'donut'], [1100, 390, 'chicken'], [250, 330, 'apple'],
      [600, 290, 'cake'], [1100, 260, 'fish'], [380, 190, 'croissant'],
      [720, 190, 'cheese'], [700, 620, 'apple'], [90, 620, 'cake']
    ],
    enemies: [
      { x: 420, y: 630, min: 380, max: 720, type: 'rat', speed: 1.5 },
      { x: 770, y: 512, min: 750, max: 940, type: 'fire', speed: 1.7, float: true, baseY: 512 },
      { x: 540, y: 290, min: 530, max: 740, type: 'ghost', speed: 1.3, float: true, baseY: 290 },
      { x: 1050, y: 400, min: 1020, max: 1210, type: 'bee', speed: 1.8, float: true, baseY: 400 },
      { x: 330, y: 190, min: 310, max: 500, type: 'butterfly', speed: 1.6, float: true, baseY: 190 },
      { x: 670, y: 190, min: 650, max: 820, type: 'ghost', speed: 1.2, float: true, baseY: 190 }
    ],
    hazards: [
      ['spikes', 480, 660, 44], ['spikes', 880, 660, 44],
      ['spikes', 1160, 430, 40], ['spikes', 300, 230, 40],
      ['flame', 600, 460, 28], ['flame', 1020, 300, 28], ['flame', 180, 370, 28],
      ['rocket', 260, 610, 260, 1000, 2.8], ['rocket', 650, 200, 650, 1200, 2.5],
      ['stalactite', 240, 394, 24, 34], ['stalactite', 600, 354, 24, 34],
      ['stalactite', 1100, 324, 24, 34]
    ],
    start: [90, 604], door: [1195, 580, 62, 80]
  }
];

/* ---------- Stato di gioco ---------- */
let state = 'title'; // title | play | paused | levelclear | gameover | victory
let levelIndex = 0, level = null;
let plats = [], ladders = [], foods = [], enemies = [], hazards = [], particles = [], texts = [];
let door = null, player = null, scene = null;
let score = 0, hiScore = +(localStorage.getItem('chubbyHi') || 0);
let lives = 3, collected = 0, doorOpen = false;
let time = 0, clearTimer = 0, shake = 0, flash = 0;

function prepLevel(i) {
  levelIndex = i;
  level = LEVELS[i];
  plats = level.platforms.map(p => ({ x: p[0], y: p[1], w: p[2], h: p[3] }));
  ladders = level.ladders.map(l => ({ x: l[0], y: l[1], w: l[2], h: l[3] }));
  foods = level.foods.map((f, n) => ({ x: f[0], y: f[1], type: f[2], got: false, phase: n * .9 }));
  enemies = level.enemies.map((e, n) => ({
    x: e.x, y: e.y, min: e.min, max: e.max, type: e.type,
    speed: e.speed, float: !!e.float, baseY: e.baseY ?? e.y,
    dir: n % 2 ? -1 : 1, phase: n * 1.7, dead: false, w: 46, h: 34
  }));
  hazards = level.hazards.map((h, n) => {
    const common = { type: h[0], x: h[1], y: h[2], dir: n % 2 ? -1 : 1, phase: n * 1.3 };
    if (h[0] === 'rocket') {
      return { ...common, w: 38, min: h[3], max: h[4], speed: h[5] };
    }
    if (h[0] === 'stalactite') {
      return { ...common, w: h[3] ?? 24, h: h[4] ?? 34, min: h[1], max: h[1], speed: 0 };
    }
    return { ...common, w: h[3] ?? 40, min: h[1], max: h[1], speed: 0 };
  });
  scene = level.scene ? {
    ...level.scene,
    frame: 0, frameTime: 0, fined: false, cooldown: 0
  } : null;
  door = { x: level.door[0], y: level.door[1], w: level.door[2], h: level.door[3] };
  player = {
    x: level.start[0], y: level.start[1], w: 44, h: 56,
    vx: 0, vy: 0, face: 1, onGround: false, climbing: false,
    walk: 0, invuln: 0, jumpHeld: false, ladderCd: 0, ladderBlocked: false,
    fallTop: level.start[1], weight: 0
  };
  particles = []; texts = [];
  collected = 0; doorOpen = false; shake = 0; flash = 0;
}

function startGame() {
  ensureAudio();
  startMusic();
  score = 0; lives = 3;
  prepLevel(0);
  state = 'play';
  SFX.clear();
}

/* ---------- Utility ---------- */
function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
function rr(x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function star(x, y, r1, r2, points, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = rot + i * Math.PI / points;
    const r = i % 2 ? r2 : r1;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
}
/* Disegna un frame del personaggio da main_frames.js. */
function drawSprite(img, cx, cy, dw, dh, flip = false) {
  if (!img || !img.complete || !img.naturalWidth) return false;
  ctx.save();
  ctx.translate(cx, cy);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
  return true;
}
function burst(x, y, color, n = 16) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = 1.5 + Math.random() * 5;
    particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 2,
      life: 34 + Math.random() * 26, max: 60,
      size: 3 + Math.random() * 5,
      color: Math.random() < .3 ? '#fff8d6' : color,
      spin: Math.random() * 6, vs: (Math.random() - .5) * .3
    });
  }
}
function floatText(x, y, text, color = '#fff4c2') {
  texts.push({ x, y, text, color, life: 55 });
}
function saveScore() {
  if (score > hiScore) { hiScore = score; localStorage.setItem('chubbyHi', String(hiScore)); }
}

/* ---------- Fisica / update ---------- */
// Più cibo = più peso: meno velocità e salto più corto, sagoma invariata.
function weightSpeed(p) { return 1 / (1 + p.weight * 0.055); }
function weightJump(p) { return 1 - Math.min(0.12, p.weight * 0.006); }
function weightGravity(p) { return 1 + Math.min(0.2, p.weight * 0.012); }

function clampToLevel(o) {
  // Il personaggio non può uscire dall'area di gioco (1280 x 720).
  o.x = Math.max(0, Math.min(W - o.w, o.x));
  o.y = Math.max(0, Math.min(H - o.h, o.y));
  if (o.x === 0 || o.x === W - o.w) o.vx = 0;
  if (o.y === 0 && o.vy < 0) o.vy = 0;
}

function moveAndCollide(o) {
  o.x += o.vx;
  for (const p of plats) {
    if (!overlap(o, p)) continue;
    if (o.vx > 0) o.x = p.x - o.w;
    else if (o.vx < 0) o.x = p.x + p.w;
    o.vx = 0;
  }
  o.y += o.vy;
  o.onGround = false;
  for (const p of plats) {
    if (!overlap(o, p)) continue;
    if (o.vy > 0) { o.y = p.y - o.h; o.onGround = true; }
    else if (o.vy < 0) o.y = p.y + p.h;
    o.vy = 0;
  }
  clampToLevel(o);
}

function nearLadder(p) {
  const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
  let best = null, bestScore = Infinity;
  for (const l of ladders) {
    if (!(cx > l.x - 18 && cx < l.x + l.w + 18 && cy > l.y - 54 && cy < l.y + l.h + 34)) continue;
    // Due scale sovrapposte: scegli quella più vicina, non la prima dell'elenco.
    const dx = Math.max(0, Math.abs(cx - (l.x + l.w / 2)) - l.w / 2);
    const dy = Math.max(0, Math.abs(cy - (l.y + l.h / 2)) - l.h / 2);
    const score = dx * dx + dy * dy;
    if (score < bestScore) { bestScore = score; best = l; }
  }
  return best;
}

function updatePlayer() {
  const p = player;
  const wasOnGround = p.onGround;
  const jumpPressed = keys.jump && !p.jumpHeld;
  const lad = nearLadder(p);
  if (p.ladderCd > 0) p.ladderCd--;
  // Dopo essere scesi (o saliti) serve rilasciare i tasti prima di riattaccarsi.
  if (p.ladderBlocked && !keys.up && !keys.down) p.ladderBlocked = false;

  if (p.climbing && (!lad || p.ladderCd > 0)) p.climbing = false;

  if (lad && !p.climbing && !p.ladderBlocked && p.ladderCd === 0 && (keys.up || keys.down)) {
    p.climbing = true;
  }

  const speed = weightSpeed(p);
  if (p.climbing) {
    if (jumpPressed) {
      p.climbing = false; p.ladderCd = 16; p.ladderBlocked = true;
      p.vy = -11.5 * weightJump(p); SFX.jump();
    } else {
      p.x += (lad.x + lad.w / 2 - p.w / 2 - p.x) * .32;
      p.vy = (keys.up && !keys.down ? -4.3 : keys.down && !keys.up ? 4.3 : 0) * speed;
      p.vx = 0;
      p.y += p.vy;
      clampToLevel(p);

      // Arrivati a un'estremità ci si stacca: niente discesa all'infinito.
      const feet = p.y + p.h;
      if (keys.down && !keys.up && feet >= lad.y + lad.h) {
        p.y = lad.y + lad.h - p.h; p.vy = 0; p.onGround = true;
        p.climbing = false; p.ladderBlocked = true; p.ladderCd = 16; p.fallTop = p.y;
      } else if (keys.up && !keys.down && feet <= lad.y) {
        p.y = lad.y - p.h; p.vy = 0; p.onGround = true;
        p.climbing = false; p.ladderBlocked = true; p.ladderCd = 16; p.fallTop = p.y;
      }

      if (Math.abs(p.vy) > .5 && p.climbing) p.walk += .18;
    }
  } else {
    const ax = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    if (ax) {
      p.vx += ax * .92 * speed;
      const maxSpeed = 6.4 * speed;
      p.vx = Math.max(-maxSpeed, Math.min(maxSpeed, p.vx));
      p.face = ax;
    } else {
      p.vx *= p.onGround ? .76 - Math.min(.12, p.weight * .009) : .9;
      if (Math.abs(p.vx) < .04) p.vx = 0;
    }
    if (jumpPressed && p.onGround) {
      p.vy = -13.3 * weightJump(p); p.onGround = false; SFX.jump();
      burst(p.x + p.w / 2, p.y + p.h, '#ffe6b0', 7);
    }
    p.vy = Math.min(p.vy + .63 * weightGravity(p), 17);
    moveAndCollide(p);
    if (Math.abs(p.vx) > .2) p.walk += Math.abs(p.vx) * .085;
    else p.walk *= .88;
  }

  if (p.invuln > 0) p.invuln--;
  p.jumpHeld = keys.jump;

  // Danno da caduta: conta la distanza dal punto più alto raggiunto in aria.
  if (p.climbing) {
    p.fallTop = p.y;
  } else if (p.onGround) {
    const fall = p.y - p.fallTop;
    p.fallTop = p.y;
    if (!wasOnGround && fall > FALL_DAMAGE) damage();
  } else {
    p.fallTop = Math.min(p.fallTop, p.y);
  }

  if (p.y > H + 80) damage();
}

function hazardRect(h) {
  if (h.type === 'spikes') return { x: h.x, y: h.y - 18, w: h.w, h: 18 };
  if (h.type === 'flame') return { x: h.x, y: h.y - 38, w: h.w, h: 38 };
  if (h.type === 'stalactite') return { x: h.x, y: h.y, w: h.w, h: h.h };
  return { x: h.x, y: h.y, w: h.w, h: 16 };   // rocket
}

function updateHazards() {
  for (const h of hazards) {
    if (h.type !== 'rocket') continue;
    h.x += h.speed * h.dir;
    if (h.x <= h.min) { h.x = h.min; h.dir = 1; }
    if (h.x >= h.max) { h.x = h.max; h.dir = -1; }
  }
  if (state !== 'play' || player.invuln > 0) return;
  for (const h of hazards) {
    if (overlap(player, hazardRect(h))) { damage(); break; }
  }
}

function updateScene() {
  if (!scene || !vigileImgs.length) return;

  // Animazione del vigile: il GIF ha 9 frame rapidi e un finale lungo.
  scene.frameTime += STEP;
  const dur = VIGILE_DURATIONS[scene.frame] || 200;
  if (scene.frameTime >= dur) {
    scene.frameTime -= dur;
    scene.frame = (scene.frame + 1) % vigileImgs.length;
  }
  if (scene.cooldown > 0) scene.cooldown--;

  // Passando accanto al maggiolone parcheggiato scatta la multa.
  const feet = player.y + player.h;
  const inZone = player.x + player.w > scene.signX - 8 &&
    player.x < scene.vigileX + 110 &&
    feet > 620 && feet < 690 && player.y < 640;

  if (inZone && !scene.fined && scene.cooldown === 0) {
    const fine = 150;
    score = Math.max(0, score - fine);
    scene.fined = true;
    scene.cooldown = 260;
    floatText(player.x - 14, player.y - 26, `MULTA! -${fine}`, '#ff9d9d');
    burst(scene.vigileX + 90, 555, '#fff6d0', 12);
    SFX.fine();
  }
  if (!inZone && scene.cooldown === 0) scene.fined = false;
}

function updateEnemies() {
  for (const e of enemies) {
    if (e.dead) continue;
    e.x += e.dir * e.speed;
    if (e.x < e.min) { e.x = e.min; e.dir = 1; }
    if (e.x > e.max) { e.x = e.max; e.dir = -1; }
    if (e.float) e.y = e.baseY + Math.sin(time * .055 + e.phase) * 14;
    if (state !== 'play' || player.invuln > 0) continue;
    if (!overlap(player, e)) continue;
    const stomp = player.vy > 1.5 &&
      player.y + player.h - 15 < e.y + e.h * .45 &&
      !player.climbing;
    if (stomp && e.type !== 'fire') {
      e.dead = true; player.vy = -9.6; score += 75;
      SFX.stomp(); burst(e.x + e.w / 2, e.y + e.h / 2, '#fff1a8', 14);
      floatText(e.x, e.y - 10, '+75', '#ffe27a');
    } else {
      damage();
    }
  }
}

function damage(force = false) {
  if (state !== 'play' || (!force && player.invuln > 0)) return;
  lives--;
  player.invuln = 120;
  shake = 15; flash = 12;
  SFX.hit();
  burst(player.x + player.w / 2, player.y + player.h / 2, '#ff6b6b', 22);
  if (lives <= 0) {
    saveScore();
    state = 'gameover';
  } else {
    player.x = level.start[0]; player.y = level.start[1];
    player.vx = 0; player.vy = 0; player.climbing = false;
    player.fallTop = player.y;
  }
}

function checkFoodAndDoor() {
  const pcx = player.x + player.w / 2, pcy = player.y + player.h / 2;
  for (const f of foods) {
    if (f.got) continue;
    const fy = f.y + Math.sin(time * .06 + f.phase) * 4;
    const dx = pcx - f.x, dy = pcy - fy;
    if (dx * dx + dy * dy < 38 * 38) {
      f.got = true; collected++; score += 100;
      player.weight = Math.min(foods.length, player.weight + 1);
      SFX.collect(collected);
      burst(f.x, fy, foodColor(f.type), 18);
      floatText(f.x - 12, fy - 18, '+100', '#fff4c2');
      if (collected === foods.length) {
        doorOpen = true; SFX.clear();
        floatText(W / 2 - 90, 150, 'LA PORTA È APERTA!', '#ffe17a');
      }
    }
  }
  if (doorOpen && overlap(player, door)) {
    score += 1000 + lives * 50;
    saveScore();
    SFX.clear();
    state = 'levelclear'; clearTimer = 145;
    burst(door.x + door.w / 2, door.y + 40, '#ffe17a', 34);
  }
}

function foodColor(t) {
  return ({ apple: '#ff4d5e', cake: '#ff9ec4', fish: '#6fd6ff', cheese: '#ffd447',
    donut: '#ff8fd0', chicken: '#e8894a', croissant: '#ffc764', carrot: '#ff9a3c' })[t] || '#fff';
}

function updateParticles() {
  for (const p of particles) {
    p.x += p.vx; p.y += p.vy;
    p.vy += .13; p.vx *= .985;
    p.spin += p.vs; p.life--;
  }
  particles = particles.filter(p => p.life > 0);
  for (const t of texts) { t.y -= .7; t.life--; }
  texts = texts.filter(t => t.life > 0);
  if (shake > 0) shake--;
  if (flash > 0) flash--;
}

function update() {
  time++;
  if (state === 'play') {
    updatePlayer();
    updateEnemies();
    updateHazards();
    updateScene();
    checkFoodAndDoor();
  } else if (state === 'levelclear') {
    clearTimer--;
    if (clearTimer <= 0) {
      if (levelIndex + 1 < LEVELS.length) { prepLevel(levelIndex + 1); state = 'play'; }
      else { state = 'victory'; SFX.win(); saveScore(); }
    }
  }
  updateParticles();
}

/* =========================================================================
   DISEGNO DEGLI SFONDI
   ========================================================================= */
function drawSky(P) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, P.sky[0]); g.addColorStop(1, P.sky[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
function drawSun(x, y, r, color) {
  ctx.save();
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.6);
  g.addColorStop(0, color); g.addColorStop(.35, color + 'aa'); g.addColorStop(1, color + '00');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2.6, 0, 7); ctx.fill();
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  ctx.restore();
}
function drawCloud(x, y, s, alpha) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x, y, 26 * s, 0, 7);
  ctx.arc(x + 30 * s, y - 14 * s, 34 * s, 0, 7);
  ctx.arc(x + 68 * s, y, 27 * s, 0, 7);
  ctx.arc(x + 34 * s, y + 14 * s, 30 * s, 0, 7);
  ctx.fill(); ctx.restore();
}
function drawHills(P, t) {
  const layers = [
    { c: P.far,  base: 430, amp: 34, freq: .0038, sp: .55 },
    { c: P.mid,  base: 520, amp: 44, freq: .0031, sp: 1.05 },
    { c: P.near, base: 612, amp: 30, freq: .0052, sp: 1.6 }
  ];
  layers.forEach((L, i) => {
    ctx.fillStyle = L.c; ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 14) {
      const y = L.base
        + Math.sin((x + t * L.sp) * L.freq + i * 1.7) * L.amp
        + Math.sin((x + t * L.sp * .5) * L.freq * 2.4) * L.amp * .32;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
  });
}
function drawFlower(x, y, c, s = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.strokeStyle = '#3a9b52'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 18); ctx.stroke();
  ctx.fillStyle = c;
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 2 / 5;
    ctx.beginPath(); ctx.arc(Math.cos(a) * 7, -4 + Math.sin(a) * 7, 5, 0, 7); ctx.fill();
  }
  ctx.fillStyle = '#ffe27a'; ctx.beginPath(); ctx.arc(0, -4, 4, 0, 7); ctx.fill();
  ctx.restore();
}
function drawTree(x, y, s) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.fillStyle = '#8b5a2b'; rr(-12, -30, 24, 70, 6); ctx.fill();
  ctx.fillStyle = '#3ba05f';
  [[0,-70,44],[-32,-50,34],[34,-50,36],[0,-100,30]].forEach(([cx,cy,r]) => {
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
  });
  ctx.fillStyle = 'rgba(255,255,255,.18)';
  ctx.beginPath(); ctx.arc(-14, -84, 16, 0, 7); ctx.fill();
  ctx.restore();
}
function drawButterfly(x, y, t, c) {
  ctx.save(); ctx.translate(x, y);
  const flap = .55 + Math.abs(Math.sin(t * .18)) * .5;
  ctx.fillStyle = c;
  ctx.beginPath(); ctx.ellipse(-7, 0, 9 * flap, 11, -.3, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(7, 0, 9 * flap, 11, .3, 0, 7); ctx.fill();
  ctx.fillStyle = '#3b2350'; rr(-1.5, -6, 3, 14, 2); ctx.fill();
  ctx.restore();
}

function drawBackdrop() {
  const P = level.palette, t = time;
  drawSky(P);

  if (level.theme === 'banquet') {
    // Notte stellata, luna e castello sullo sfondo
    ctx.save();
    for (let i = 0; i < 70; i++) {
      const x = (i * 197 + 53) % W, y = (i * 89 + 31) % 430;
      const a = .35 + Math.sin(t * .04 + i) * .3;
      ctx.fillStyle = `rgba(255,246,200,${Math.max(.08, a)})`;
      ctx.fillRect(x, y, 2 + (i % 3), 2 + (i % 3));
    }
    ctx.restore();
    drawSun(1080, 108, 44, '#ffe9a8');
    ctx.fillStyle = 'rgba(30,12,55,.85)';
    [80, 330, 620, 900, 1140].forEach((x, i) => {
      const h = 180 + (i % 3) * 60;
      ctx.fillRect(x, 520 - h, 120, h + 140);
      ctx.beginPath(); ctx.moveTo(x - 12, 520 - h); ctx.lineTo(x + 60, 470 - h); ctx.lineTo(x + 132, 520 - h); ctx.fill();
    });
    // bandiere e lampadari
    for (let i = 0; i < 4; i++) {
      const x = 170 + i * 310;
      ctx.fillStyle = i % 2 ? '#c0406f' : '#e0aa3c';
      ctx.beginPath(); ctx.moveTo(x, 40); ctx.lineTo(x + 46, 40); ctx.lineTo(x + 23, 128); ctx.fill();
      ctx.fillStyle = '#ffe9a8'; ctx.beginPath(); ctx.arc(x + 23, 46, 6, 0, 7); ctx.fill();
    }
    for (let i = 0; i < 3; i++) {
      const x = 250 + i * 400, y = 96 + Math.sin(t * .02 + i) * 5;
      ctx.strokeStyle = 'rgba(255,226,140,.7)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, y); ctx.stroke();
      ctx.fillStyle = '#ffd76e'; ctx.beginPath(); ctx.ellipse(x, y + 12, 34, 10, 0, 0, 7); ctx.fill();
      for (let k = -2; k <= 2; k++) {
        ctx.fillStyle = '#fff0b0'; ctx.beginPath();
        ctx.arc(x + k * 14, y + 22 + Math.abs(k) * 4, 5, 0, 7); ctx.fill();
      }
    }
    drawHills(P, t);
  } else {
    drawSun(level.theme === 'kitchen' ? 1080 : 150, 110, 46,
      level.theme === 'garden' ? '#fff6b0' : '#ffd98a');
    for (let i = 0; i < 6; i++) {
      const x = ((i * 260 + t * (5 + i)) % (W + 260)) - 130;
      drawCloud(x, 70 + (i % 3) * 46, .8 + (i % 3) * .25, .5);
    }
    drawHills(P, t);

    if (level.theme === 'kitchen') {
      // Piastrelle e grandi finestre
      ctx.save(); ctx.globalAlpha = .18; ctx.strokeStyle = '#fff6dc'; ctx.lineWidth = 2;
      for (let x = 0; x < W; x += 80) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 470); ctx.stroke(); }
      for (let y = 0; y < 470; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      ctx.restore();
      // Padelle appese
      for (let i = 0; i < 6; i++) {
        const x = 130 + i * 200, y = 90 + Math.sin(t * .02 + i) * 3;
        ctx.strokeStyle = '#7c4a30'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, y); ctx.stroke();
        ctx.fillStyle = '#5b5b68'; ctx.beginPath(); ctx.arc(x, y + 20, 22, 0, 7); ctx.fill();
        ctx.fillStyle = '#8a8a99'; ctx.beginPath(); ctx.arc(x - 6, y + 14, 7, 0, 7); ctx.fill();
      }
      // Vapore
      ctx.save(); ctx.globalAlpha = .22; ctx.fillStyle = '#fff';
      for (let i = 0; i < 5; i++) {
        const x = 220 + i * 230, y = 420 + Math.sin(t * .02 + i) * 22;
        ctx.beginPath(); ctx.arc(x, y, 26, 0, 7); ctx.fill();
      }
      ctx.restore();
    }

    if (level.theme === 'garden') {
      drawTree(90, 610, 1.25); drawTree(640, 615, 1.05); drawTree(1210, 610, 1.2);
      for (let i = 0; i < 22; i++) {
        const x = (i * 83 + 21) % W, y = 640 + (i % 3) * 12;
        drawFlower(x, y, ['#ff6f91', '#ffd166', '#c792ea'][i % 3], .8 + (i % 4) * .12);
      }
      for (let i = 0; i < 5; i++)
        drawButterfly((i * 290 + t * (18 + i * 3)) % (W + 80) - 40,
          170 + (i % 3) * 90 + Math.sin(t * .03 + i) * 16, t + i, ['#ff8fb1', '#ffd166', '#9be7ff'][i % 3]);
    }

    if (level.theme === 'bakery') {
      // Campi di grano e forni
      ctx.save(); ctx.strokeStyle = 'rgba(255,238,170,.75)'; ctx.lineWidth = 3;
      for (let i = 0; i < 60; i++) {
        const x = (i * 31) % W, y = 590 + (i % 4) * 14;
        const sway = Math.sin(t * .03 + i) * 5;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + sway, y - 36); ctx.stroke();
        ctx.fillStyle = '#ffe08a'; ctx.beginPath(); ctx.ellipse(x + sway, y - 42, 5, 10, .3, 0, 7); ctx.fill();
      }
      ctx.restore();
      for (let i = 0; i < 4; i++) {
        const x = 120 + i * 320, y = 470;
        ctx.fillStyle = '#a96835'; rr(x, y, 150, 120, 12); ctx.fill();
        ctx.fillStyle = '#5e3318'; rr(x + 16, y + 22, 118, 80, 40); ctx.fill();
        const glow = ctx.createRadialGradient(x + 75, y + 66, 4, x + 75, y + 66, 66);
        glow.addColorStop(0, 'rgba(255,220,110,.85)'); glow.addColorStop(1, 'rgba(255,120,40,0)');
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x + 75, y + 66, 66, 0, 7); ctx.fill();
      }
    }
  }

  // Velatura finale per profondità
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * .35, W / 2, H / 2, W * .78);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(24,8,40,.28)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
}

/* ---------- Elementi di gioco ---------- */
function drawPlatform(p) {
  const P = level.palette;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.22)';
  rr(p.x + 4, p.y + 7, p.w, p.h + 5, 6); ctx.fill();
  const g = ctx.createLinearGradient(0, p.y, 0, p.y + p.h);
  g.addColorStop(0, P.top); g.addColorStop(1, P.side);
  ctx.fillStyle = g; rr(p.x, p.y, p.w, p.h, 6); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.6)';
  rr(p.x + 4, p.y + 2, p.w - 8, 3, 2); ctx.fill();
  ctx.strokeStyle = P.line; ctx.lineWidth = 2; ctx.globalAlpha = .5;
  for (let x = p.x + 34; x < p.x + p.w - 8; x += 46) {
    ctx.beginPath(); ctx.moveTo(x, p.y + 6); ctx.lineTo(x, p.y + p.h - 2); ctx.stroke();
  }
  ctx.restore();
}
function drawLadder(l) {
  const P = level.palette;
  ctx.save();
  ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 11;
  ctx.beginPath(); ctx.moveTo(l.x + 3, l.y); ctx.lineTo(l.x + 3, l.y + l.h);
  ctx.moveTo(l.x + l.w - 3, l.y); ctx.lineTo(l.x + l.w - 3, l.y + l.h); ctx.stroke();
  ctx.strokeStyle = P.ladder; ctx.lineWidth = 7; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(l.x + 2, l.y); ctx.lineTo(l.x + 2, l.y + l.h);
  ctx.moveTo(l.x + l.w - 2, l.y); ctx.lineTo(l.x + l.w - 2, l.y + l.h); ctx.stroke();
  ctx.lineWidth = 5;
  for (let y = l.y + 12; y < l.y + l.h - 4; y += 26) {
    ctx.beginPath(); ctx.moveTo(l.x + 2, y); ctx.lineTo(l.x + l.w - 2, y); ctx.stroke();
  }
  ctx.restore();
}
function drawDoor() {
  const d = door, open = doorOpen;
  ctx.save();
  if (open) {
    const g = ctx.createRadialGradient(d.x + d.w / 2, d.y + d.h / 2, 4, d.x + d.w / 2, d.y + d.h / 2, 100);
    g.addColorStop(0, 'rgba(255,240,160,.85)'); g.addColorStop(1, 'rgba(255,220,100,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(d.x + d.w / 2, d.y + d.h / 2, 100, 0, 7); ctx.fill();
  }
  ctx.fillStyle = open ? '#ffe9a0' : '#7b4a2e';
  ctx.beginPath();
  ctx.moveTo(d.x, d.y + d.h); ctx.lineTo(d.x, d.y + 24);
  ctx.quadraticCurveTo(d.x + d.w / 2, d.y - 18, d.x + d.w, d.y + 24);
  ctx.lineTo(d.x + d.w, d.y + d.h); ctx.closePath(); ctx.fill();
  ctx.fillStyle = open ? '#fff8d0' : '#5e3620';
  rr(d.x + 7, d.y + 30, d.w - 14, d.h - 34, 4); ctx.fill();
  ctx.fillStyle = '#ffd76e'; ctx.beginPath(); ctx.arc(d.x + d.w - 16, d.y + d.h / 2 + 8, 4, 0, 7); ctx.fill();
  ctx.fillStyle = open ? '#7b4a2e' : '#f6e2b0';
  ctx.font = 'bold 12px Trebuchet MS, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(open ? 'APERTA' : 'CHIUSA', d.x + d.w / 2, d.y - 28);
  ctx.restore();
}

function drawFood(f) {
  if (f.got) return;
  const y = f.y + Math.sin(time * .06 + f.phase) * 4;
  const x = f.x;
  ctx.save(); ctx.translate(x, y);
  ctx.save(); ctx.globalAlpha = .25; ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.ellipse(0, 20, 14, 4, 0, 0, 7); ctx.fill(); ctx.restore();
  const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 30);
  glow.addColorStop(0, foodColor(f.type) + '88'); glow.addColorStop(1, foodColor(f.type) + '00');
  ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, 30, 0, 7); ctx.fill();
  ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(70,35,20,.65)';
  switch (f.type) {
    case 'apple':
      ctx.fillStyle = '#ff4d5e'; ctx.beginPath(); ctx.arc(0, 2, 15, 0, 7); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#6b3f22'; ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(2, -20); ctx.stroke();
      ctx.fillStyle = '#57c06a'; ctx.beginPath(); ctx.ellipse(9, -15, 8, 4, -.5, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.ellipse(-5, -3, 4, 6, -.4, 0, 7); ctx.fill();
      break;
    case 'cake':
      ctx.fillStyle = '#f7c98b'; ctx.beginPath(); ctx.moveTo(-15, 13); ctx.lineTo(-11, -6); ctx.lineTo(11, -6); ctx.lineTo(15, 13); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff9ec4'; ctx.beginPath(); ctx.moveTo(-12, -5); ctx.quadraticCurveTo(0, -15, 12, -5); ctx.quadraticCurveTo(0, 0, -12, -5); ctx.fill();
      ctx.fillStyle = '#ff3b5c'; ctx.beginPath(); ctx.arc(0, -10, 4, 0, 7); ctx.fill();
      break;
    case 'fish':
      ctx.fillStyle = '#6fd6ff'; ctx.beginPath(); ctx.ellipse(0, 0, 15, 9, 0, 0, 7); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(13, 0); ctx.lineTo(24, -9); ctx.lineTo(24, 9); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#243b55'; ctx.beginPath(); ctx.arc(-8, -2, 2.5, 0, 7); ctx.fill();
      break;
    case 'cheese':
      ctx.fillStyle = '#ffd447'; ctx.beginPath(); ctx.moveTo(-16, 12); ctx.lineTo(16, 12); ctx.lineTo(12, -10); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e0a92c';
      [[-5,5,3],[6,4,4],[0,-2,2.5]].forEach(([cx,cy,r]) => { ctx.beginPath(); ctx.arc(cx,cy,r,0,7); ctx.fill(); });
      break;
    case 'donut':
      ctx.fillStyle = '#e8a75b'; ctx.beginPath(); ctx.arc(0, 0, 15, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff8fd0'; ctx.beginPath(); ctx.arc(0, -1, 14, Math.PI, 0); ctx.lineTo(8, 5); ctx.quadraticCurveTo(0, 12, -8, 5); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 1, 5, 0, 7); ctx.fill();
      ctx.fillStyle = '#6b3f22'; ctx.beginPath(); ctx.arc(0, 1, 4, 0, 7); ctx.fill();
      break;
    case 'chicken':
      ctx.fillStyle = '#e8894a'; ctx.beginPath(); ctx.ellipse(-3, 3, 13, 10, .3, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#f7e4c0'; ctx.beginPath(); ctx.arc(8, -8, 6, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff6e0'; ctx.beginPath(); ctx.arc(-11, -3, 5, 0, 7); ctx.fill();
      break;
    case 'croissant':
      ctx.fillStyle = '#ffc764';
      ctx.beginPath(); ctx.moveTo(-17, 6); ctx.quadraticCurveTo(0, -22, 17, 6);
      ctx.quadraticCurveTo(8, -4, 0, 8); ctx.quadraticCurveTo(-8, -4, -17, 6); ctx.fill(); ctx.stroke();
      break;
    case 'carrot':
      ctx.fillStyle = '#ff9a3c'; ctx.beginPath(); ctx.moveTo(-9, -6); ctx.lineTo(9, -6); ctx.lineTo(0, 17); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#4fb96a'; ctx.lineWidth = 4; ctx.beginPath();
      ctx.moveTo(-2, -7); ctx.lineTo(-8, -16); ctx.moveTo(2, -7); ctx.lineTo(9, -16); ctx.stroke();
      break;
  }
  ctx.restore();
}

function drawSpikes(h) {
  const r = hazardRect(h);
  const n = Math.max(1, Math.round(r.w / 12));
  const step = r.w / n;
  ctx.save();
  ctx.fillStyle = '#4c5563'; rr(r.x - 2, r.y + r.h - 5, r.w + 4, 8, 2); ctx.fill();
  for (let i = 0; i < n; i++) {
    const x = r.x + i * step;
    const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    g.addColorStop(0, '#f0f4f8'); g.addColorStop(1, '#8b96a6');
    ctx.fillStyle = g; ctx.strokeStyle = '#48525f'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, r.y + r.h); ctx.lineTo(x + step / 2, r.y);
    ctx.lineTo(x + step, r.y + r.h); ctx.closePath();
    ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

function drawFlame(h) {
  const r = hazardRect(h);
  const w = Math.sin(time * .17 + h.phase) * 3;
  ctx.save();
  const glow = ctx.createRadialGradient(r.x + r.w / 2, r.y + r.h / 2, 2,
    r.x + r.w / 2, r.y + r.h / 2, r.w);
  glow.addColorStop(0, 'rgba(255,180,60,.55)'); glow.addColorStop(1, 'rgba(255,120,40,0)');
  ctx.fillStyle = glow; ctx.fillRect(r.x - 14, r.y - 14, r.w + 28, r.h + 28);
  [[r.w * .55, '#ff5a2e', 0], [r.w * .38, '#ff9b3d', 2], [r.w * .18, '#ffe27a', 4]].forEach(([sw, col, dy], i) => {
    const cx = r.x + r.w / 2 + w * (i - 1) * .5;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(cx - sw / 2, r.y + r.h);
    ctx.quadraticCurveTo(cx - sw / 2 + 2, r.y + r.h * .45, cx, r.y + dy + (i === 2 ? 4 : 0));
    ctx.quadraticCurveTo(cx + sw / 2 - 2, r.y + r.h * .45, cx + sw / 2, r.y + r.h);
    ctx.closePath(); ctx.fill();
  });
  ctx.restore();
}

function drawRocket(h) {
  const r = hazardRect(h);
  ctx.save();
  ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
  ctx.scale(h.dir, 1);
  const flick = 8 + Math.abs(Math.sin(time * .3 + h.phase)) * 7;
  ctx.fillStyle = 'rgba(255,150,50,.75)';
  ctx.beginPath(); ctx.moveTo(-19, -5); ctx.lineTo(-19 - flick, 0); ctx.lineTo(-19, 5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#d7dde6'; ctx.strokeStyle = '#5c6472'; ctx.lineWidth = 2;
  rr(-18, -7, 27, 14, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ff6b5a';
  ctx.beginPath(); ctx.moveTo(9, -7); ctx.lineTo(19, 0); ctx.lineTo(9, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#7d8796';
  ctx.beginPath(); ctx.moveTo(-12, -6); ctx.lineTo(-20, -13); ctx.lineTo(-6, -7); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-12, 6); ctx.lineTo(-20, 13); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#3a4553'; ctx.beginPath(); ctx.arc(2, 0, 3.5, 0, 7); ctx.fill();
  ctx.restore();
}

function drawStalactite(h) {
  const r = hazardRect(h);
  ctx.save();
  const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
  g.addColorStop(0, '#8d7ba6'); g.addColorStop(1, '#4b3a63');
  ctx.fillStyle = g; ctx.strokeStyle = '#2f2340'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(r.x, r.y); ctx.lineTo(r.x + r.w, r.y);
  ctx.lineTo(r.x + r.w / 2, r.y + r.h); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(r.x + r.w * .35, r.y + 4);
  ctx.lineTo(r.x + r.w * .5, r.y + r.h - 6); ctx.stroke();
  ctx.restore();
}

function drawNoParking(x) {
  ctx.save();
  ctx.fillStyle = '#6b7280'; ctx.fillRect(x + 12, 556, 6, 104);
  ctx.fillStyle = '#4b5563'; rr(x + 5, 652, 20, 8, 2); ctx.fill();
  const cx = x + 15, cy = 540, r = 20;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
  ctx.strokeStyle = '#1d4ed8'; ctx.lineWidth = 5; ctx.stroke();
  ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(cx - 13, cy + 13); ctx.lineTo(cx + 13, cy - 13); ctx.stroke();
  ctx.fillStyle = '#1f2937';
  ctx.font = 'bold 10px Trebuchet MS, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('DIVIETO DI SOSTA', cx, 506);
  ctx.restore();
}

function drawMaggiolone(x, w) {
  if (!maggioloneImg || !maggioloneImg.complete || !maggioloneImg.naturalWidth) return;
  const h = w * maggioloneImg.naturalHeight / maggioloneImg.naturalWidth;
  ctx.drawImage(maggioloneImg, x, 660 - h, w, h);
}

function drawScene() {
  if (!scene) return;
  drawNoParking(scene.signX);
  drawMaggiolone(scene.carX, 140);

  const vh = 190, vw = vh * 227 / 411;
  const cx = scene.vigileX + vw / 2, cy = 660 - vh / 2;
  drawSprite(vigileImgs[scene.frame], cx, cy, vw, vh);

  if (scene.fined && scene.cooldown > 140) {
    ctx.save();
    ctx.fillStyle = '#fffdf2'; ctx.strokeStyle = '#b91c1c'; ctx.lineWidth = 2;
    rr(scene.vigileX + vw - 16, 546, 34, 22, 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#b91c1c'; ctx.font = 'bold 9px Trebuchet MS, sans-serif';
    ctx.textAlign = 'center'; ctx.fillText('MULTA', scene.vigileX + vw + 1, 560);
    ctx.restore();
  }
}

function drawHazards() {
  for (const h of hazards) {
    if (h.type === 'spikes') drawSpikes(h);
    else if (h.type === 'flame') drawFlame(h);
    else if (h.type === 'rocket') drawRocket(h);
    else if (h.type === 'stalactite') drawStalactite(h);
  }
}

function drawEnemy(e) {
  if (e.dead) return;
  ctx.save(); ctx.translate(e.x + e.w / 2, e.y + e.h / 2);
  if (e.dir < 0) ctx.scale(-1, 1);
  const bob = Math.sin(time * .12 + e.phase) * 2;
  ctx.translate(0, bob);
  ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(30,20,35,.8)';
  switch (e.type) {
    case 'rat': {
      ctx.fillStyle = '#8c8794'; ctx.beginPath(); ctx.ellipse(0, 4, 20, 12, 0, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#a8a3b0'; ctx.beginPath(); ctx.arc(15, -3, 10, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ef9ab8'; ctx.beginPath(); ctx.arc(23, -1, 3, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff4d5e'; ctx.beginPath(); ctx.arc(18, -6, 2.6, 0, 7); ctx.fill();
      ctx.strokeStyle = '#c98fa5'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-18, 6); ctx.quadraticCurveTo(-34, 12, -30, -6); ctx.stroke();
      break;
    }
    case 'ghost': {
      ctx.fillStyle = 'rgba(245,248,255,.93)';
      ctx.beginPath(); ctx.arc(0, -3, 17, Math.PI, 0);
      ctx.lineTo(17, 12); ctx.quadraticCurveTo(9, 6, 2, 13);
      ctx.quadraticCurveTo(-6, 5, -17, 12); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#3a2b55';
      ctx.beginPath(); ctx.arc(-6, -5, 3, 0, 7); ctx.arc(6, -5, 3, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(0, 3, 3, 0, Math.PI); ctx.stroke();
      break;
    }
    case 'fire': {
      const g = ctx.createRadialGradient(0, 2, 2, 0, 2, 20);
      g.addColorStop(0, '#fff7b0'); g.addColorStop(.45, '#ff9b3d'); g.addColorStop(1, '#e5332f');
      ctx.fillStyle = g; ctx.beginPath();
      ctx.moveTo(0, -18); ctx.quadraticCurveTo(14, -4, 10, 10);
      ctx.quadraticCurveTo(0, 20, -10, 10); ctx.quadraticCurveTo(-14, -4, 0, -18); ctx.fill();
      ctx.fillStyle = '#fff3b0'; ctx.beginPath(); ctx.arc(-3, 5, 4, 0, 7); ctx.fill();
      break;
    }
    case 'bee': {
      ctx.fillStyle = '#ffd447'; ctx.beginPath(); ctx.ellipse(0, 2, 16, 11, 0, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#3b2a1a'; ctx.beginPath(); ctx.ellipse(-4, 2, 4, 10, 0, 0, 7); ctx.fill();
      ctx.save(); ctx.globalAlpha = .7; ctx.fillStyle = '#dff4ff';
      const f = .5 + Math.abs(Math.sin(time * .35 + e.phase)) * .6;
      ctx.beginPath(); ctx.ellipse(-2, -10, 11 * f, 6, -.4, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(6, -10, 9 * f, 5, .4, 0, 7); ctx.fill(); ctx.restore();
      ctx.fillStyle = '#2b2018'; ctx.beginPath(); ctx.arc(12, 0, 2.5, 0, 7); ctx.fill();
      break;
    }
    case 'butterfly': drawButterfly(0, 0, time + e.phase, '#c792ea'); break;
    case 'snail': {
      ctx.fillStyle = '#b7d36f'; rr(-16, 2, 30, 10, 5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e8894a'; ctx.beginPath(); ctx.arc(0, -2, 13, 0, 7); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#9c5c2e'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, -2, 8, .4, 5.4); ctx.stroke();
      ctx.fillStyle = '#2f4a22'; ctx.beginPath(); ctx.arc(15, 4, 2.5, 0, 7); ctx.arc(11, 4, 2.5, 0, 7); ctx.fill();
      break;
    }
  }
  ctx.restore();
}

function drawChef() {
  const p = player;
  if (p.invuln > 0 && Math.floor(p.invuln / 6) % 2 === 0) return;

  // Frame: 0-5 corsa, 6-9 salto, 10-13 scala (fallback procedurale)
  const walking = Math.abs(p.vx) > .5 && p.onGround;
  const n = playerImgs.length;
  const climbing = p.climbing && n > 13;
  let frame = 0;                       // fermo
  if (climbing) frame = 10 + (Math.floor(p.walk / 3) % 4);
  else if (walking) frame = Math.floor(p.walk / 4) % Math.min(6, n);
  else if (!p.onGround || p.vy < -2 || p.vy > 4) {
    if (n > 9) frame = 6 + (p.vy < -4 ? 0 : p.vy < 0 ? 1 : p.vy < 4 ? 2 : 3);
    else frame = 6 % n;
  }
  const sprite = playerImgs[frame] || playerImgs[0];
  const jumping = frame >= 6 && !climbing;
  const dh = jumping ? 116 : 96;
  // I frame scala hanno proporzioni diverse: dimensioni fisse per non
  // rimpicciolire o ingrandire passando da un fotogramma all'altro.
  const dw = climbing ? 66
    : sprite && sprite.naturalWidth ? dh * sprite.naturalWidth / sprite.naturalHeight : dh * .7;
  if (drawSprite(sprite, p.x + p.w / 2, p.y + p.h - dh / 2 + 2, dw, dh, p.face < 0)) {
    return;
  }

  ctx.save();
  ctx.translate(p.x + p.w / 2, p.y + p.h);
  ctx.scale(p.face, 1);

  const stretch = p.climbing ? 1.04 : (p.vy < -4 ? 1.07 : (p.onGround && p.vy > 6 ? .94 : 1));
  const squash = 2 - stretch;
  ctx.scale(squash, stretch);

  const swing = walking ? Math.sin(p.walk) * 7 : (p.climbing ? Math.sin(p.walk) * 6 : 0);
  const P = level.palette;

  // ombra
  ctx.save(); ctx.globalAlpha = .2; ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.ellipse(0, 2, 20, 5, 0, 0, 7); ctx.fill(); ctx.restore();

  // gambe
  ctx.strokeStyle = '#3d4a6b'; ctx.lineWidth = 9; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-7, -18); ctx.lineTo(-8 + swing, -2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(7, -18); ctx.lineTo(8 - swing, -2); ctx.stroke();
  ctx.fillStyle = '#4a3326';
  rr(-16 + swing, -5, 15, 6, 3); ctx.fill();
  rr(1 - swing, -5, 15, 6, 3); ctx.fill();

  // corpo / grembiule
  ctx.fillStyle = '#fffaf0'; ctx.strokeStyle = '#d9cdb8'; ctx.lineWidth = 2;
  rr(-17, -44, 34, 28, 9); ctx.fill(); ctx.stroke();
  ctx.fillStyle = P.accent; rr(-17, -44, 34, 7, 4); ctx.fill();
  ctx.fillStyle = '#e7ded0'; rr(-12, -38, 24, 20, 5); ctx.fill();
  ctx.fillStyle = '#c9bda9';
  ctx.beginPath(); ctx.arc(-6, -31, 2, 0, 7); ctx.arc(6, -31, 2, 0, 7); ctx.fill();

  // braccia
  ctx.strokeStyle = '#fffaf0'; ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(-15, -39); ctx.lineTo(-24 - swing * .5, -25); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(15, -39); ctx.lineTo(24 + swing * .5, -25); ctx.stroke();
  ctx.fillStyle = '#f2c9a0';
  ctx.beginPath(); ctx.arc(-24 - swing * .5, -24, 5, 0, 7); ctx.arc(24 + swing * .5, -24, 5, 0, 7); ctx.fill();

  // testa
  ctx.fillStyle = '#f6cda4'; ctx.strokeStyle = '#c98f66'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, -56, 15, 0, 7); ctx.fill(); ctx.stroke();
  const blink = (time % 190) < 7;
  ctx.fillStyle = '#38251f';
  if (blink) {
    ctx.fillRect(-8, -58, 6, 2); ctx.fillRect(3, -58, 6, 2);
  } else {
    ctx.beginPath(); ctx.arc(-5, -58, 2.4, 0, 7); ctx.arc(5, -58, 2.4, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-4.3, -58.8, .8, 0, 7); ctx.arc(5.7, -58.8, .8, 0, 7); ctx.fill();
  }
  ctx.fillStyle = '#ef9b96'; ctx.globalAlpha = .55;
  ctx.beginPath(); ctx.arc(-10, -52, 3.5, 0, 7); ctx.arc(10, -52, 3.5, 0, 7); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#a45e46'; ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.arc(0, -51, 5, .15, Math.PI - .15); ctx.stroke();

  // cappello da cuoco
  ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#ddd6c8'; ctx.lineWidth = 2;
  rr(-12, -70, 24, 9, 3); ctx.fill(); ctx.stroke();
  [[-10, -76, 9], [0, -82, 11], [10, -76, 9]].forEach(([cx, cy, r]) => {
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill(); ctx.stroke();
  });
  ctx.restore();
}

function drawParticles() {
  for (const p of particles) {
    ctx.save(); ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.translate(p.x, p.y); ctx.rotate(p.spin);
    ctx.fillStyle = p.color;
    if (p.size > 5) star(0, 0, p.size, p.size * .45, 4);
    else rr(-p.size / 2, -p.size / 2, p.size, p.size, 1);
    ctx.fill(); ctx.restore();
  }
  ctx.save();
  ctx.font = 'bold 22px Trebuchet MS, sans-serif';
  ctx.textAlign = 'center'; ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(40,20,50,.7)';
  for (const t of texts) {
    ctx.globalAlpha = Math.min(1, t.life / 22);
    ctx.strokeText(t.text, t.x, t.y);
    ctx.fillStyle = t.color; ctx.fillText(t.text, t.x, t.y);
  }
  ctx.restore();
}

/* ---------- HUD e schermate ---------- */
function drawHUD() {
  ctx.save();
  const g = ctx.createLinearGradient(0, 0, 0, 78);
  g.addColorStop(0, 'rgba(24,10,42,.82)'); g.addColorStop(1, 'rgba(24,10,42,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 78);

  ctx.textAlign = 'left'; ctx.fillStyle = '#ffe1a0';
  ctx.font = 'bold 21px Trebuchet MS, sans-serif';
  ctx.fillText(level.name, 18, 32);
  ctx.font = '13px Trebuchet MS, sans-serif'; ctx.fillStyle = '#d8c8ee';
  ctx.fillText(`Livello ${levelIndex + 1}/${LEVELS.length}  ·  ${level.tip}`, 18, 53);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff4d0'; ctx.font = 'bold 26px Trebuchet MS, sans-serif';
  ctx.fillText(String(score).padStart(6, '0'), W / 2, 36);
  ctx.font = '12px Trebuchet MS, sans-serif'; ctx.fillStyle = '#cbb9e6';
  ctx.fillText(`RECORD ${String(hiScore).padStart(6, '0')}`, W / 2, 56);

  ctx.textAlign = 'right';
  for (let i = 0; i < 3; i++) drawHeart(W - 30 - i * 34, 24, i < lives ? '#ff5f7a' : 'rgba(255,255,255,.18)');
  ctx.font = 'bold 16px Trebuchet MS, sans-serif'; ctx.fillStyle = '#fff0c8';
  ctx.fillText(`CIBO ${collected}/${foods.length}  ·  M audio  P pausa  R ricomincia`, W - 18, 62);
  ctx.restore();
}
function drawHeart(x, y, c) {
  ctx.save(); ctx.fillStyle = c; ctx.strokeStyle = 'rgba(40,15,50,.6)'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y + 8);
  ctx.bezierCurveTo(x - 18, y - 4, x - 9, y - 17, x, y - 6);
  ctx.bezierCurveTo(x + 9, y - 17, x + 18, y - 4, x, y + 8);
  ctx.fill(); ctx.stroke(); ctx.restore();
}
function panel(x, y, w, h) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 12;
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, 'rgba(46,22,78,.95)'); g.addColorStop(1, 'rgba(24,12,48,.96)');
  ctx.fillStyle = g; rr(x, y, w, h, 22); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,220,140,.55)'; ctx.lineWidth = 3; rr(x, y, w, h, 22); ctx.stroke();
  ctx.restore();
}
function titleText(text, y, size, color) {
  ctx.save();
  ctx.textAlign = 'center'; ctx.font = `bold ${size}px Trebuchet MS, sans-serif`;
  ctx.lineWidth = 9; ctx.strokeStyle = 'rgba(30,10,45,.85)';
  ctx.strokeText(text, W / 2, y);
  const g = ctx.createLinearGradient(0, y - size, 0, y + 8);
  g.addColorStop(0, '#fff5c4'); g.addColorStop(.5, color); g.addColorStop(1, '#ff8f4d');
  ctx.fillStyle = g; ctx.fillText(text, W / 2, y);
  ctx.restore();
}

function drawSausage(cx, cy, angle, length = 32, radius = 9) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);

  ctx.save(); ctx.globalAlpha = .28; ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.ellipse(0, radius + 4, length / 2, radius * .65, 0, 0, 7); ctx.fill();
  ctx.restore();

  const g = ctx.createLinearGradient(0, -radius, 0, radius);
  g.addColorStop(0, '#e08a5b');
  g.addColorStop(.45, '#b64b2e');
  g.addColorStop(1, '#7e2d1b');
  ctx.fillStyle = g; ctx.strokeStyle = '#5a2314'; ctx.lineWidth = 2;
  const hl = length / 2 - radius;
  ctx.beginPath();
  ctx.moveTo(-hl, -radius); ctx.lineTo(hl, -radius);
  ctx.quadraticCurveTo(length / 2, -radius, length / 2, 0);
  ctx.quadraticCurveTo(length / 2, radius, hl, radius);
  ctx.lineTo(-hl, radius);
  ctx.quadraticCurveTo(-length / 2, radius, -length / 2, 0);
  ctx.quadraticCurveTo(-length / 2, -radius, -hl, -radius);
  ctx.closePath(); ctx.fill(); ctx.stroke();

  ctx.strokeStyle = 'rgba(255,196,150,.55)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-hl + 3, -radius + 3); ctx.lineTo(hl - 3, -radius + 3); ctx.stroke();

  ctx.strokeStyle = '#8f3a20'; ctx.lineWidth = 2;
  for (const s of [-1, 1]) {
    const ex = s * (length / 2 - 3);
    ctx.beginPath();
    ctx.moveTo(ex, -radius + 1);
    ctx.quadraticCurveTo(ex + s * 4, 0, ex, radius - 1);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSausageFrame(x, y, w, h) {
  const inset = 9, radius = 9, step = 31, len = 29;
  const left = x + inset, right = x + w - inset;
  const top = y + inset, bottom = y + h - inset;

  ctx.save();
  ctx.strokeStyle = 'rgba(72,30,18,.85)';
  ctx.lineWidth = radius * 2 + 4;
  rr(left, top, right - left, bottom - top, 12); ctx.stroke();
  ctx.restore();

  for (let sx = left + 14; sx <= right - 14; sx += step) drawSausage(sx, top, 0, len, radius);
  for (let sx = left + 14; sx <= right - 14; sx += step) drawSausage(sx, bottom, 0, len, radius);
  for (let sy = top + 14; sy <= bottom - 14; sy += step) drawSausage(left, sy, Math.PI / 2, len, radius);
  for (let sy = top + 14; sy <= bottom - 14; sy += step) drawSausage(right, sy, Math.PI / 2, len, radius);

  drawSausage(left, top, -Math.PI / 4, 26, radius);
  drawSausage(right, top, Math.PI / 4, 26, radius);
  drawSausage(left, bottom, Math.PI / 4, 26, radius);
  drawSausage(right, bottom, -Math.PI / 4, 26, radius);
}

function drawTitle() {
  ctx.save(); ctx.fillStyle = 'rgba(18,8,34,.42)'; ctx.fillRect(0, 0, W, H); ctx.restore();
  panel(190, 24, 900, 680);

  // Poldo.png in alto, a colori pieni: nessuna velatura sopra l'immagine.
  if (introImg && introImg.complete && introImg.naturalWidth) {
    const dw = 580;
    const dh = dw * introImg.naturalHeight / introImg.naturalWidth;
    const ix = W / 2 - dw / 2, iy = 28;
    ctx.drawImage(introImg, ix, iy, dw, dh);
    drawSausageFrame(ix, iy, dw, dh);
  }

  titleText('POLDO', 472, 66, '#ffd166');
  titleText('Il banchetto dei colori', 508, 24, '#ff9ec4');

  ctx.save(); ctx.textAlign = 'center';
  ctx.font = '18px Trebuchet MS, sans-serif'; ctx.fillStyle = '#f2e6ff';
  ctx.fillText('Il cuoco più goloso del regno deve raccogliere', W / 2, 538);
  ctx.fillText('tutte le prelibatezze prima del banchetto reale!', W / 2, 560);

  ctx.font = 'bold 16px Trebuchet MS, sans-serif'; ctx.fillStyle = '#ffd98a';
  ctx.fillText('FRECCE / WASD  muoviti e sali sulle scale', W / 2, 594);
  ctx.fillText('SPAZIO  salta  ·  GIÙ  scendi  ·  P  pausa  ·  M  audio', W / 2, 616);
  ctx.fillStyle = '#c9b8e8'; ctx.font = '14px Trebuchet MS, sans-serif';
  ctx.fillText('Raccogli tutto → la porta si apre → raggiungila per passare livello', W / 2, 640);
  ctx.fillText(`RECORD: ${String(hiScore).padStart(6, '0')}`, W / 2, 664);
  ctx.restore();

  const a = .55 + Math.sin(time * .09) * .45;
  ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center';
  ctx.fillStyle = '#fff3bd'; ctx.font = 'bold 24px Trebuchet MS, sans-serif';
  ctx.fillText('PREMI  INVIO  PER INIZIARE', W / 2, 698); ctx.restore();

  // cibo decorativo fluttuante, ai lati senza coprire immagine o testo
  const demo = [{x:250,y:120,type:'apple'},{x:1030,y:130,type:'cake'},
                {x:240,y:560,type:'donut'},{x:1040,y:560,type:'chicken'}];
  demo.forEach((d, i) => drawFood({ ...d, got: false, phase: i, y: d.y + Math.sin(time * .04 + i) * 8 }));
}
function drawOverlay(title, subtitle, color) {
  ctx.save(); ctx.fillStyle = 'rgba(14,6,28,.62)'; ctx.fillRect(0, 0, W, H); ctx.restore();
  panel(340, 210, 600, 300);
  titleText(title, 300, 52, color);
  ctx.save(); ctx.textAlign = 'center'; ctx.font = '20px Trebuchet MS, sans-serif';
  ctx.fillStyle = '#f0e2ff'; ctx.fillText(subtitle, W / 2, 360);
  ctx.fillStyle = '#ffd98a'; ctx.font = 'bold 18px Trebuchet MS, sans-serif';
  ctx.fillText('PREMI  INVIO  PER RIPARTIRE', W / 2, 440); ctx.restore();
}
function drawPause() {
  ctx.save(); ctx.fillStyle = 'rgba(14,6,28,.55)'; ctx.fillRect(0, 0, W, H); ctx.restore();
  panel(430, 260, 420, 190);
  titleText('PAUSA', 340, 52, '#a5d8ff');
  ctx.save(); ctx.textAlign = 'center'; ctx.fillStyle = '#e8dcff';
  ctx.font = '18px Trebuchet MS, sans-serif'; ctx.fillText('Premi P per continuare', W / 2, 395); ctx.restore();
}
function drawLevelClear() {
  ctx.save(); ctx.fillStyle = 'rgba(14,6,28,.5)'; ctx.fillRect(0, 0, W, H); ctx.restore();
  panel(330, 200, 620, 310);
  titleText('LIVELLO COMPLETATO!', 290, 44, '#9be7a0');
  ctx.save(); ctx.textAlign = 'center'; ctx.fillStyle = '#fff0cc';
  ctx.font = '22px Trebuchet MS, sans-serif';
  ctx.fillText(level.name, W / 2, 340);
  ctx.fillStyle = '#ffd98a'; ctx.font = 'bold 20px Trebuchet MS, sans-serif';
  ctx.fillText(`PUNTEGGIO  ${String(score).padStart(6, '0')}`, W / 2, 390);
  ctx.fillStyle = '#c9b8e8'; ctx.font = '16px Trebuchet MS, sans-serif';
  ctx.fillText('Prepara il prossimo piatto...', W / 2, 430); ctx.restore();
}

/* ---------- Render principale ---------- */
function render() {
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);

  if (state === 'title') {
    prepLevelBackdropOnly();
    drawBackdrop();
    drawTitle();
  } else {
    drawBackdrop();
    for (const l of ladders) drawLadder(l);
    for (const p of plats) drawPlatform(p);
    drawDoor();
    drawHazards();
    drawScene();
    for (const f of foods) drawFood(f);
    for (const e of enemies) drawEnemy(e);
    if (state !== 'gameover') drawChef();
    drawParticles();
    drawHUD();

    if (state === 'paused') drawPause();
    else if (state === 'levelclear') drawLevelClear();
    else if (state === 'gameover') drawOverlay('GAME OVER', `Hai raccolto ${collected} prelibatezze · Punteggio ${score}`, '#ff7b7b');
    else if (state === 'victory') drawOverlay('BANCHETTO SERVITO!', `Hai completato tutti i livelli · Punteggio ${score} · Record ${hiScore}`, '#ffe17a');
  }
  ctx.restore();

  if (flash > 0) {
    ctx.save(); ctx.fillStyle = `rgba(255,120,120,${flash / 28})`;
    ctx.fillRect(0, 0, W, H); ctx.restore();
  }
}
let backdropReady = false;
function prepLevelBackdropOnly() {
  if (backdropReady) return;
  level = LEVELS[0]; plats = []; ladders = []; foods = []; enemies = []; hazards = []; scene = null;
  particles = []; texts = []; door = { x: 0, y: 0, w: 0, h: 0 };
  backdropReady = true;
}

/* ---------- Loop ---------- */
let last = performance.now(), acc = 0;
const STEP = 1000 / 60;
function loop(now) {
  acc += Math.min(now - last, 100);
  last = now;
  while (acc >= STEP) { update(); acc -= STEP; }
  render();
  requestAnimationFrame(loop);
}

// Inizializza la schermata titolo
prepLevelBackdropOnly();
requestAnimationFrame(loop);

})();

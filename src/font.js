// Cryptext-fonten: gemmes kun på telefonen (IndexedDB), aldrig i repoet eller på serveren.
// Her ligger også tegningen (canvas) og den automatiske kalibrering af bogstav → tal.

export const FAMILY = 'NPCryptext';
export const FALLBACK = '"Noteworthy", "Bradley Hand", "Segoe Print", "Comic Sans MS", cursive';

let fontReady = false;
let fontName = '';
export const isFontReady = () => fontReady;
export const loadedFontName = () => fontName;

// ---------------- lager ----------------
const DB = 'noterplus';
function db() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('files');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idb(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction('files', mode);
    const req = fn(tx.objectStore('files'));
    tx.oncomplete = () => resolve(req && req.result);
    tx.onerror = () => reject(tx.error);
  });
}

async function register(buffer, name) {
  const face = new FontFace(FAMILY, buffer);
  await face.load();
  for (const f of [...document.fonts]) if (f.family.replace(/"/g, '') === FAMILY && f !== face) document.fonts.delete(f);
  document.fonts.add(face);
  fontReady = true;
  fontName = name;
}

/** Indlæs fonten fra en fil, brugeren har valgt, og gem den på telefonen. */
export async function installFont(file) {
  const buffer = await file.arrayBuffer();
  await register(buffer.slice(0), file.name);
  await idb('readwrite', (s) => s.put({ name: file.name, data: buffer }, 'font'));
  return file.name;
}

/** Indlæs den gemte font ved opstart. */
export async function restoreFont() {
  try {
    const rec = await idb('readonly', (s) => s.get('font'));
    if (rec && rec.data) await register(rec.data, rec.name);
  } catch (e) {
    console.warn('Kunne ikke indlæse gemt font', e);
  }
  return fontReady;
}

export async function removeFont() {
  try { await idb('readwrite', (s) => s.delete('font')); } catch { /* ok */ }
  for (const f of [...document.fonts]) if (f.family.replace(/"/g, '') === FAMILY) document.fonts.delete(f);
  fontReady = false;
  fontName = '';
}

// ---------------- tegning ----------------
const famFor = (g, useFont) => (useFont && g.src !== 'punct' ? `"${FAMILY}"` : FALLBACK);

function band(ctx, size, useFont) {
  ctx.font = `${size}px ${useFont ? `"${FAMILY}"` : FALLBACK}`;
  const m = ctx.measureText('0');
  const asc = m.actualBoundingBoxAscent || size * 0.7;
  const desc = m.actualBoundingBoxDescent || 0;
  return { top: -asc, bottom: desc, center: (desc - asc) / 2, h: asc + desc };
}

function measure(ctx, glyphs, size, useFont) {
  const track = size * 0.03;
  return glyphs.map((g) => {
    ctx.font = `${size}px ${famFor(g, useFont)}`;
    const adv = g.ch === ' ' ? size * 0.38 : ctx.measureText(g.ch).width;
    return adv + track;
  });
}

/**
 * Tegn glyfferne i tal-visning. Hvert tegn drejes om sit eget midtpunkt i højde med
 * cifrenes midte – præcis som hvis hele linjen blev drejet 180°.
 */
function drawGlyphs(ctx, glyphs, size, useFont, cx0, cy, color, reveal = null) {
  const advs = measure(ctx, glyphs, size, useFont);
  const b = band(ctx, size, useFont);
  let x = cx0;
  ctx.fillStyle = color;
  ctx.textBaseline = 'alphabetic';
  glyphs.forEach((g, i) => {
    const adv = advs[i];
    if (g.ch !== ' ') {
      ctx.save();
      // Tegnet der lige "skrives": vis kun en del, fra venstre mod højre set i navne-vejen
      if (reveal && reveal.index === i) {
        const p = Math.max(0, Math.min(1, reveal.p));
        ctx.beginPath();
        // navne-vejen er hele tegningen drejet 180°, så dens venstre side er tegnets højre side her
        ctx.rect(x + adv * (1 - p), -1e4, adv * p + 1, 2e4);
        ctx.clip();
      }
      ctx.font = `${size}px ${famFor(g, useFont)}`;
      ctx.translate(x + adv / 2, cy);
      if (g.rot) ctx.rotate(Math.PI);
      ctx.fillText(g.ch, -adv / 2 + size * 0.015, -b.center);
      ctx.restore();
    }
    x += adv;
  });
  return x - cx0;
}

/**
 * Tegn en "håndskrevet" tegning ind i et canvas (som en tegning i Noter).
 * @returns {{width:number,height:number,size:number}}
 */
export function renderInk(canvas, glyphs, { size = 86, maxWidth = 320, color = '#fff', useFont = fontReady, reveal = null } = {}) {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const ctx = canvas.getContext('2d');
  let s = size;
  let w = measure(ctx, glyphs, s, useFont).reduce((a, b) => a + b, 0);
  if (w > maxWidth) { s = Math.max(18, (s * maxWidth) / w); w = measure(ctx, glyphs, s, useFont).reduce((a, b) => a + b, 0); }
  const padX = s * 0.12;
  const W = Math.ceil(w + padX * 2);
  const H = Math.ceil(s * 1.55);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  drawGlyphs(ctx, glyphs, s, useFont, padX, H / 2, color, reveal);
  return { width: W, height: H, size: s };
}

// ---------------- kalibrering ----------------
// Hvert bogstav-tegn sammenlignes (opret og drejet) med fontens egne cifre (enkelte og par).
// Bedste match = det tal, tilskueren ser. Den retning, der passer bedst for alle bogstaver
// samlet, bestemmer, hvordan fontens bogstaver skal stå i tal-visning.

const S = 72;
const GW = 20;
const GH = 28;
let scratch = null;

function raster(glyphs) {
  if (!scratch) { scratch = document.createElement('canvas'); scratch.width = S * 5; scratch.height = S * 3; }
  const ctx = scratch.getContext('2d', { willReadFrequently: true });
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, scratch.width, scratch.height);
  const cy = scratch.height / 2;
  drawGlyphs(ctx, glyphs, S, true, S * 0.5, cy, '#fff');
  const { width: W, height: H } = scratch;
  const a = ctx.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (a[(y * W + x) * 4 + 3] > 60) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  const b = band(ctx, S, true);
  const bandTop = cy + b.top - b.center;
  const bandH = b.h || S * 0.7;
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  const grid = new Float32Array(GW * GH);
  for (let gy = 0; gy < GH; gy++) {
    for (let gx = 0; gx < GW; gx++) {
      const sx0 = x0 + Math.floor((gx * bw) / GW), sx1 = x0 + Math.max(Math.floor(((gx + 1) * bw) / GW), Math.floor((gx * bw) / GW) + 1);
      const sy0 = y0 + Math.floor((gy * bh) / GH), sy1 = y0 + Math.max(Math.floor(((gy + 1) * bh) / GH), Math.floor((gy * bh) / GH) + 1);
      let sum = 0, n = 0;
      for (let y = sy0; y < sy1; y++) for (let x = sx0; x < sx1; x++) { sum += a[(y * W + x) * 4 + 3]; n++; }
      grid[gy * GW + gx] = n ? sum / n / 255 : 0;
    }
  }
  // let sløring, så små forskelle i stregen ikke tæller for meget
  const blur = new Float32Array(GW * GH);
  for (let y = 0; y < GH; y++) {
    for (let x = 0; x < GW; x++) {
      let s = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < GW && yy < GH) { s += grid[yy * GW + xx] * (dx || dy ? 1 : 2); n += dx || dy ? 1 : 2; }
      }
      blur[y * GW + x] = s / n;
    }
  }
  return { grid: blur, ar: bw / bandH, t: (y0 - bandTop) / bandH, b: (y1 + 1 - bandTop) / bandH };
}

function similarity(p, q) {
  let mn = 0, mx = 0;
  for (let i = 0; i < p.grid.length; i++) { const a = p.grid[i], b = q.grid[i]; mn += Math.min(a, b); mx += Math.max(a, b); }
  const iou = mx ? mn / mx : 0;
  const arF = Math.exp(-Math.abs(Math.log((p.ar + 0.05) / (q.ar + 0.05))) * 1.4);
  const posF = Math.max(0, 1 - 0.55 * (Math.abs(p.t - q.t) + Math.abs(p.b - q.b)));
  return iou * arF * posF;
}

export const LETTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'];

/** Kør kalibreringen (kræver at fonten er indlæst). */
export function calibrate() {
  if (!fontReady) return null;
  const cands = [];
  for (let d = 0; d <= 9; d++) cands.push({ digits: String(d), r: raster([{ ch: String(d), rot: 0 }]) });
  for (let d = 0; d <= 99; d++) {
    const s = String(d).padStart(2, '0');
    cands.push({ digits: s, r: raster([...s].map((ch) => ({ ch, rot: 0 }))), pair: true });
  }
  const valid = cands.filter((c) => c.r);
  const best = (r) => {
    let top = { digits: '?', score: 0 };
    let single = { digits: '?', score: 0 };
    for (const c of valid) {
      const sc = similarity(r, c.r);
      if (!c.pair && sc > single.score) single = { digits: c.digits, score: sc };
      if (sc > top.score) top = { digits: c.digits, score: sc };
    }
    // et par cifre skal være klart bedre end ét ciffer
    return top.digits.length === 2 && top.score < single.score * 1.12 ? single : top;
  };
  const res = { rotated: {}, upright: {} };
  const sum = { rotated: 0, upright: 0 };
  for (const L of LETTERS) {
    for (const [key, rot] of [['rotated', 180], ['upright', 0]]) {
      const r = raster([{ ch: L, rot }]);
      const b = r ? best(r) : { digits: '?', score: 0 };
      res[key][L] = b;
      sum[key] += b.score;
    }
  }
  const letterRot = sum.rotated >= sum.upright ? 'rotated' : 'upright';
  return {
    at: Date.now(),
    font: fontName,
    letterRot,
    avg: { rotated: sum.rotated / LETTERS.length, upright: sum.upright / LETTERS.length },
    auto: { rotated: pick(res.rotated), upright: pick(res.upright) },
    scores: { rotated: scoreMap(res.rotated), upright: scoreMap(res.upright) },
  };
}
const pick = (m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.digits]));
const scoreMap = (m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, Math.round(v.score * 100) / 100]));

/** Lille forhåndsvisning af ét tegn (til bogstav-tabellen). */
export function renderGlyph(canvas, ch, rot, color = '#fff') {
  return renderInk(canvas, [{ ch, rot, src: 'font' }], { size: 30, maxWidth: 60, color, useFont: fontReady });
}

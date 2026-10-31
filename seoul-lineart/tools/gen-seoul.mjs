// Generates compositions/drawing.html: a hand-drawn Seoul skyline as SVG paths.
// Every path carries data-t (start, s) and data-d (draw duration, s); the scene
// timeline draws them with stroke-dashoffset, sweeping left to right.
// Run: node tools/gen-seoul.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const W = 1920, H = 1080;
const SWEEP_START = 0.6, SWEEP_END = 24.0;
const RATE = (SWEEP_END - SWEEP_START) / W; // seconds per px of x

// ---------- seeded random ----------
let seed = 20261031;
function rnd() {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rr = (a, b) => a + (b - a) * rnd();
const ri = (a, b) => Math.floor(rr(a, b + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const f = (n) => (Math.round(n * 10) / 10).toString();

// ---------- hand-drawn line helpers ----------
// Wobbly polyline: subdivide, nudge perpendicular, smooth with quadratic midpoints.
function wobble(pts, amp = 0.7, step = 22) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
    const len = Math.hypot(x2 - x1, y2 - y1);
    const n = Math.max(1, Math.round(len / step));
    const nx = -(y2 - y1) / (len || 1), ny = (x2 - x1) / (len || 1);
    for (let k = 0; k < n; k++) {
      const u = k / n;
      const o = k === 0 ? 0 : rr(-amp, amp);
      out.push([x1 + (x2 - x1) * u + nx * o, y1 + (y2 - y1) * u + ny * o]);
    }
  }
  out.push(pts[pts.length - 1]);
  if (out.length < 3) return `M${f(out[0][0])},${f(out[0][1])}L${f(out[1][0])},${f(out[1][1])}`;
  let d = `M${f(out[0][0])},${f(out[0][1])}`;
  for (let i = 1; i < out.length - 1; i++) {
    const mx = (out[i][0] + out[i + 1][0]) / 2, my = (out[i][1] + out[i + 1][1]) / 2;
    d += `Q${f(out[i][0])},${f(out[i][1])} ${f(mx)},${f(my)}`;
  }
  const l = out[out.length - 1];
  return d + `L${f(l[0])},${f(l[1])}`;
}
// Straight-ish line with a slight overshoot, like a pen stroke.
function sline(x1, y1, x2, y2, amp = 0.5) {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
  const o1 = rr(0, 1.6), o2 = rr(0.5, 2.6);
  return wobble([[x1 - ux * o1, y1 - uy * o1], [x2 + ux * o2, y2 + uy * o2]], amp, 30);
}
const smooth = (pts, amp = 0.6) => wobble(pts, amp, 14);

// ---------- scene graph ----------
const layers = {}; // name -> array of svg strings
const order = ["sky", "sun", "far", "ridge2", "namsan", "back", "tower", "mid", "front", "fore", "river"];
for (const l of order) layers[l] = [];
let pathCount = 0;

// k = stroke class, t0 = start time, dur = seconds
function P(layer, d, k, t0, dur, fill) {
  pathCount++;
  const fillAttr = fill ? ` data-fill="1"` : "";
  layers[layer].push(
    `<path class="${k}" d="${d}" pathLength="1" data-t="${f(t0 * 100) / 100 === 0 ? "0" : (Math.round(t0 * 100) / 100).toString()}" data-d="${(Math.round(dur * 100) / 100).toString()}"${fillAttr}/>`,
  );
}
// paper-colored occluder: present from frame 0, hides what sits behind it
function OCC(layer, d) {
  layers[layer].push(`<path class="occ" d="${d}"/>`);
}
const tAt = (x) => SWEEP_START + Math.max(0, Math.min(W, x)) * RATE;
const durFor = (x0, x1, min = 0.45) => Math.max(min, (x1 - x0) * RATE);

// Draw a stroke whose timing follows its own horizontal extent.
function stroke(layer, d, k, x0, x1, opts = {}) {
  const jitter = opts.jitter ?? rr(-0.5, 0.5);
  const t0 = Math.max(0.2, tAt(x0) + jitter + (opts.delay || 0));
  P(layer, d, k, t0, opts.dur ?? durFor(x0, x1, opts.min), opts.fill);
}

// ---------- sky ----------
function cloud(x, y, w) {
  // long drifting cloud line with a couple of curls, drawn left to right
  const pts = [];
  const n = Math.round(w / 18);
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    pts.push([x + u * w, y + Math.sin(u * Math.PI * rr(1.6, 2.4)) * rr(3, 7) * (1 - u * 0.4)]);
  }
  stroke("sky", smooth(pts, 1.2), "k4", x, x + w);
  // a puff on top
  const px = x + w * rr(0.15, 0.5), pw = rr(60, 120);
  const puff = [];
  for (let i = 0; i <= 16; i++) {
    const a = Math.PI - (i / 16) * Math.PI;
    const bump = 1 + 0.18 * Math.sin(i * 1.9);
    puff.push([px + pw / 2 + Math.cos(a) * pw / 2 * bump, y - 2 - Math.sin(a) * pw * 0.28 * bump]);
  }
  stroke("sky", smooth(puff, 0.8), "k4", px, px + pw);
  // a second, shorter trailing line
  const y2 = y + rr(10, 16), x2 = x + w * rr(0.2, 0.4), w2 = w * rr(0.4, 0.6);
  stroke("sky", sline(x2, y2, x2 + w2, y2 + rr(-3, 3), 1.2), "k4", x2, x2 + w2);
}
cloud(60, 190, 380);
cloud(540, 58, 260);
cloud(610, 400, 210);
cloud(1150, 52, 200);
cloud(1700, 360, 200);
// birds
for (let i = 0; i < 9; i++) {
  const bx = rr(1080, 1300), by = rr(370, 440), s = rr(5, 10);
  stroke("sky", `M${f(bx - s)},${f(by - s * 0.5)}Q${f(bx - s * 0.4)},${f(by - s * 0.6)} ${f(bx)},${f(by)}Q${f(bx + s * 0.4)},${f(by - s * 0.6)} ${f(bx + s)},${f(by - s * 0.55)}`, "k2", bx, bx + 2 * s, { min: 0.3 });
}

// ---------- sun ----------
const SUN = { x: 1640, y: 250, r: 112 };
{
  const pts = [];
  for (let i = 0; i <= 64; i++) {
    const a = Math.PI + (i / 64) * Math.PI * 2; // start at left
    pts.push([SUN.x + Math.cos(a) * SUN.r, SUN.y + Math.sin(a) * SUN.r]);
  }
  stroke("sun", smooth(pts, 0.6), "k1", SUN.x - SUN.r, SUN.x + SUN.r, { dur: 1.6 });
  // inner stripes on the lower half
  for (let i = 1; i <= 6; i++) {
    const yy = SUN.y + i * 15;
    const half = Math.sqrt(Math.max(0, SUN.r * SUN.r - (yy - SUN.y) ** 2)) - 6;
    stroke("sun", sline(SUN.x - half, yy, SUN.x + half, yy, 0.4), "k2", SUN.x - half, SUN.x + half, { delay: 0.6 + i * 0.08 });
  }
  // a halo arc
  const halo = [];
  for (let i = 0; i <= 40; i++) {
    const a = Math.PI * 1.08 + (i / 40) * Math.PI * 0.84;
    halo.push([SUN.x + Math.cos(a) * (SUN.r + 22), SUN.y + Math.sin(a) * (SUN.r + 22)]);
  }
  stroke("sun", smooth(halo, 0.8), "k4", SUN.x - SUN.r - 22, SUN.x + SUN.r + 22, { delay: 0.9 });
}

// ---------- ridges (Bukhansan / Gwanaksan silhouettes) ----------
function ridge(layer, baseY, amp, peaks, k, occ, hatch) {
  const pts = [];
  for (let x = -10; x <= W + 10; x += 12) {
    let y = baseY;
    for (const p of peaks) y -= p.h * Math.exp(-((x - p.x) ** 2) / (2 * p.w * p.w));
    y += Math.sin(x * 0.031) * amp + Math.sin(x * 0.087) * amp * 0.5 + rr(-1.2, 1.2);
    pts.push([x, y]);
  }
  if (occ) OCC(layer, `M${pts.map((p) => `${f(p[0])},${f(p[1])}`).join("L")}L${W + 10},${H}L-10,${H}Z`);
  // the ridge line drawn in chunks so it tracks the sweep
  for (let i = 0; i < pts.length - 1; i += 14) {
    const seg = pts.slice(i, i + 15);
    stroke(layer, smooth(seg, 0.4), k, seg[0][0], seg[seg.length - 1][0], { jitter: -0.1 });
  }
  // contour hatching under the ridge
  if (hatch) {
    for (let i = 3; i < pts.length - 3; i += ri(1, 3)) {
      const [x, y] = pts[i];
      const slope = pts[i + 1][1] - pts[i - 1][1];
      const len = rr(10, 26);
      const dx = slope > 0 ? -len * 0.5 : len * 0.5;
      stroke(layer, sline(x, y + rr(5, 9), x + dx, y + len, 0.3), "k4", Math.min(x, x + dx), Math.max(x, x + dx), { min: 0.25 });
    }
  }
  return pts;
}
ridge("far", 600, 6, [{ x: 250, h: 150, w: 120 }, { x: 520, h: 110, w: 90 }, { x: 860, h: 140, w: 140 }, { x: 1180, h: 90, w: 110 }, { x: 1520, h: 120, w: 150 }, { x: 1850, h: 100, w: 120 }], "k4", true, true);
const ridge2 = ridge("ridge2", 650, 4, [{ x: 120, h: 60, w: 100 }, { x: 980, h: 70, w: 160 }, { x: 1300, h: 50, w: 120 }, { x: 1760, h: 80, w: 130 }], "k3", true, true);

// ---------- tree clumps ----------
function clump(layer, x, y, w, k = "k3") {
  // a bumpy crown drawn left to right, filled with paper so clumps overlap
  const bumps = ri(3, 5);
  const pts = [[x, y]];
  for (let i = 0; i <= bumps * 6; i++) {
    const u = i / (bumps * 6);
    const a = Math.PI - u * Math.PI;
    const b = Math.abs(Math.sin(u * Math.PI * bumps)) * w * 0.12;
    pts.push([x + w / 2 + Math.cos(a) * w / 2, y - Math.sin(a) * w * 0.42 - b]);
  }
  pts.push([x + w, y]);
  const d = smooth(pts, 0.5);
  OCC(layer, d + "Z");
  stroke(layer, d, k, x, x + w, { min: 0.3 });
  // a little interior texture
  if (w > 16 && rnd() < 0.7) {
    const cx = x + w * rr(0.3, 0.6), cy = y - w * rr(0.15, 0.3);
    stroke(layer, `M${f(cx)},${f(cy)}q${f(w * 0.08)},${f(-w * 0.1)} ${f(w * 0.18)},${f(-w * 0.02)}`, "k4", cx, cx + w * 0.2, { min: 0.2, delay: 0.15 });
  }
}

// ---------- Namsan + N Seoul Tower ----------
const NAM = { x: 440, top: 470, base: 790, half: 330 };
const namY = (x) => {
  const u = (x - NAM.x) / NAM.half;
  return NAM.top + (NAM.base - NAM.top) * Math.min(1, Math.pow(Math.abs(u), 1.5) * 0.85 + 0.02 * Math.sin(x * 0.07));
};
{
  const pts = [];
  for (let x = NAM.x - NAM.half; x <= NAM.x + NAM.half; x += 10) pts.push([x, namY(x)]);
  OCC("namsan", `M${pts.map((p) => `${f(p[0])},${f(p[1])}`).join("L")}L${NAM.x + NAM.half},${H}L${NAM.x - NAM.half},${H}Z`);
  for (let i = 0; i < pts.length - 1; i += 10) {
    const seg = pts.slice(i, i + 11);
    stroke("namsan", smooth(seg, 0.5), "k2", seg[0][0], seg[seg.length - 1][0], { jitter: -0.2 });
  }
  // forest: rows of clumps down the slope, back to front
  for (let row = 0; row < 15; row++) {
    for (let x = NAM.x - NAM.half + 20; x < NAM.x + NAM.half - 20; x += rr(14, 26)) {
      const yTop = namY(x);
      const y = yTop + 14 + row * 22 + rr(-5, 5);
      if (y > NAM.base + 10) continue;
      if (Math.abs(x - NAM.x) < 40 && row < 1) continue; // tower base clearing
      clump("namsan", x - 10, y, rr(16, 30));
    }
  }
}
// N Seoul Tower, drawn bottom-up
{
  const cx = NAM.x, base = NAM.top + 8;
  const t0 = tAt(cx - 60);
  const k = "k1";
  // pedestal building
  const pw = 70, ph = 38;
  OCC("namsan", `M${cx - pw / 2},${base}V${base - ph}H${cx + pw / 2}V${base}Z`);
  P("namsan", sline(cx - pw / 2, base, cx - pw / 2, base - ph), k, t0, 0.35);
  P("namsan", sline(cx - pw / 2, base - ph, cx + pw / 2, base - ph), k, t0 + 0.3, 0.35);
  P("namsan", sline(cx + pw / 2, base - ph, cx + pw / 2, base), k, t0 + 0.6, 0.35);
  for (let i = 1; i < 5; i++) P("namsan", sline(cx - pw / 2 + 3, base - i * 8, cx + pw / 2 - 3, base - i * 8, 0.3), "k3", t0 + 0.4 + i * 0.06, 0.3);
  for (let i = 1; i < 9; i++) P("namsan", sline(cx - pw / 2 + i * 8, base - ph + 3, cx - pw / 2 + i * 8, base - 3, 0.2), "k4", t0 + 0.7 + i * 0.03, 0.25);
  // shaft
  const shaftTop = 345;
  const sh = 9;
  OCC("namsan", `M${cx - sh},${base - ph}L${cx - sh * 0.8},${shaftTop}H${cx + sh * 0.8}L${cx + sh},${base - ph}Z`);
  P("namsan", sline(cx - sh, base - ph, cx - sh * 0.8, shaftTop, 0.3), k, t0 + 1.0, 0.7);
  P("namsan", sline(cx + sh, base - ph, cx + sh * 0.8, shaftTop, 0.3), k, t0 + 1.1, 0.7);
  for (let y = base - ph - 12; y > shaftTop + 6; y -= 12) P("namsan", sline(cx - sh * 0.9, y, cx + sh * 0.9, y, 0.2), "k4", t0 + 1.2 + (base - y) * 0.003, 0.2);
  // observation pod: stacked rings
  const rings = [
    { y: 345, w: 22 }, { y: 336, w: 34 }, { y: 326, w: 38 }, { y: 316, w: 38 }, { y: 306, w: 34 }, { y: 299, w: 26 },
  ];
  OCC("namsan", `M${cx - 38},${345}L${cx - 38},${299}H${cx + 38}L${cx + 38},${345}Z`);
  rings.forEach((r, i) => {
    const d = `M${f(cx - r.w)},${f(r.y)}Q${f(cx)},${f(r.y + 4)} ${f(cx + r.w)},${f(r.y)}`;
    P("namsan", d, k, t0 + 1.7 + i * 0.12, 0.35);
  });
  P("namsan", sline(cx - 38, 326, cx - 38, 316, 0.2), k, t0 + 1.9, 0.2);
  P("namsan", sline(cx + 38, 326, cx + 38, 316, 0.2), k, t0 + 2.0, 0.2);
  for (let i = -5; i <= 5; i++) P("namsan", sline(cx + i * 6.5, 318, cx + i * 6.5, 325, 0.1), "k3", t0 + 2.1 + (i + 5) * 0.02, 0.15);
  // antenna with banded segments
  P("namsan", sline(cx - 5, 299, cx - 4, 238, 0.2), k, t0 + 2.4, 0.5);
  P("namsan", sline(cx + 5, 299, cx + 4, 238, 0.2), k, t0 + 2.45, 0.5);
  for (let y = 290; y > 240; y -= 9) P("namsan", sline(cx - 5, y, cx + 5, y, 0.1), "k2", t0 + 2.6 + (290 - y) * 0.004, 0.15);
  P("namsan", sline(cx, 238, cx, 196, 0.1), k, t0 + 2.9, 0.45);
  P("namsan", sline(cx - 3, 222, cx + 3, 222, 0.1), "k2", t0 + 3.1, 0.15);
}

// ---------- buildings ----------
function building(layer, x, w, top, base, opt = {}) {
  const k = opt.k || "k2", kd = opt.kd || "k3";
  const kind = opt.kind || pick(["grid", "apt", "office", "band", "grid"]);
  OCC(layer, `M${f(x)},${f(base)}V${f(top)}H${f(x + w)}V${f(base)}Z`);
  // outline: up the left side, across the roof, down the right
  stroke(layer, sline(x, base, x, top, 0.4), k, x, x + 2, { min: 0.3 });
  stroke(layer, sline(x, top, x + w, top, 0.4), k, x, x + w, { min: 0.3, delay: 0.2 });
  stroke(layer, sline(x + w, top, x + w, base, 0.4), k, x + w, x + w + 2, { min: 0.3, delay: 0.05 });
  const h = base - top;
  const fh = opt.fh || rr(5, 8);
  let d = "", n = 0;
  if (kind === "grid" || kind === "apt" || kind === "band") {
    const gap = kind === "band" ? fh * 1.8 : fh;
    for (let y = top + gap; y < base - 3; y += gap) {
      d += sline(x + 2.5, y, x + w - 2.5, y, 0.25);
      n++;
    }
    if (d) stroke(layer, d, kd, x, x + w, { dur: Math.min(2.2, 0.35 + n * 0.035), delay: 0.25 });
  }
  if (kind === "grid" || kind === "office") {
    const cw = kind === "office" ? rr(3.5, 5.5) : rr(5, 9);
    let dv = "", m = 0;
    for (let xx = x + cw; xx < x + w - 2; xx += cw) {
      dv += sline(xx, top + 3, xx, base - 2, 0.2);
      m++;
    }
    if (dv) stroke(layer, dv, kd, x, x + w, { dur: Math.min(2.2, 0.35 + m * 0.05), delay: 0.4 });
  }
  if (kind === "apt") {
    // Korean apartment slab: end-wall strip, stair core and balcony ticks
    const core = x + w * rr(0.3, 0.7);
    stroke(layer, sline(core, top, core, base, 0.2), kd, core, core + 2, { min: 0.4, delay: 0.3 });
    stroke(layer, sline(x + 6, top, x + 6, base, 0.2), kd, x, x + 6, { min: 0.4, delay: 0.3 });
    let dt = "", c = 0;
    for (let y = top + fh; y < base - 3; y += fh) {
      for (let xx = x + 10; xx < x + w - 6; xx += rr(9, 15)) {
        dt += `M${f(xx)},${f(y - 1)}v${f(-fh * 0.45)}`;
        c++;
      }
    }
    if (dt) stroke(layer, dt, "k4", x, x + w, { dur: Math.min(2.0, 0.4 + c * 0.01), delay: 0.5 });
  }
  // roof furniture
  if (!opt.noRoof && w > 26 && rnd() < 0.75) {
    const r = rnd();
    const rx = x + rr(4, w - 20);
    if (r < 0.35) {
      const bw = rr(10, Math.min(30, w * 0.5)), bh = rr(6, 14);
      OCC(layer, `M${f(rx)},${f(top)}V${f(top - bh)}H${f(rx + bw)}V${f(top)}Z`);
      stroke(layer, `M${f(rx)},${f(top)}V${f(top - bh)}H${f(rx + bw)}V${f(top)}`, k, rx, rx + bw, { min: 0.35, delay: 0.5 });
    } else if (r < 0.6) {
      const ah = rr(14, 40);
      stroke(layer, sline(rx, top, rx, top - ah, 0.1), k, rx, rx + 1, { min: 0.3, delay: 0.5 });
      stroke(layer, sline(rx - 4, top - ah * 0.6, rx + 4, top - ah * 0.6, 0.1), kd, rx - 4, rx + 4, { min: 0.2, delay: 0.7 });
    } else if (r < 0.8) {
      // water tank
      const tw = rr(10, 16);
      stroke(layer, `M${f(rx)},${f(top)}v-4h${f(tw)}v4M${f(rx - 1)},${f(top - 4)}v-8q${f(tw / 2 + 1)},-5 ${f(tw + 2)},0v8`, k, rx, rx + tw, { min: 0.4, delay: 0.5 });
    } else {
      // slanted crown
      const sh = rr(10, 26);
      OCC(layer, `M${f(x)},${f(top)}L${f(x + w)},${f(top - sh)}V${f(top)}Z`);
      stroke(layer, sline(x, top, x + w, top - sh, 0.3), k, x, x + w, { min: 0.4, delay: 0.4 });
      stroke(layer, sline(x + w, top - sh, x + w, top, 0.2), k, x + w, x + w + 1, { min: 0.2, delay: 0.6 });
    }
  }
}
function rowOfBuildings(layer, x0, x1, base, hMin, hMax, opt = {}) {
  let x = x0;
  while (x < x1) {
    const w = rr(opt.wMin || 26, opt.wMax || 70);
    const hgt = rr(hMin, hMax) * (opt.shape ? opt.shape(x + w / 2) : 1);
    if (!opt.skip || !opt.skip(x, x + w)) building(layer, x, w, base - hgt, base + 2, opt);
    x += w + rr(-6, 4);
  }
}

// distant city: a dense band of tiny blocks along the foot of the ridges
rowOfBuildings("back", -20, W + 20, 770, 14, 60, { k: "k4", kd: "k4", wMin: 10, wMax: 26, fh: 4.5, noRoof: true });
rowOfBuildings("back", -20, W + 20, 790, 20, 80, { k: "k3", kd: "k4", wMin: 12, wMax: 30, fh: 5 });
// back row: smaller, lighter, behind the tower
rowOfBuildings("back", NAM.x + 250, W + 20, 800, 60, 150, { k: "k3", kd: "k4", wMin: 22, wMax: 55 });
rowOfBuildings("back", -20, NAM.x - 230, 805, 40, 90, { k: "k3", kd: "k4", wMin: 22, wMax: 50 });

// ---------- Lotte World Tower ----------
const LT = { x: 1420, top: 70, base: 905, crownBot: 175 };
const ltHalf = (y) => {
  const u = Math.max(0, (y - LT.top) / (LT.base - LT.top)); // 0 top .. 1 base
  return 15 + 66 * Math.pow(u, 0.72) + 6 * Math.sin(u * Math.PI) * 0.3;
};
{
  const t0 = tAt(LT.x - 90) - 0.2;
  const dur = 4.2; // the tower rises bottom-up over this span
  const yAtTime = (y) => t0 + ((LT.base - y) / (LT.base - LT.top)) * dur;
  // occluder of the whole silhouette
  const left = [], right = [];
  for (let y = LT.base; y >= LT.top; y -= 8) {
    left.push([LT.x - ltHalf(y), y]);
    right.push([LT.x + ltHalf(y), y]);
  }
  OCC("tower", `M${left.map((p) => `${f(p[0])},${f(p[1])}`).join("L")}L${right.reverse().map((p) => `${f(p[0])},${f(p[1])}`).join("L")}Z`);
  right.reverse();
  // silhouette edges, bottom to top
  P("tower", smooth(left, 0.3), "k0", t0, dur);
  P("tower", smooth(right, 0.3), "k0", t0 + 0.05, dur);
  // curved seam lines on the facade
  for (const s of [-0.62, -0.3, 0, 0.3, 0.62]) {
    const pts = [];
    for (let y = LT.base; y >= LT.crownBot; y -= 10) pts.push([LT.x + ltHalf(y) * s, y]);
    P("tower", smooth(pts, 0.2), s === 0 ? "k1" : "k2", t0 + 0.3, dur * 0.9);
  }
  // floor lines, each drawn when the rise passes it
  let fl = 0;
  for (let y = LT.base - 6; y > LT.crownBot; y -= 5.5) {
    const hw = ltHalf(y) - 1.5;
    const cls = fl % 6 === 0 ? "k2" : "k4";
    P("tower", sline(LT.x - hw, y, LT.x + hw, y, 0.15), cls, yAtTime(y) + 0.15, 0.25);
    fl++;
  }
  // mechanical belts
  for (const y of [720, 540, 360]) {
    const hw = ltHalf(y);
    P("tower", sline(LT.x - hw, y, LT.x + hw, y, 0.1), "k1", yAtTime(y) + 0.2, 0.35);
    P("tower", sline(LT.x - hw, y - 4, LT.x + hw, y - 4, 0.1), "k1", yAtTime(y) + 0.25, 0.35);
  }
  // crown: split slit with diagonal lattice
  const ct = yAtTime(LT.crownBot);
  const slitW = (y) => 1.5 + ((LT.crownBot - y) / (LT.crownBot - LT.top)) * 7;
  const sl = [], sr = [];
  for (let y = LT.crownBot; y >= LT.top - 6; y -= 6) {
    sl.push([LT.x - slitW(y), y]);
    sr.push([LT.x + slitW(y), y]);
  }
  P("tower", smooth(sl, 0.1), "k1", ct, 0.9);
  P("tower", smooth(sr, 0.1), "k1", ct + 0.05, 0.9);
  let lat = "";
  for (let y = LT.crownBot; y > LT.top + 4; y -= 9) {
    const hw = ltHalf(y), hw2 = ltHalf(y - 9);
    lat += `M${f(LT.x - hw + 1)},${f(y)}L${f(LT.x - slitW(y - 9))},${f(y - 9)}`;
    lat += `M${f(LT.x + slitW(y))},${f(y)}L${f(LT.x + hw2 - 1)},${f(y - 9)}`;
  }
  P("tower", lat, "k3", ct + 0.2, 1.2);
  P("tower", sline(LT.x - ltHalf(LT.crownBot), LT.crownBot, LT.x + ltHalf(LT.crownBot), LT.crownBot, 0.1), "k1", ct, 0.3);
  // podium mall with curved roofs
  const px0 = LT.x - 200, px1 = LT.x + 210, pTop = 850;
  OCC("tower", `M${px0},${LT.base}V${pTop}Q${LT.x},${pTop - 26} ${px1},${pTop}V${LT.base}Z`);
  P("tower", sline(px0, LT.base, px0, pTop, 0.2), "k1", t0 - 0.3, 0.3);
  P("tower", `M${px0},${pTop}Q${LT.x},${pTop - 26} ${px1},${pTop}`, "k1", t0 - 0.1, 1.2);
  P("tower", sline(px1, pTop, px1, LT.base, 0.2), "k1", t0 + 1.0, 0.3);
  let pf = "";
  for (let y = pTop + 10; y < LT.base - 2; y += 9) pf += sline(px0 + 3, y, px1 - 3, y, 0.2);
  P("tower", pf, "k3", t0 + 0.2, 1.4);
  let pv = "";
  for (let x = px0 + 12; x < px1 - 4; x += 12) pv += `M${f(x)},${f(pTop + 6)}V${f(LT.base - 2)}`;
  P("tower", pv, "k4", t0 + 0.5, 1.5);
}

// mid row: the dense city, with a high-rise cluster in the middle
rowOfBuildings("mid", NAM.x + 180, W + 20, 880, 70, 190, {
  wMin: 28, wMax: 72,
  shape: (cx) => 1 + 1.7 * Math.exp(-((cx - 960) ** 2) / (2 * 150 * 150)) + 0.5 * Math.exp(-((cx - 1760) ** 2) / (2 * 90 * 90)),
  skip: (a, b) => b > LT.x - 215 && a < LT.x + 215,
});
rowOfBuildings("mid", -20, NAM.x - 150, 880, 50, 120, { wMin: 30, wMax: 70 });
rowOfBuildings("mid", NAM.x - 150, NAM.x + 180, 880, 30, 70, { wMin: 30, wMax: 60 });

// front row: long apartment slabs and low blocks
rowOfBuildings("front", 520, W + 20, 952, 40, 100, { kind: "apt", wMin: 60, wMax: 140, k: "k1", kd: "k3", fh: 7.5, skip: (a, b) => b > LT.x - 120 && a < LT.x + 140 });
// street trees along the front
for (let x = 520; x < W; x += rr(18, 34)) clump("front", x, 958 + rr(-2, 3), rr(18, 28), "k2");

// ---------- foreground hanok roofs (left) ----------
function hanok(x, y, w) {
  const h = w * 0.22;
  // the curved roof: eaves lift at both ends
  const roof = [
    [x, y - h * 0.25], [x + w * 0.12, y], [x + w * 0.5, y + h * 0.08], [x + w * 0.88, y], [x + w, y - h * 0.25],
  ];
  const ridgeL = [x + w * 0.22, y - h], ridgeR = [x + w * 0.78, y - h];
  OCC("fore", `M${f(x)},${f(y - h * 0.25)}L${f(ridgeL[0])},${f(ridgeL[1])}L${f(ridgeR[0])},${f(ridgeR[1])}L${f(x + w)},${f(y - h * 0.25)}L${f(x + w * 0.9)},${f(y + 40)}L${f(x + w * 0.1)},${f(y + 40)}Z`);
  stroke("fore", smooth(roof, 0.3), "k1", x, x + w);
  stroke("fore", `M${f(x)},${f(y - h * 0.25)}Q${f(x + w * 0.12)},${f(y - h * 0.55)} ${f(ridgeL[0])},${f(ridgeL[1])}L${f(ridgeR[0])},${f(ridgeR[1])}Q${f(x + w * 0.88)},${f(y - h * 0.55)} ${f(x + w)},${f(y - h * 0.25)}`, "k1", x, x + w, { delay: 0.15 });
  // ridge cap double line
  stroke("fore", sline(ridgeL[0] - 4, ridgeL[1] - 4, ridgeR[0] + 4, ridgeR[1] - 4, 0.2), "k1", ridgeL[0], ridgeR[0], { delay: 0.3 });
  // tile rows: lines falling from ridge to eave
  let tiles = "", n = 0;
  for (let u = 0.06; u < 0.95; u += 0.028) {
    const tx = ridgeL[0] + (ridgeR[0] - ridgeL[0]) * Math.min(1, Math.max(0, (u - 0.1) / 0.8));
    const bx = x + w * u;
    const by = y + h * 0.08 * Math.sin(u * Math.PI) - h * 0.25 * (1 - Math.sin(u * Math.PI)) * 0.6;
    tiles += `M${f(tx)},${f(ridgeL[1] + 2)}Q${f((tx + bx) / 2)},${f((ridgeL[1] + by) / 2 + 3)} ${f(bx)},${f(by - 2)}`;
    n++;
  }
  stroke("fore", tiles, "k3", x, x + w, { dur: 1.3, delay: 0.4 });
  // walls and posts under the eaves
  const wy = y + 4, wb = y + 40;
  stroke("fore", sline(x + w * 0.14, wy, x + w * 0.14, wb, 0.2), "k2", x, x + w * 0.2, { delay: 0.5 });
  stroke("fore", sline(x + w * 0.86, wy, x + w * 0.86, wb, 0.2), "k2", x + w * 0.8, x + w, { delay: 0.6 });
  for (let u = 0.3; u < 0.8; u += 0.18) stroke("fore", sline(x + w * u, wy + 2, x + w * u, wb, 0.2), "k3", x + w * u, x + w * u + 1, { delay: 0.6 });
  let lat = "";
  for (let yy = wy + 8; yy < wb - 2; yy += 6) lat += `M${f(x + w * 0.32)},${f(yy)}H${f(x + w * 0.46)}M${f(x + w * 0.5)},${f(yy)}H${f(x + w * 0.64)}`;
  stroke("fore", lat, "k4", x + w * 0.3, x + w * 0.66, { delay: 0.8 });
}
hanok(-30, 912, 230);
hanok(170, 925, 200);
hanok(345, 905, 210);
for (let x = -10; x < 560; x += rr(20, 40)) clump("fore", x, 968 + rr(-2, 4), rr(20, 34), "k2");

// ---------- Han river and bridge ----------
{
  const deckY = 985;
  OCC("river", `M0,${deckY - 18}H${W}V${H}H0Z`);
  // embankment line
  for (let x = 0; x < W; x += 160) stroke("river", sline(x, deckY - 18, Math.min(W, x + 165), deckY - 18 + rr(-1, 1), 0.4), "k2", x, x + 160, { jitter: 0 });
  // deck: two rails and a hatched fascia, drawn in chunks
  for (let x = 0; x < W; x += 120) {
    const x2 = Math.min(W + 4, x + 124);
    stroke("river", sline(x, deckY, x2, deckY, 0.2), "k1", x, x2, { jitter: 0.1 });
    stroke("river", sline(x, deckY + 9, x2, deckY + 9, 0.2), "k1", x, x2, { jitter: 0.15 });
    let ticks = "";
    for (let t = x + 4; t < x2; t += 6) ticks += `M${f(t)},${f(deckY + 1)}v7`;
    stroke("river", ticks, "k4", x, x2, { jitter: 0.25 });
    // railing posts
    let rail = "";
    for (let t = x + 3; t < x2; t += 10) rail += `M${f(t)},${f(deckY)}v-6`;
    stroke("river", rail + `M${f(x)},${f(deckY - 6)}H${f(x2)}`, "k3", x, x2, { jitter: 0.3 });
  }
  // arches between piers
  const span = 160;
  for (let x = -40; x < W; x += span) {
    const a = `M${f(x)},${f(1070)}Q${f(x + span / 2)},${f(deckY + 18)} ${f(x + span)},${f(1070)}`;
    stroke("river", a, "k2", x, x + span, { jitter: 0.2 });
    stroke("river", sline(x - 6, deckY + 10, x - 6, 1078, 0.2), "k1", x - 6, x, { jitter: 0.3 });
    stroke("river", sline(x + 6, deckY + 10, x + 6, 1078, 0.2), "k1", x, x + 6, { jitter: 0.35 });
    // spandrel verticals
    let sp = "";
    for (let u = 0.12; u < 0.9; u += 0.12) {
      const sx = x + span * u;
      const sy = 1070 - (1070 - (deckY + 18)) * 4 * u * (1 - u) * 0.5 * 2;
      sp += `M${f(sx)},${f(deckY + 10)}V${f(sy)}`;
    }
    stroke("river", sp, "k4", x, x + span, { jitter: 0.45 });
  }
  // water ripples
  for (let i = 0; i < 160; i++) {
    const x = rr(0, W), y = rr(deckY + 28, 1076), w = rr(10, 46);
    stroke("river", sline(x, y, x + w, y + rr(-0.6, 0.6), 0.3), "k4", x, x + w, { min: 0.25 });
  }
  // tower reflection
  for (let y = deckY + 30; y < 1075; y += 7) {
    const w = rr(6, 20);
    stroke("river", sline(LT.x - w, y, LT.x + w, y, 0.2), "k3", LT.x - w, LT.x + w, { min: 0.3, delay: 3 });
  }
}

// ---------- write the scene ----------
const svg = order
  .map((l) => `<g id="dr-${l}">\n${layers[l].join("\n")}\n</g>`)
  .join("\n");

const html = `<template>
  <style>
    #root {
      position: absolute;
      inset: 0;
      background: var(--paper, #f6f2e9);
      overflow: hidden;
    }
    #dr-art {
      position: absolute;
      inset: 0;
      transform-origin: 46% 60%;
    }
    #dr-art svg {
      width: 100%;
      height: 100%;
      display: block;
    }
    #dr-art path {
      fill: none;
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-dasharray: 1 1;
      stroke-dashoffset: 1;
    }
    #dr-art path.occ {
      fill: var(--paper, #f6f2e9);
      stroke: none;
      stroke-dasharray: none;
    }
    #dr-art .k0 { stroke: var(--ink, #1d1d1f); stroke-width: 2.1; }
    #dr-art .k1 { stroke: var(--ink, #1d1d1f); stroke-width: 1.4; }
    #dr-art .k2 { stroke: var(--ink, #1d1d1f); stroke-width: 1.05; }
    #dr-art .k3 { stroke: var(--ink-soft, #4a4a4e); stroke-width: 0.95; }
    #dr-art .k4 { stroke: var(--ink-faint, #7c7b78); stroke-width: 0.8; }
    #dr-sunfill {
      position: absolute;
      left: ${SUN.x - SUN.r}px;
      top: ${SUN.y - SUN.r}px;
      width: ${SUN.r * 2}px;
      height: ${SUN.r * 2}px;
      border-radius: 50%;
      background: var(--accent, #f08a5d);
      opacity: 0;
    }
    #dr-grain {
      position: absolute;
      inset: 0;
      pointer-events: none;
      opacity: 0.35;
      mix-blend-mode: multiply;
    }
  </style>
  <div id="root" data-composition-id="drawing" data-width="1920" data-height="1080">
    <div id="dr-art">
      <div id="dr-sunfill"></div>
      <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
${svg}
      </svg>
    </div>
    <svg id="dr-grain" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <filter id="dr-paper"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 0.55  0 0 0 0 0.5  0 0 0 0 0.42  0 0 0 0.22 0"/></filter>
      <rect width="100%" height="100%" filter="url(#dr-paper)"/>
    </svg>
  </div>
  <script>
    (function () {
      const tl = gsap.timeline({ paused: true });
      const paths = Array.from(document.querySelectorAll("#dr-art path:not(.occ)"));
      const items = paths.map((el) => ({
        el,
        t: parseFloat(el.dataset.t),
        d: parseFloat(el.dataset.d),
        v: -1,
      }));
      const ease = (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
      const clock = { t: 0 };
      function draw() {
        const now = clock.t;
        for (const it of items) {
          let u = (now - it.t) / it.d;
          u = u <= 0 ? 0 : u >= 1 ? 1 : ease(u);
          if (u !== it.v) {
            it.v = u;
            it.el.style.strokeDashoffset = String(1 - u);
          }
        }
      }
      tl.to(clock, { t: 30, duration: 30, ease: "none", onUpdate: draw }, 0);
      // a slow pull-back across the whole film
      tl.fromTo("#dr-art", { scale: 1.045 }, { scale: 1, duration: 30, ease: "sine.inOut" }, 0);
      // the sun warms once the skyline is complete
      tl.fromTo("#dr-sunfill", { opacity: 0 }, { opacity: 0.42, duration: 2.5, ease: "power2.out" }, 24.6);
      window.__timelines["drawing"] = tl;
      draw();
    })();
  </script>
</template>
`;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
mkdirSync(join(root, "compositions"), { recursive: true });
writeFileSync(join(root, "compositions", "drawing.html"), html);
console.log(`paths: ${pathCount}, bytes: ${html.length}`);

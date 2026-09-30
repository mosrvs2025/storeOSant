import { FIXTURES, STORE, type Pt } from './layout';

// Walkable grid at 2 ft resolution. The parking lot (y > 170) is modeled as open floor
// reachable through the front doors so cart runs route correctly.
export const CELL = 2;
export const COLS = Math.ceil(STORE.w / CELL);
export const ROWS = Math.ceil(206 / CELL);
const LOT_Y = STORE.h;

const walk = new Uint8Array(COLS * ROWS);
(function build() {
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const x = c * CELL + CELL / 2;
      const y = r * CELL + CELL / 2;
      let ok = true;
      // front wall with the doors as the only opening
      if (y > LOT_Y - 2 && y < LOT_Y + 2 && !(x > 228 && x < 252)) ok = false;
      for (const f of FIXTURES) {
        const R = f.rect;
        // 1 ft clearance around fixtures
        if (x > R.x - 1 && x < R.x + R.w + 1 && y > R.y - 1 && y < R.y + R.h + 1) {
          ok = false;
          break;
        }
      }
      walk[r * COLS + c] = ok ? 1 : 0;
    }
})();

export const isWalkable = (c: number, r: number) =>
  c >= 0 && r >= 0 && c < COLS && r < ROWS && walk[r * COLS + c] === 1;

function toCell(p: Pt): number {
  let c = Math.min(COLS - 1, Math.max(0, Math.floor(p.x / CELL)));
  let r = Math.min(ROWS - 1, Math.max(0, Math.floor(p.y / CELL)));
  if (isWalkable(c, r)) return r * COLS + c;
  // snap to the nearest walkable cell
  for (let rad = 1; rad < 12; rad++)
    for (let dr = -rad; dr <= rad; dr++)
      for (let dc = -rad; dc <= rad; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== rad) continue;
        if (isWalkable(c + dc, r + dr)) return (r + dr) * COLS + (c + dc);
      }
  return r * COLS + c;
}
const cellPt = (i: number): Pt => ({ x: (i % COLS) * CELL + CELL / 2, y: Math.floor(i / COLS) * CELL + CELL / 2 });

interface Field {
  dist: Float64Array;
  prev: Int32Array;
}
const fieldCache = new Map<number, Field>();

function dijkstra(src: number): Field {
  const hit = fieldCache.get(src);
  if (hit) return hit;
  const n = COLS * ROWS;
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  // binary heap of [dist, idx]
  const hd: number[] = [];
  const hi: number[] = [];
  const push = (d: number, i: number) => {
    let k = hd.length;
    hd.push(d);
    hi.push(i);
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (hd[p] <= hd[k]) break;
      [hd[p], hd[k]] = [hd[k], hd[p]];
      [hi[p], hi[k]] = [hi[k], hi[p]];
      k = p;
    }
  };
  const pop = () => {
    const d = hd[0];
    const i = hi[0];
    const ld = hd.pop()!;
    const li = hi.pop()!;
    if (hd.length) {
      hd[0] = ld;
      hi[0] = li;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < hd.length && hd[l] < hd[m]) m = l;
        if (r < hd.length && hd[r] < hd[m]) m = r;
        if (m === k) break;
        [hd[m], hd[k]] = [hd[k], hd[m]];
        [hi[m], hi[k]] = [hi[k], hi[m]];
        k = m;
      }
    }
    return [d, i];
  };
  dist[src] = 0;
  push(0, src);
  const D = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, Math.SQRT2],
    [1, -1, Math.SQRT2],
    [-1, 1, Math.SQRT2],
    [-1, -1, Math.SQRT2],
  ];
  while (hd.length) {
    const [d, i] = pop();
    if (d > dist[i]) continue;
    const c = i % COLS;
    const r = (i - c) / COLS;
    for (const [dc, dr, w] of D) {
      const nc = c + dc;
      const nr = r + dr;
      if (!isWalkable(nc, nr)) continue;
      if (dc && dr && (!isWalkable(c + dc, r) || !isWalkable(c, r + dr))) continue;
      const j = nr * COLS + nc;
      const nd = d + w * CELL;
      if (nd < dist[j]) {
        dist[j] = nd;
        prev[j] = i;
        push(nd, j);
      }
    }
  }
  const f = { dist, prev };
  fieldCache.set(src, f);
  if (fieldCache.size > 120) fieldCache.delete(fieldCache.keys().next().value!);
  return f;
}

export function distance(a: Pt, b: Pt): number {
  const f = dijkstra(toCell(a));
  return f.dist[toCell(b)];
}

function lineOfSight(a: Pt, b: Pt): boolean {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (CELL / 2));
  for (let s = 0; s <= steps; s++) {
    const x = a.x + ((b.x - a.x) * s) / steps;
    const y = a.y + ((b.y - a.y) * s) / steps;
    if (!isWalkable(Math.floor(x / CELL), Math.floor(y / CELL))) return false;
  }
  return true;
}

/** Walking path from a to b as a smoothed polyline (feet). */
export function path(a: Pt, b: Pt): Pt[] {
  const src = toCell(a);
  const dst = toCell(b);
  const f = dijkstra(dst); // field rooted at the destination: follow prev from src
  if (!isFinite(f.dist[src])) return [a, b];
  const raw: Pt[] = [];
  for (let i = src; i !== -1; i = f.prev[i]) raw.push(cellPt(i));
  const out: Pt[] = [a];
  let anchor = raw[0];
  for (let i = 1; i < raw.length; i++) {
    if (!lineOfSight(anchor, raw[i])) {
      anchor = raw[i - 1];
      out.push(anchor);
    }
  }
  out.push(b);
  return out;
}

export const pathLength = (pts: Pt[]) =>
  pts.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - pts[i].x, p.y - pts[i].y), 0);

export interface RouteInput {
  point: Pt;
  urgency?: number; // extra cost per foot walked before reaching this stop (cold chain)
}

/**
 * Open-path TSP from `start` through all stops ending at `end`.
 * Nearest-neighbour seed + 2-opt + or-opt on a cost that includes an urgency
 * penalty, so frozen/cold stops naturally get visited early.
 */
export function planRoute(start: Pt, stops: RouteInput[], end: Pt): { order: number[]; feet: number } {
  const n = stops.length;
  if (n === 0) return { order: [], feet: distance(start, end) };
  const pts = [start, ...stops.map((s) => s.point), end];
  const m = pts.length;
  const D: number[][] = pts.map((p) => {
    const f = dijkstra(toCell(p));
    return pts.map((q) => f.dist[toCell(q)]);
  });
  const urg = [0, ...stops.map((s) => s.urgency ?? 0), 0];
  const cost = (ord: number[]) => {
    let c = 0;
    let walked = 0;
    let prev = 0;
    for (const k of ord) {
      walked += D[prev][k];
      c += D[prev][k] + urg[k] * walked;
      prev = k;
    }
    return c + D[prev][m - 1];
  };
  // nearest neighbour (urgency-aware)
  const left = new Set(Array.from({ length: n }, (_, i) => i + 1));
  let ord: number[] = [];
  let cur = 0;
  while (left.size) {
    let best = -1;
    let bc = Infinity;
    for (const k of left) {
      const c = D[cur][k] * (1 - Math.min(0.6, urg[k]));
      if (c < bc) {
        bc = c;
        best = k;
      }
    }
    ord.push(best);
    left.delete(best);
    cur = best;
  }
  let bestCost = cost(ord);
  let improved = true;
  let guard = 0;
  while (improved && guard++ < 60) {
    improved = false;
    for (let i = 0; i < n - 1; i++)
      for (let j = i + 1; j < n; j++) {
        const cand = [...ord.slice(0, i), ...ord.slice(i, j + 1).reverse(), ...ord.slice(j + 1)];
        const c = cost(cand);
        if (c + 1e-6 < bestCost) {
          ord = cand;
          bestCost = c;
          improved = true;
        }
      }
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const cand = [...ord];
        const [x] = cand.splice(i, 1);
        cand.splice(j, 0, x);
        const c = cost(cand);
        if (c + 1e-6 < bestCost) {
          ord = cand;
          bestCost = c;
          improved = true;
        }
      }
  }
  let feet = 0;
  let prev = 0;
  for (const k of ord) {
    feet += D[prev][k];
    prev = k;
  }
  feet += D[prev][m - 1];
  return { order: ord.map((k) => k - 1), feet };
}

/** Feet walked visiting stops in the given order (for "vs. scan order" comparisons). */
export function routeFeet(start: Pt, pts: Pt[], end: Pt): number {
  let f = 0;
  let prev = start;
  for (const p of pts) {
    f += distance(prev, p);
    prev = p;
  }
  return f + distance(prev, end);
}

export const WALK_FPS = 3.2; // feet per second with a cart
export const minutesFor = (feet: number, handleSec: number) => (feet / WALK_FPS + handleSec) / 60;

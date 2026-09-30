// The Reality Layer: where things actually are, learned from ordinary work.
// Every scan, put-away, "not here" and verification is an observation. Beliefs are
// recomputed from observations with time decay, so the model forgets stale facts
// and drifts toward what workers are seeing *now*.

import { PRODUCTS, type Product } from './products';
import { SLOT, SLOTS, areaOf } from './layout';
import { mulberry32 } from './rng';

export type ObsKind = 'plan' | 'confirm' | 'seen' | 'correct' | 'missing';

export interface Obs {
  id: string;
  pid: string;
  slot: string;
  kind: ObsKind;
  t: number;
  who: string;
  note?: string;
  photo?: string;
}

const W: Record<ObsKind, number> = { plan: 0.8, confirm: 1, seen: 0.7, correct: 2.6, missing: -1.4 };
const HOUR = 3600e3;
const DAY = 24 * HOUR;
const UNCERTAINTY = 0.6;

export interface Belief {
  slot: string;
  score: number;
  share: number;
}

export interface Knowledge {
  pid: string;
  beliefs: Belief[]; // sorted, positive only
  home: string;
  confidence: number; // 0..1 for home
  secondary?: string;
  lastSeen?: { slot: string; t: number; who: string };
  volatile: boolean;
  evidence: number; // count of non-plan observations
}

function halfLife(p: Product | undefined, kind: ObsKind) {
  if (kind === 'plan') return Infinity;
  return p?.drifty ? 1.5 * DAY : 6 * DAY;
}

export function knowledgeFor(pid: string, obs: Obs[], now: number, product?: Product): Knowledge {
  const score = new Map<string, number>();
  let lastSeen: Knowledge['lastSeen'];
  let evidence = 0;
  const recentSlots = new Set<string>();
  let recentCorrection = false;
  for (const o of obs) {
    if (o.pid !== pid || o.t > now) continue;
    const age = now - o.t;
    const hl = halfLife(product, o.kind);
    const decay = hl === Infinity ? 1 : Math.pow(0.5, age / hl);
    let w = W[o.kind] * decay;
    if (o.kind === 'missing') w = W.missing * Math.pow(0.5, age / (2 * DAY));
    score.set(o.slot, (score.get(o.slot) ?? 0) + w);
    if (o.kind !== 'plan') evidence++;
    if (o.kind !== 'plan' && o.kind !== 'missing') {
      if (!lastSeen || o.t > lastSeen.t) lastSeen = { slot: o.slot, t: o.t, who: o.who };
      if (age < 7 * DAY) recentSlots.add(o.slot);
    }
    if (o.kind === 'correct' && age < 7 * DAY) recentCorrection = true;
  }
  const pos = [...score.entries()].filter(([, s]) => s > 0.02);
  const total = pos.reduce((a, [, s]) => a + s, 0) + UNCERTAINTY;
  // A consistent second home (register display) is not a contradiction, so rival
  // locations only count at half weight against the top location's confidence.
  const topScore = pos.reduce((m, [, s]) => Math.max(m, s), 0);
  const conf = topScore / (topScore + UNCERTAINTY + 0.5 * (total - UNCERTAINTY - topScore));
  const beliefs = pos
    .map(([slot, s]) => ({ slot, score: s, share: s / total }))
    .sort((a, b) => b.score - a.score);
  const top = beliefs[0];
  const second = beliefs[1];
  return {
    pid,
    beliefs,
    home: top?.slot ?? product?.plan ?? SLOTS[0].id,
    confidence: top ? Math.min(0.99, conf) : 0,
    secondary: second && second.share >= 0.12 ? second.slot : undefined,
    lastSeen,
    volatile: recentSlots.size >= 3 || (recentSlots.size >= 2 && recentCorrection) || (!!product?.drifty && recentSlots.size >= 2),
    evidence,
  };
}

export function allKnowledge(obs: Obs[], now: number): Record<string, Knowledge> {
  const byPid = new Map<string, Obs[]>();
  for (const o of obs) {
    if (o.t > now) continue;
    let a = byPid.get(o.pid);
    if (!a) byPid.set(o.pid, (a = []));
    a.push(o);
  }
  const out: Record<string, Knowledge> = {};
  for (const p of PRODUCTS) out[p.id] = knowledgeFor(p.id, byPid.get(p.id) ?? [], now, p);
  return out;
}

/** Confidence by area plus how recently someone laid eyes on it. */
export interface AreaHealth {
  area: string;
  confidence: number;
  lastVerified?: number;
  products: number;
  trend: number; // confidence now minus confidence 24h ago
}

export function areaHealth(obs: Obs[], now: number): AreaHealth[] {
  const k = allKnowledge(obs, now);
  const kYesterday = allKnowledge(obs, now - DAY);
  const acc = new Map<string, { c: number; c0: number; n: number; last?: number }>();
  for (const p of PRODUCTS) {
    const s = SLOT[k[p.id].home];
    if (!s) continue;
    const a = areaOf(s);
    const e = acc.get(a) ?? { c: 0, c0: 0, n: 0 };
    e.c += k[p.id].confidence;
    e.c0 += kYesterday[p.id].confidence;
    e.n++;
    acc.set(a, e);
  }
  for (const o of obs) {
    if (o.kind === 'plan' || o.kind === 'missing' || o.t > now) continue;
    const s = SLOT[o.slot];
    if (!s) continue;
    const e = acc.get(areaOf(s));
    if (e && (!e.last || o.t > e.last)) e.last = o.t;
  }
  return [...acc.entries()].map(([area, e]) => ({
    area,
    confidence: e.c / e.n,
    lastVerified: e.last,
    products: e.n,
    trend: (e.c - e.c0) / e.n,
  }));
}

// ---------------------------------------------------------------------------
// Seed history: ~two weeks of simulated work by the closing and morning crews.

const CREW = ['Dana', 'Luis', 'Priya', 'Marcus', 'Jo'];
// Aisles nobody has walked lately — their confidence has been quietly decaying.
const NEGLECTED = new Set([9, 10]);

export function seedObservations(now: number): Obs[] {
  const rnd = mulberry32(214);
  const out: Obs[] = [];
  let n = 0;
  const add = (pid: string, slot: string, kind: ObsKind, t: number) =>
    out.push({ id: `s${n++}`, pid, slot, kind, t: Math.round(t), who: CREW[Math.floor(rnd() * CREW.length)] });

  for (const p of PRODUCTS) {
    add(p.id, p.plan, 'plan', now - 60 * DAY);
    const aisle = SLOT[p.plan]?.aisle;
    const neglected = aisle !== undefined && NEGLECTED.has(aisle) && SLOT[p.plan].zone === 'aisle';
    const moved = p.truth !== p.plan;
    const moveAt = now - (1.5 + rnd() * 3) * DAY;
    const count = neglected ? 1 + Math.floor(rnd() * 2) : 3 + Math.floor(rnd() * 7);
    for (let i = 0; i < count; i++) {
      const t = neglected ? now - (11 + rnd() * 7) * DAY : now - rnd() * 13 * DAY;
      if (moved && t > moveAt) {
        // After the move, only faint evidence has trickled in.
        if (rnd() < 0.35) add(p.id, p.truth, 'seen', t);
        continue;
      }
      add(p.id, moved ? p.plan : p.truth, rnd() < 0.8 ? 'confirm' : 'seen', t);
    }
    if (p.also) {
      const k = 2 + Math.floor(rnd() * 3);
      for (let i = 0; i < k; i++) add(p.id, p.also, 'seen', now - rnd() * 6 * DAY);
    }
    if (p.drifty) {
      // Seasonal items bounce between displays
      const spots = [p.plan, 'FE-SEAS', `E${2 + Math.floor(rnd() * 9)}-F`];
      for (let i = 0; i < 3; i++) add(p.id, spots[i % spots.length], 'seen', now - (0.3 + rnd() * 4) * DAY);
    }
  }
  // Produce was walked this morning; the front end a few minutes ago.
  for (const p of PRODUCTS) {
    const z = SLOT[p.truth].zone;
    if (z === 'produce') add(p.id, p.truth, 'confirm', now - (12 + rnd() * 6) * 60e3);
    if (z === 'front' && !p.drifty) add(p.id, p.truth, 'confirm', now - (25 + rnd() * 20) * 60e3);
  }
  // Takis live on the register display as much as in aisle 6.
  const takis = PRODUCTS.find((p) => p.name === 'Takis Fuego')!;
  for (let i = 0; i < 3; i++) add(takis.id, 'RG-3', 'seen', now - (1 + i * 20) * HOUR);
  // Seasonal Oreos: last confirmed on an endcap under an hour ago, then moved again.
  const oreo = PRODUCTS.find((p) => p.name === 'Oreo Pumpkin Spice')!;
  add(oreo.id, 'E9-F', 'seen', now - 43 * 60e3);
  return out.sort((a, b) => a.t - b.t);
}

export const fmtAgo = (t: number | undefined, now: number) => {
  if (!t) return 'never';
  const m = Math.round((now - t) / 60e3);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};

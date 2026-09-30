import { useSyncExternalStore } from 'react';
import { CORRALS, FRONT_END, SLOT, type Pt } from './layout';
import { IS_REAL } from './config';
import { DEMO_CART, PRODUCT, PRODUCTS, addProduct, lookupUpc, replaceCatalog, type Product } from './products';
import { allKnowledge, seedObservations, type Knowledge, type Obs, type ObsKind } from './reality';
import { planRoute, routeFeet } from './routing';

export type StopKind = 'putaway' | 'pick' | 'stock' | 'verify' | 'carts' | 'flag' | 'load';
export type RunKind = 'goback' | 'pick' | 'stock' | 'verify' | 'mixed' | 'find';

export interface Stop {
  id: string;
  kind: StopKind;
  slot?: string;
  point: Pt;
  pids: string[];
  title: string;
  ref?: string; // corral id / flag id / order id
  done?: 'ok' | 'moved' | 'skipped' | 'missing';
  movedTo?: string;
}

export interface Run {
  id: string;
  kind: RunKind;
  title: string;
  stops: Stop[];
  idx: number;
  startedAt: number;
  feet: number;
  naiveFeet?: number;
  coldFirst?: boolean;
  learned: number;
  reason?: string;
  ref?: string;
}

export interface Flag {
  id: string;
  slot: string;
  pid?: string;
  kind: 'price' | 'out' | 'spill' | 'damaged';
  text: string;
  t: number;
  resolved?: number;
}

export interface Order {
  id: string;
  customer: string;
  due: number;
  pids: string[];
  picked?: number;
}

export interface Learn {
  id: string;
  pid: string;
  from: string;
  to: string;
  before: number;
  after: number;
  t: number;
  photo?: string;
  via: 'tap' | 'voice' | 'list' | 'verify';
}

export interface State {
  v: number;
  obs: Obs[];
  cart: string[];
  run: Run | null;
  lastRun: (Run & { finishedAt: number }) | null;
  me: Pt;
  flags: Flag[];
  orders: Order[];
  cartsCollectedAt: Record<string, number>;
  learns: Learn[];
  intro: boolean;
}

export const STATE_KEY = IS_REAL ? 'storeos.real.v1' : 'storeos.v1';
const KEY = STATE_KEY;
const VERSION = 3;
const MIN = 60e3;

function fresh(): State {
  const now = Date.now();
  if (IS_REAL)
    return {
      v: VERSION,
      obs: PRODUCTS.map((p, i) => ({ id: `p${i}`, pid: p.id, slot: p.plan, kind: 'plan' as const, t: now, who: 'You' })),
      cart: [],
      run: null,
      lastRun: null,
      me: { ...FRONT_END },
      flags: [],
      orders: [],
      cartsCollectedAt: {},
      learns: [],
      intro: true,
    };
  const P = (name: string) => PRODUCTS.find((p) => p.name === name)!.id;
  return {
    v: VERSION,
    obs: seedObservations(now),
    cart: [],
    run: null,
    lastRun: null,
    me: { ...FRONT_END },
    flags: [
      { id: 'f1', slot: 'A9-D-R', pid: P('Ketchup'), kind: 'price', text: 'Shelf tag $3.49 · register rings $3.99', t: now - 95 * MIN },
      { id: 'f2', slot: 'A6-B-L', pid: P('Doritos Nacho Cheese'), kind: 'price', text: 'Sale tag expired yesterday', t: now - 40 * MIN },
      { id: 'f3', slot: 'A5-E-L', pid: P('Peanut Butter Creamy'), kind: 'out', text: 'Shelf empty · 2 cases in backstock', t: now - 70 * MIN },
      { id: 'f4', slot: 'A1-B-R', pid: P('Frosted Flakes'), kind: 'out', text: 'Down to 2 facings · 1 case in backstock', t: now - 25 * MIN },
      { id: 'f5', slot: 'A12-B-R', pid: P('Half Baked'), kind: 'out', text: 'Freezer door 4 empty · 1 case in backstock', t: now - 15 * MIN },
    ],
    orders: [
      {
        id: 'o1',
        customer: 'Pickup #4471 · R. Alvarez',
        due: now + 38 * MIN,
        pids: [P('Takis Fuego'), P('Large Eggs 12ct'), P('Sourdough Loaf'), P('Oreo Pumpkin Spice'), P('Bananas'), P('Frozen Peas')],
      },
      {
        id: 'o2',
        customer: 'Pickup #4476 · K. Osei',
        due: now + 95 * MIN,
        pids: [P('Spaghetti'), P('Marinara Sauce'), P('Brie Wheel'), P('Sparkling Water Lime')],
      },
    ],
    cartsCollectedAt: { A: now - 14 * MIN, B: now - 50 * MIN, C: now - 30 * MIN },
    learns: [],
    intro: true,
  };
}

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as State;
      if (s.v === VERSION) return s;
    }
  } catch {
    /* ignore */
  }
  return fresh();
}

let state: State = load();
let kCache: { obs: Obs[]; t: number; k: Record<string, Knowledge> } | null = null;
const subs = new Set<() => void>();

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage full (photos) — drop photos from older observations and retry once.
    state = { ...state, obs: state.obs.map((o, i) => (i < state.obs.length - 20 ? { ...o, photo: undefined } : o)) };
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* give up silently; state still lives in memory */
    }
  }
}

export function setState(fn: (s: State) => State) {
  state = fn(state);
  persist();
  subs.forEach((f) => f());
}

export const getState = () => state;

export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => sel(state),
  );
}

/** Knowledge for all products, memoized per observation list (refreshes each minute). */
export function knowledge(s: State = state): Record<string, Knowledge> {
  const t = Math.floor(Date.now() / MIN) * MIN;
  if (!kCache || kCache.obs !== s.obs || kCache.t !== t) kCache = { obs: s.obs, t, k: allKnowledge(s.obs, t + MIN) };
  return kCache.k;
}
export const useKnowledge = () => {
  const obs = useStore((s) => s.obs);
  return knowledge({ ...state, obs });
};

export function resetDemo() {
  state = fresh();
  kCache = null;
  persist();
  subs.forEach((f) => f());
}

let obsN = 0;
export function observe(pid: string, slot: string, kind: ObsKind, extra: Partial<Obs> = {}): Obs {
  const o: Obs = { id: `o${Date.now().toString(36)}${obsN++}`, pid, slot, kind, t: Date.now(), who: 'You', ...extra };
  setState((s) => ({ ...s, obs: [...s.obs, o] }));
  return o;
}

// ---------------------------------------------------------------------------
// Cart (go-backs being scanned)

export function addToCart(pid: string) {
  setState((s) => ({ ...s, cart: [...s.cart, pid] }));
}
export function removeFromCart(i: number) {
  setState((s) => ({ ...s, cart: s.cart.filter((_, j) => j !== i) }));
}
export function clearCart() {
  setState((s) => ({ ...s, cart: [] }));
}
export { DEMO_CART };

// ---------------------------------------------------------------------------
// Runs

const HANDLE: Record<StopKind, number> = { putaway: 14, pick: 20, stock: 70, verify: 30, carts: 100, flag: 35, load: 45 };
export const handleSec = (st: Stop) => HANDLE[st.kind] * (st.kind === 'putaway' || st.kind === 'pick' ? Math.max(1, st.pids.length) : 1);

const urgencyOf = (st: Stop) => {
  if (st.kind !== 'putaway' || !st.slot) return 0;
  const t = SLOT[st.slot].temp;
  return t === 'frozen' ? 0.45 : t === 'cold' ? 0.25 : 0;
};

let stopN = 0;
export const mkStop = (s: Omit<Stop, 'id'>): Stop => ({ ...s, id: `st${stopN++}` });

export function planStops(stops: Stop[], from: Pt, opts: { fixedFirst?: number } = {}) {
  const fixed = stops.slice(0, opts.fixedFirst ?? 0);
  const rest = stops.slice(opts.fixedFirst ?? 0);
  const start = fixed.length ? fixed[fixed.length - 1].point : from;
  const r = planRoute(start, rest.map((s) => ({ point: s.point, urgency: urgencyOf(s) })), FRONT_END);
  const ordered = [...fixed, ...r.order.map((i) => rest[i])];
  const feet = routeFeet(from, ordered.map((s) => s.point), FRONT_END);
  return { ordered, feet };
}

function startRun(kind: RunKind, title: string, stops: Stop[], extra: Partial<Run> = {}, fixedFirst = 0) {
  const s = getState();
  const { ordered, feet } = planStops(stops, s.me, { fixedFirst });
  const run: Run = { id: `r${Date.now()}`, kind, title, stops: ordered, idx: 0, startedAt: Date.now(), feet, learned: 0, ...extra };
  setState((st) => ({ ...st, run }));
  return run;
}

export function groupBySlot(pids: string[], k: Record<string, Knowledge>, kind: StopKind): Stop[] {
  const by = new Map<string, string[]>();
  for (const pid of pids) {
    const slot = k[pid].home;
    by.set(slot, [...(by.get(slot) ?? []), pid]);
  }
  return [...by.entries()].map(([slot, ps]) =>
    mkStop({ kind, slot, point: SLOT[slot].walk, pids: ps, title: ps.length > 1 ? `${ps.length} items` : PRODUCT[ps[0]].name }),
  );
}

export function startGoBacks() {
  const s = getState();
  const k = knowledge(s);
  const stops = groupBySlot(s.cart, k, 'putaway');
  const naiveFeet = routeFeet(s.me, s.cart.map((pid) => SLOT[k[pid].home].walk), FRONT_END);
  const coldFirst = stops.some((st) => urgencyOf(st) > 0);
  startRun('goback', `Go-backs · ${s.cart.length} items`, stops, { naiveFeet, coldFirst });
  setState((st) => ({ ...st, cart: [] }));
}

export function startPick(orderId: string) {
  const s = getState();
  const o = s.orders.find((x) => x.id === orderId)!;
  startRun('pick', o.customer, groupBySlot(o.pids, knowledge(s), 'pick'), { ref: o.id, reason: `Due ${new Date(o.due).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`, coldFirst: false });
}

export function startStock() {
  const s = getState();
  const outs = s.flags.filter((f) => f.kind === 'out' && !f.resolved);
  const load = mkStop({ kind: 'load', slot: 'BS-MAIN', point: SLOT['BS-MAIN'].walk, pids: outs.map((f) => f.pid!), title: `Pull ${outs.length} cases from backstock` });
  const stops = outs.map((f) => mkStop({ kind: 'stock', slot: f.slot, point: SLOT[f.slot].walk, pids: [f.pid!], title: PRODUCT[f.pid!].name, ref: f.id }));
  startRun('stock', `Stock outs · ${outs.length}`, [load, ...stops], {}, 1);
}

export function startFind(pid: string) {
  const k = knowledge();
  const home = k[pid].home;
  startRun('find', `Find · ${PRODUCT[pid].name}`, [mkStop({ kind: 'pick', slot: home, point: SLOT[home].walk, pids: [pid], title: PRODUCT[pid].name })]);
}

/** Truth Walk: the spots where one look buys the most certainty per foot walked. */
export function verifyCandidates(k: Record<string, Knowledge>, max = 7) {
  const gain = new Map<string, { g: number; pids: string[]; slot: string }>();
  for (const p of PRODUCTS) {
    const kn = k[p.id];
    const key = SLOT[kn.home].label; // one look covers both sides of a section
    const e = gain.get(key) ?? { g: 0, pids: [], slot: kn.home };
    e.g += (1 - kn.confidence) ** 1.5;
    e.pids.push(p.id);
    gain.set(key, e);
  }
  return [...gain.values()]
    .filter((e) => e.g > 0.12)
    .sort((a, b) => b.g - a.g)
    .slice(0, max);
}

export function startVerify() {
  const k = knowledge();
  const c = verifyCandidates(k);
  const n = c.reduce((a, x) => a + x.pids.length, 0);
  const stops = c.map((x) => mkStop({ kind: 'verify', slot: x.slot, point: SLOT[x.slot].walk, pids: x.pids, title: SLOT[x.slot].label }));
  startRun('verify', 'Truth Walk', stops, {
    reason: `${c.length} spots hold ${n} products the store is least sure about. One glance at each buys the most certainty per step.`,
  });
}

export function startPlan(stops: Stop[], title: string, reason: string) {
  // The copilot already sequenced these (insertion-optimised); keep its order.
  startRun('mixed', title, stops, { reason }, stops.length);
}

export function cancelRun() {
  setState((s) => ({ ...s, run: null }));
}

function advance(patch: Partial<Stop>, extra: (s: State) => Partial<State> = () => ({})) {
  setState((s) => {
    if (!s.run) return s;
    const stops = s.run.stops.map((st, i) => (i === s.run!.idx ? { ...st, ...patch } : st));
    const cur = stops[s.run.idx];
    const me = cur.movedTo ? SLOT[cur.movedTo].walk : cur.point;
    const idx = s.run.idx + 1;
    const run = { ...s.run, stops, idx };
    const base = { ...s, me: { ...me }, ...extra(s) };
    if (idx >= stops.length) {
      const orders = run.kind === 'pick' ? base.orders.map((o) => (o.id === run.ref ? { ...o, picked: Date.now() } : o)) : base.orders;
      return { ...base, orders, run: null, lastRun: { ...run, finishedAt: Date.now() }, me: { ...FRONT_END } };
    }
    return { ...base, run };
  });
}

export function completeStop(result: { verified?: Record<string, boolean> } = {}) {
  const s = getState();
  const run = s.run;
  if (!run) return;
  const st = run.stops[run.idx];
  const now = Date.now();
  if (st.kind === 'putaway' || st.kind === 'pick' || st.kind === 'stock') for (const pid of st.pids) observe(pid, st.slot!, 'confirm');
  if (st.kind === 'putaway' && run.kind === 'mixed') {
    // go-backs taken from the cart via a copilot plan leave the cart
    setState((s2) => {
      const cart = [...s2.cart];
      for (const pid of st.pids) {
        const j = cart.indexOf(pid);
        if (j >= 0) cart.splice(j, 1);
      }
      return { ...s2, cart };
    });
  }
  if (st.kind === 'verify') {
    for (const pid of st.pids) {
      const ok = result.verified?.[pid] ?? true;
      observe(pid, st.slot!, ok ? 'seen' : 'missing');
    }
  }
  advance({ done: 'ok' }, (s2) => ({
    flags: s2.flags.map((f) => (st.ref && f.id === st.ref ? { ...f, resolved: now } : f)),
    cartsCollectedAt: st.kind === 'carts' && st.ref ? { ...s2.cartsCollectedAt, [st.ref]: now } : s2.cartsCollectedAt,
  }));
}

export function skipStop() {
  advance({ done: 'skipped' });
}

/** A worker says "not here" and shows us where it really is. The Reality Layer learns. */
export function correctStop(pid: string, to: string, via: Learn['via'], photo?: string): Learn {
  const s = getState();
  const run = s.run!;
  const st = run.stops[run.idx];
  const before = knowledge(s)[pid];
  const from = st.slot!;
  observe(pid, from, 'missing');
  observe(pid, to, 'correct', { photo, note: via === 'voice' ? 'voice correction' : undefined });
  const after = knowledge()[pid];
  const learn: Learn = {
    id: `l${Date.now()}`,
    pid,
    from,
    to,
    before: before.confidence,
    after: after.home === to ? after.confidence : after.beliefs.find((b) => b.slot === to)?.share ?? 0,
    t: Date.now(),
    photo,
    via,
  };
  setState((s2) => ({ ...s2, learns: [learn, ...s2.learns], run: s2.run ? { ...s2.run, learned: s2.run.learned + 1 } : s2.run }));
  const rest = st.pids.filter((p) => p !== pid);
  if (rest.length === 0) advance({ done: 'moved', movedTo: to });
  else setState((s2) => (s2.run ? { ...s2, run: { ...s2.run, stops: s2.run.stops.map((x, i) => (i === s2.run!.idx ? { ...x, pids: rest } : x)) } } : s2));
  return learn;
}

/** Couldn't find a pick item at its home — mark it missing and detour to the next best guess. */
export function notFoundAt(pid: string): string | null {
  const s = getState();
  const run = s.run!;
  const st = run.stops[run.idx];
  observe(pid, st.slot!, 'missing');
  const k = knowledge()[pid];
  const alt = k.beliefs.find((b) => b.slot !== st.slot)?.slot ?? null;
  setState((s2) => {
    if (!s2.run) return s2;
    const stops = [...s2.run.stops];
    const cur = { ...stops[s2.run.idx], pids: stops[s2.run.idx].pids.filter((p) => p !== pid) };
    stops[s2.run.idx] = cur;
    if (alt) stops.splice(s2.run.idx + 1, 0, mkStop({ kind: st.kind, slot: alt, point: SLOT[alt].walk, pids: [pid], title: PRODUCT[pid].name }));
    const run2 = { ...s2.run, stops };
    return { ...s2, run: run2 };
  });
  if (getState().run!.stops[getState().run!.idx].pids.length === 0) advance({ done: 'missing' });
  return alt;
}

// ---------------------------------------------------------------------------
// Operational signals

export function cartsIn(corral: string, s: State = state, now = Date.now()) {
  if (IS_REAL) return 0; // no lot sensor in a real store (yet)
  const rate = { A: 5.5, B: 4, C: 7 }[corral] ?? 6; // minutes per returned cart
  return Math.min(24, Math.floor((now - (s.cartsCollectedAt[corral] ?? now)) / MIN / rate));
}

export const corralsBusy = (s: State = state, now = Date.now()) =>
  CORRALS.map((c) => ({ ...c, n: cartsIn(c.id, s, now) })).sort((a, b) => b.n - a.n);

// ---------------------------------------------------------------------------
// Aisle Lens sweep: the camera as a sensor. One pass down an aisle turns into
// dozens of observations — and catches things that moved.
// In this demo the "vision" reads the fictional store's ground truth.

export interface SweepResult {
  aisle: number;
  seen: string[];
  found: { pid: string; from: string; to: string }[];
  missing: { pid: string; from: string }[];
}

export function sweepAisle(n: number): SweepResult {
  const inView = (slot: string) => {
    const s = SLOT[slot];
    return (s.zone === 'aisle' && s.aisle === n) || slot === `E${n}-F` || slot === `E${n - 1}-F`;
  };
  const k = knowledge();
  const res: SweepResult = { aisle: n, seen: [], found: [], missing: [] };
  const newObs: Obs[] = [];
  const t = Date.now();
  let i = 0;
  const mk = (pid: string, slot: string, kind: ObsKind): Obs => ({ id: `v${t.toString(36)}${i++}`, pid, slot, kind, t, who: 'You · Lens' });
  for (const p of PRODUCTS) {
    const home = k[p.id].home;
    const places = [p.truth, p.also].filter((x): x is string => !!x && inView(x));
    for (const at of places) {
      if (at === home || at === k[p.id].secondary) {
        newObs.push(mk(p.id, at, 'seen'));
        res.seen.push(p.id);
      } else {
        newObs.push(mk(p.id, at, 'correct'));
        res.found.push({ pid: p.id, from: home, to: at });
      }
    }
    if (inView(home) && !places.includes(home)) {
      newObs.push(mk(p.id, home, 'missing'));
      res.missing.push({ pid: p.id, from: home });
    }
  }
  const before = knowledge();
  setState((s) => ({ ...s, obs: [...s.obs, ...newObs] }));
  const after = knowledge();
  const learns: Learn[] = res.found.map((f) => ({
    id: `l${t}${f.pid}`,
    pid: f.pid,
    from: f.from,
    to: f.to,
    before: before[f.pid].confidence,
    after: after[f.pid].home === f.to ? after[f.pid].confidence : after[f.pid].beliefs.find((b) => b.slot === f.to)?.share ?? 0,
    t,
    via: 'verify',
  }));
  if (learns.length) setState((s) => ({ ...s, learns: [...learns, ...s.learns] }));
  return res;
}

// ---------------------------------------------------------------------------
// Learning a real store

/** Adds a brand-new product that lives at `slot`. */
export function learnNewProduct(p: { upc: string; name: string; brand?: string; size?: string; emoji?: string }, slot: string): Product {
  const prod = addProduct({ upc: p.upc, name: p.name, brand: p.brand ?? '', size: p.size ?? '', emoji: p.emoji ?? '📦', price: 0, plan: slot });
  const t = Date.now();
  setState((s) => ({
    ...s,
    obs: [...s.obs, { id: `n${t.toString(36)}a`, pid: prod.id, slot, kind: 'plan', t, who: 'You' }, { id: `n${t.toString(36)}b`, pid: prod.id, slot, kind: 'confirm', t, who: 'You' }],
  }));
  return prod;
}

/** "I'm looking at this product on this shelf." Confirms, or teaches a new/extra spot. */
export function sawAt(pid: string, slot: string): 'confirmed' | 'moved' {
  const k = knowledge()[pid];
  const same = k.home === slot || k.secondary === slot;
  observe(pid, slot, same ? 'confirm' : 'correct');
  return same ? 'confirmed' : 'moved';
}

export function exportBackup(): string {
  return JSON.stringify({ app: 'storeos', v: 1, at: Date.now(), config: localStorage.getItem('storeos.config'), catalog: PRODUCTS, state });
}

export function importBackup(json: string) {
  const b = JSON.parse(json);
  if (b.app !== 'storeos') throw new Error('Not a StoreOS backup');
  if (b.config) localStorage.setItem('storeos.config', b.config);
  const real = b.config ? JSON.parse(b.config).mode === 'real' : false;
  if (real) localStorage.setItem('storeos.catalog', JSON.stringify(b.catalog ?? []));
  localStorage.setItem(real ? 'storeos.real.v1' : 'storeos.v1', JSON.stringify(b.state));
  location.reload();
}

export { lookupUpc, replaceCatalog };

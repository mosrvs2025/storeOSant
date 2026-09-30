// "I've got ten minutes. What should I do?"
// An on-device planner that reasons over the live store model: pending work, where it
// is, how long it takes, how urgent it is, and where the worker is standing right now.

import { AISLE_NAMES, CORRALS, FRONT_END, SLOT, areaOf, type Pt } from './layout';
import { PRODUCT, searchProducts } from './products';
import { areaHealth, fmtAgo } from './reality';
import { parseMinutes } from './parse';
import { distance, WALK_FPS } from './routing';
import { cartsIn, getState, handleSec, knowledge, mkStop, verifyCandidates, type Stop } from './state';

interface Candidate {
  stop: Stop;
  value: number;
  phrase: string;
  where: string;
}

function candidates(now = Date.now()): Candidate[] {
  const s = getState();
  const k = knowledge(s);
  const out: Candidate[] = [];
  for (const c of CORRALS) {
    const n = cartsIn(c.id, s, now);
    if (n >= 3)
      out.push({
        stop: mkStop({ kind: 'carts', point: c.walk, pids: [], title: `${Math.min(n, 12)} carts · ${c.label}`, ref: c.id }),
        value: Math.min(n, 12) * 0.9 + (n > 10 ? 4 : 0),
        phrase: `grab ${n > 12 ? 'a train of 12' : `the ${n}`} carts from ${c.label}`,
        where: 'the lot',
      });
  }
  s.cart.forEach((pid) => {
    const slot = k[pid].home;
    out.push({
      stop: mkStop({ kind: 'putaway', slot, point: SLOT[slot].walk, pids: [pid], title: PRODUCT[pid].name }),
      value: SLOT[slot].temp === 'frozen' ? 7 : SLOT[slot].temp === 'cold' ? 5 : 2.2,
      phrase: `put back the ${PRODUCT[pid].name}`,
      where: areaOf(SLOT[slot]),
    });
  });
  for (const f of s.flags) {
    if (f.resolved || f.kind !== 'price') continue;
    out.push({
      stop: mkStop({ kind: 'flag', slot: f.slot, point: SLOT[f.slot].walk, pids: f.pid ? [f.pid] : [], title: `Fix tag · ${f.pid ? PRODUCT[f.pid].name : ''}`, ref: f.id }),
      value: 4.5,
      phrase: `fix the price tag on ${f.pid ? PRODUCT[f.pid].name : 'a shelf'}`,
      where: areaOf(SLOT[f.slot]),
    });
  }
  for (const v of verifyCandidates(k, 4)) {
    out.push({
      stop: mkStop({ kind: 'verify', slot: v.slot, point: SLOT[v.slot].walk, pids: v.pids, title: `Verify · ${SLOT[v.slot].label}` }),
      value: 1.5 + v.g * 3,
      phrase: `glance at ${SLOT[v.slot].label} to re-verify ${v.pids.length === 1 ? PRODUCT[v.pids[0]].name : `${v.pids.length} items`}`,
      where: areaOf(SLOT[v.slot]),
    });
  }
  return out;
}

export interface Plan {
  text: string;
  stops: Stop[];
  minutes: number;
  title: string;
}

function secs(from: Pt, stops: Stop[]) {
  let t = 0;
  let p = from;
  for (const st of stops) {
    t += distance(p, st.point) / WALK_FPS + handleSec(st);
    p = st.point;
  }
  return t + distance(p, FRONT_END) / WALK_FPS;
}

export function planFor(minutes: number): Plan {
  const s = getState();
  const budget = minutes * 60;
  const pool = candidates();
  let route: Stop[] = [];
  let used = secs(s.me, route);
  const chosen: Candidate[] = [];
  for (;;) {
    let best: { c: Candidate; at: number; t: number; ratio: number } | null = null;
    for (const c of pool) {
      if (chosen.includes(c)) continue;
      if (route.length >= Math.min(12, 3 + Math.floor(minutes / 3))) break;
      if (c.stop.kind === 'carts' && chosen.some((x) => x.stop.kind === 'carts')) continue; // one cart run per trip
      for (let at = 0; at <= route.length; at++) {
        const trial = [...route.slice(0, at), c.stop, ...route.slice(at)];
        const t = secs(s.me, trial);
        if (t > budget) continue;
        const ratio = c.value / Math.max(20, t - used);
        if (!best || ratio > best.ratio) best = { c, at, t, ratio };
      }
    }
    if (!best) break;
    chosen.push(best.c);
    route = [...route.slice(0, best.at), best.c.stop, ...route.slice(best.at)];
    used = best.t;
  }
  const mins = Math.max(1, Math.round(used / 60));
  if (!route.length)
    return { text: `Nothing fits in ${minutes} minutes from where you're standing. Walking back to the front end is the best use of that time.`, stops: [], minutes: 0, title: 'Nothing fits' };
  const byStop = new Map(chosen.map((c) => [c.stop.id, c]));
  const seq = route.map((st) => byStop.get(st.id)!);
  // Merge consecutive same-kind phrases in the same area into one clause
  const clauses: string[] = [];
  for (let i = 0; i < seq.length; i++) {
    const c = seq[i];
    const group = [c];
    while (i + 1 < seq.length && seq[i + 1].stop.kind === c.stop.kind && (c.stop.kind === 'putaway' || c.stop.kind === 'pick') && seq[i + 1].stop.ref === c.stop.ref) group.push(seq[++i]);
    if (group.length > 1 && c.stop.kind === 'pick') {
      clauses.push(`pick ${group.length} items for ${getState().orders.find((o) => o.id === c.stop.ref)?.customer.split(' · ')[0] ?? 'a pickup order'}`);
    } else if (group.length > 1) {
      const areas = [...new Set(group.map((g) => g.where))];
      clauses.push(`take the ${group.length} go-backs for ${areas.join(' and ').replace(/Aisle (\d+) and Aisle/g, 'Aisles $1 and')}`);
    } else clauses.push(c.phrase);
  }
  const cap = (x: string) => x[0].toUpperCase() + x.slice(1);
  let text = cap(clauses[0]) + '.';
  if (clauses.length > 1) text += ` ${seq[0].stop.kind === 'carts' ? 'On the way back' : 'On the way'}, ${clauses.slice(1, -1).join(', ')}${clauses.length > 2 ? ', then ' : ''}${clauses[clauses.length - 1]}.`;
  text += ` You'll finish near the front end in about ${mins} minute${mins === 1 ? '' : 's'}.`;
  const left = pool.length - chosen.length;
  if (left > 0) text += ` (${left} other task${left === 1 ? '' : 's'} didn't make the cut.)`;
  const now = Date.now();
  for (const o of s.orders) {
    if (o.picked) continue;
    const due = (o.due - now) / 60e3;
    if (due > 75) continue;
    const pickMin = Math.max(3, Math.round(secs(FRONT_END, o.pids.map((pid) => mkStop({ kind: 'pick', point: SLOT[knowledge(s)[pid].home].walk, pids: [pid], title: '' }))) / 60));
    const startBy = new Date(o.due - (pickMin + 10) * 60e3).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    text += ` Keep an eye on ${o.customer.split(' · ')[0]}: due in ${Math.round(due)} min, roughly ${pickMin} minutes to pick — start it by ${startBy}.`;
  }
  return { text, stops: route, minutes: mins, title: `${minutes}-minute plan` };
}

export interface Answer {
  text: string;
  plan?: Plan;
  findPid?: string;
}

export function ask(q: string): Answer {
  const s = q.toLowerCase();
  const k = knowledge();
  if (/where|find|locate|looking for/.test(s)) {
    const term = s.replace(/.*?(where('s| is| are| do (we|i) keep)?|find|locate|looking for)\s+(the\s+)?/, '').replace(/[?.!]/g, '');
    const hit = searchProducts(term, 1)[0];
    if (hit) {
      const kn = k[hit.id];
      const slot = SLOT[kn.home];
      let text = `${hit.name} is most likely at ${slot.label} (${slot.detail}), ${Math.round(kn.confidence * 100)}% sure`;
      if (kn.secondary) text += `. Also shows up at ${SLOT[kn.secondary].label}`;
      if (kn.lastSeen) text += `. Last seen by ${kn.lastSeen.who} ${fmtAgo(kn.lastSeen.t, Date.now())}`;
      if (kn.volatile) text += `. Heads up: this one has been moving around`;
      return { text: text + '.', findPid: hit.id };
    }
  }
  const aisle = s.match(/aisle\s*(\d{1,2})/);
  if (aisle && /wrong|going on|status|how|check|problem/.test(s)) {
    const n = +aisle[1];
    const h = areaHealth(getState().obs, Date.now()).find((a) => a.area === `Aisle ${n}`);
    const flags = getState().flags.filter((f) => !f.resolved && SLOT[f.slot].aisle === n);
    if (h) {
      let text = `Aisle ${n} (${AISLE_NAMES[n]}) is at ${Math.round(h.confidence * 100)}% location confidence, last verified ${fmtAgo(h.lastVerified, Date.now())}.`;
      if (h.confidence < 0.7) text += ' Nobody has walked it in a while, so the model is drifting — a Truth Walk would fix that.';
      if (flags.length) text += ` Open issues: ${flags.map((f) => f.text).join('; ')}.`;
      return { text };
    }
  }
  const mins = parseMinutes(s) ?? (/what should i do|what now|next|bored|free/.test(s) ? 10 : undefined);
  if (mins) {
    const plan = planFor(Math.min(90, mins));
    return { text: plan.text, plan: plan.stops.length ? plan : undefined };
  }
  return {
    text: 'Try “I’ve got 10 minutes”, “where are the Takis?”, or “what’s going on in aisle 9?”',
  };
}

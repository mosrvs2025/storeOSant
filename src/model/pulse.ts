// Store Pulse: a live read of what's happening, derived from the spatial model.

import { SLOT, type Pt } from './layout';
import { PRODUCT } from './products';
import { areaHealth, fmtAgo } from './reality';
import { corralsBusy, knowledge, type State } from './state';

export type PulseTone = 'red' | 'amber' | 'mint' | 'blue' | 'violet';
export type PulseAction = 'carts' | 'gobacks' | 'pick' | 'stock' | 'verify' | 'flag' | 'reality';

export interface Signal {
  id: string;
  tone: PulseTone;
  icon: string;
  text: string;
  sub?: string;
  at?: Pt;
  action?: PulseAction;
  ref?: string;
  weight: number;
}

export function pulse(s: State, now = Date.now()): Signal[] {
  const out: Signal[] = [];
  const busy = corralsBusy(s, now);
  const totalCarts = busy.reduce((a, c) => a + c.n, 0);
  if (busy[0].n >= 6)
    out.push({
      id: 'carts',
      tone: busy[0].n >= 10 ? 'red' : 'amber',
      icon: '🛒',
      text: `Lot carts building · ${busy[0].label}`,
      sub: `${busy[0].n} carts there, ${totalCarts} across the lot`,
      at: busy[0].walk,
      action: 'carts',
      ref: busy[0].id,
      weight: busy[0].n,
    });
  if (s.cart.length)
    out.push({ id: 'gb', tone: 'amber', icon: '↩️', text: `${s.cart.length} unresolved go-backs`, sub: 'Scanned but not put away', action: 'gobacks', weight: 6 + s.cart.length / 2 });
  for (const o of s.orders) {
    if (o.picked) continue;
    const due = Math.round((o.due - now) / 60e3);
    out.push({
      id: o.id,
      tone: due < 20 ? 'red' : 'blue',
      icon: '🧺',
      text: `${o.customer.split(' · ')[0]} · ${o.pids.length} items`,
      sub: due >= 0 ? `Due in ${due} min` : `${-due} min late`,
      action: 'pick',
      ref: o.id,
      weight: due < 20 ? 12 : due < 45 ? 8 : 3,
    });
  }
  const outs = s.flags.filter((f) => f.kind === 'out' && !f.resolved);
  if (outs.length)
    out.push({
      id: 'outs',
      tone: 'amber',
      icon: '📦',
      text: `${outs.length} shelf outs with backstock on hand`,
      sub: outs.map((f) => PRODUCT[f.pid!].name).join(', '),
      at: SLOT[outs[0].slot].walk,
      action: 'stock',
      weight: 5 + outs.length,
    });
  for (const f of s.flags)
    if (f.kind === 'price' && !f.resolved)
      out.push({
        id: f.id,
        tone: 'violet',
        icon: '🏷️',
        text: `Price tag mismatch · ${SLOT[f.slot].label}`,
        sub: `${f.pid ? PRODUCT[f.pid].name + ' — ' : ''}${f.text}`,
        at: SLOT[f.slot].walk,
        action: 'flag',
        ref: f.id,
        weight: 4,
      });
  const health = areaHealth(s.obs, now);
  const falling = health.filter((h) => h.confidence < 0.72).sort((a, b) => a.confidence - b.confidence);
  for (const h of falling.slice(0, 2))
    out.push({
      id: `h-${h.area}`,
      tone: 'amber',
      icon: '⚠️',
      text: `${h.area} location confidence falling`,
      sub: `${Math.round(h.confidence * 100)}% · last verified ${fmtAgo(h.lastVerified, now)}`,
      action: 'verify',
      weight: 5 + (0.72 - h.confidence) * 20,
    });
  const k = knowledge(s);
  const movers = Object.values(k).filter((x) => x.volatile);
  if (movers.length)
    out.push({
      id: 'movers',
      tone: 'violet',
      icon: '🌀',
      text: `${movers.length} products on the move`,
      sub: movers.slice(0, 3).map((m) => PRODUCT[m.pid].name).join(', '),
      action: 'reality',
      weight: 3,
    });
  const fresh = health.filter((h) => h.lastVerified && now - h.lastVerified < 45 * 60e3).sort((a, b) => b.lastVerified! - a.lastVerified!);
  for (const h of fresh.slice(0, 2))
    out.push({ id: `v-${h.area}`, tone: 'mint', icon: '✓', text: `${h.area} verified ${fmtAgo(h.lastVerified, now)}`, sub: `${Math.round(h.confidence * 100)}% confidence`, weight: 1 });
  return out.sort((a, b) => b.weight - a.weight);
}

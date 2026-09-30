import { describe, expect, it, beforeEach } from 'vitest';
import { SLOTS, SLOT, FRONT_END } from '../layout';
import { distance, path, planRoute, routeFeet } from '../routing';
import { PRODUCTS, lookupUpc, DEMO_CART } from '../products';
import { allKnowledge, seedObservations } from '../reality';
import { parseLocation, parseMinutes } from '../parse';

const mem: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => (mem[k] = v), removeItem: (k: string) => delete mem[k] };

describe('layout & routing', () => {
  it('every slot walk point is reachable from the front end', () => {
    for (const s of SLOTS) expect(distance(FRONT_END, s.walk), s.id).toBeLessThan(700);
  });
  it('paths do not cut through gondolas', () => {
    const p = path(SLOT['A1-C-L'].walk, SLOT['A3-C-L'].walk);
    expect(p.length).toBeGreaterThan(2);
  });
  it('optimized route beats scan order', () => {
    const now = Date.now();
    const k = allKnowledge(seedObservations(now), now);
    const pts = DEMO_CART.map((pid) => SLOT[k[pid].home].walk);
    const r = planRoute(FRONT_END, pts.map((point) => ({ point })), FRONT_END);
    const naive = routeFeet(FRONT_END, pts, FRONT_END);
    expect(r.order.sort((a, b) => a - b)).toEqual(pts.map((_, i) => i));
    expect(r.feet).toBeLessThan(naive * 0.8);
  });
});

describe('reality layer', () => {
  const now = Date.now();
  const obs = seedObservations(now);
  const k = allKnowledge(obs, now);
  const byName = (n: string) => PRODUCTS.find((p) => p.name === n)!;
  it('stable products are confidently known', () => {
    expect(k[byName('Coca-Cola 12pk').id].confidence).toBeGreaterThan(0.8);
  });
  it('seasonal items are flagged volatile', () => {
    expect(k[byName('Oreo Pumpkin Spice').id].volatile).toBe(true);
  });
  it('Takis have a secondary location', () => {
    expect(k[byName('Takis Fuego').id].secondary).toBe('RG-3');
  });
  it('a correction flips belief', () => {
    const p = byName('Oreo Pumpkin Spice');
    const before = k[p.id];
    expect(before.home).not.toBe('E6-F');
    const o2 = [...obs, { id: 'x', pid: p.id, slot: before.home, kind: 'missing' as const, t: now, who: 'You' }, { id: 'y', pid: p.id, slot: 'E6-F', kind: 'correct' as const, t: now, who: 'You' }];
    const after = allKnowledge(o2, now + 1)[p.id];
    expect(after.home).toBe('E6-F');
    expect(after.confidence).toBeGreaterThan(before.confidence);
  });
  it('neglected aisle 9 has decayed confidence', () => {
    expect(k[byName('Ketchup').id].confidence).toBeLessThan(k[byName('Coca-Cola 12pk').id].confidence);
  });
});

describe('parsing', () => {
  it('understands spoken locations', () => {
    expect(parseLocation("It's actually on the endcap facing aisle six")!.slot.id).toBe('E6-F');
    expect(parseLocation('aisle 4 section B right')!.slot.id).toBe('A4-B-R');
    expect(parseLocation('register three')!.slot.id).toBe('RG-3');
    expect(parseLocation('by the yogurt')!.slot.id).toBe('DY-YOG');
    expect(parseLocation('seasonal pallet')!.slot.id).toBe('FE-SEAS');
  });
  it('parses time budgets', () => {
    expect(parseMinutes("I've got ten minutes")).toBe(10);
    expect(parseMinutes('half an hour')).toBe(30);
  });
  it('upc lookup round trips', () => {
    for (const p of PRODUCTS) expect(lookupUpc(p.upc)?.id).toBe(p.id);
    expect(new Set(PRODUCTS.map((p) => p.upc)).size).toBe(PRODUCTS.length);
  });
});

describe('copilot', () => {
  beforeEach(() => { for (const k in mem) delete mem[k]; });
  it('builds a plan within budget', async () => {
    const { ask } = await import('../copilot');
    const a = ask("I've got ten minutes. What should I do?");
    expect(a.plan).toBeTruthy();
    expect(a.plan!.minutes).toBeLessThanOrEqual(10);
    expect(a.text).toMatch(/minute/);
  });
  it('answers where-is questions', async () => {
    const { ask } = await import('../copilot');
    const a = ask('where are the takis?');
    expect(a.findPid).toBeTruthy();
    expect(a.text).toMatch(/Aisle 6/);
  });
});

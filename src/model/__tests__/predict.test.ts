import { describe, expect, it } from 'vitest';
import { predictSlot } from '../predict';
import { PRODUCTS, type Product } from '../products';
import { allKnowledge, seedObservations } from '../reality';

const now = Date.now();
const k = allKnowledge(seedObservations(now), now);

describe('predicting where an unknown item lives', () => {
  it('uses brand + name similarity against the demo catalog', () => {
    const g = predictSlot({ name: 'Doritos Cool Ranch', brand: 'Frito-Lay' }, k)!;
    expect(g.slot.startsWith('A6-')).toBe(true);
    expect(g.because).toMatch(/Doritos|Lay/);
  });
  it('uses Open Food Facts categories', () => {
    const pool: Product[] = PRODUCTS.map((p) => (p.name === 'Classic Potato Chips' ? { ...p, cats: ['snacks', 'salty-snacks', 'crisps', 'potato-crisps'] } : p));
    const g = predictSlot({ name: 'Kettle Sea Salt', brand: 'Kettle Brand', cats: ['snacks', 'salty-snacks', 'crisps', 'potato-crisps'] }, k, pool)!;
    expect(g.slot.startsWith('A6-')).toBe(true);
    expect(g.because).toMatch(/same category/);
  });
  it('returns null with no evidence', () => {
    expect(predictSlot({ name: 'Zzyzx Qwerty' }, k)).toBeNull();
  });
});

describe('walk order → section', async () => {
  const { sectionFor } = await import('../../ui/WalkAisle');
  it('spreads scans front to back on the way down, back to front on the way up', () => {
    const down = Array.from({ length: 10 }, (_, i) => sectionFor(i, 10, true)).join('');
    const up = Array.from({ length: 10 }, (_, i) => sectionFor(i, 10, false)).join('');
    expect(down).toBe('AABBCCDDEE');
    expect(up).toBe('EEDDCCBBAA');
    expect(sectionFor(0, 1, true)).toBe('A');
  });
});

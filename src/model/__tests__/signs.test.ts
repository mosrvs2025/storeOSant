import { describe, expect, it } from 'vitest';
import { mergeResults, toConfig } from '../signs';

describe('merging sign readings', () => {
  const a = { storeName: '', aisles: [{ number: 6, name: 'Chips', categories: ['Chips'], frozen: false }, { number: 12, name: 'Frozen Pizza', categories: ['Frozen Pizza'], frozen: true }], departments: ['Deli'], unreadable: 1 };
  const b = { storeName: 'Safeway', aisles: [{ number: 6, name: 'Chips · Soda', categories: ['chips', 'Soda'], frozen: false }, { number: 99, name: 'x', categories: [], frozen: false }], departments: ['deli', 'Bakery'], unreadable: 0 };
  it('dedupes aisles, categories and departments across batches', () => {
    const m = mergeResults([a, b]);
    expect(m.storeName).toBe('Safeway');
    expect(m.aisles.map((x) => x.number)).toEqual([6, 12]);
    expect(m.aisles[0].categories).toEqual(['Chips', 'Soda']);
    expect(m.aisles[0].name).toBe('Chips · Soda');
    expect(m.departments).toHaveLength(2);
    expect(m.unreadable).toBe(1);
  });
  it('becomes a store config', () => {
    const c = toConfig(mergeResults([a, b]));
    expect(c).toMatchObject({ mode: 'real', name: 'Safeway', aisles: 12, frozen: [12] });
    expect(c.aisleNames[6]).toBe('Chips · Soda');
  });
});

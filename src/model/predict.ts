// Where does a product we've never seen probably live?
// Reasoning by analogy: find known products that share its category, brand or name
// words, and vote for their locations. A half-mapped store is useful from day one.

import { AISLE_NAMES, SLOT, areaOf } from './layout';
import { PRODUCTS, type Product } from './products';
import type { Knowledge } from './reality';

export interface Guess {
  slot: string;
  confidence: number; // 0..1, share of the evidence
  because: string; // human reason: "next to Doritos Nacho Cheese"
}

const STOP = new Set(['the', 'and', 'with', 'for', 'of', 'oz', 'ct', 'pk', 'pack', 'lb', 'fl', 'count', 'original', 'classic', 'new', 'size', 'family', 'value']);
export const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w));

// Generic top-level categories match almost everything, so they count for little.
const BROAD = new Set(['plant-based-foods-and-beverages', 'plant-based-foods', 'beverages', 'foods', 'snacks', 'groceries', 'non-food-products']);

export function predictSlot(item: { name: string; brand?: string; cats?: string[] }, k: Record<string, Knowledge>, pool: Product[] = PRODUCTS): Guess | null {
  const itemWords = new Set(words(item.name));
  const brand = (item.brand ?? '').toLowerCase().trim();
  const cats = new Set(item.cats ?? []);
  const votes = new Map<string, { score: number; best: number; ref: Product; why: string }>();
  for (const p of pool) {
    const kn = k[p.id];
    if (!kn || kn.confidence < 0.2 || p.name.startsWith('Item …')) continue; // unnamed placeholders tell us nothing
    let s = 0;
    let why = '';
    if (p.cats && cats.size) {
      // specific shared categories (deeper in the taxonomy) are strong evidence
      const shared = p.cats.filter((c) => cats.has(c));
      for (const c of shared) s += BROAD.has(c) ? 0.2 : 1 + Math.min(2, c.split('-').length / 3);
      if (shared.length) why = 'same category as';
    }
    if (brand && p.brand && p.brand.toLowerCase() === brand) {
      s += 1.5;
      why ||= 'same brand as';
    }
    const common = words(p.name).filter((w) => itemWords.has(w)).length;
    if (common) {
      s += common * 1.2;
      why ||= 'similar to';
    }
    if (s <= 0.5) continue;
    s *= 0.5 + kn.confidence / 2;
    const v = votes.get(kn.home) ?? { score: 0, best: 0, ref: p, why };
    v.score += s;
    if (s > v.best) Object.assign(v, { best: s, ref: p, why });
    votes.set(kn.home, v);
  }
  if (!votes.size) return null;
  // Spread each spot's vote a little to its aisle neighbours: the aisle matters more than the exact section.
  const byAisle = new Map<string, number>();
  for (const [slot, v] of votes) {
    const a = areaOf(SLOT[slot]);
    byAisle.set(a, (byAisle.get(a) ?? 0) + v.score);
  }
  const total = [...votes.values()].reduce((a, v) => a + v.score, 0) + 1.5; // + uncertainty
  const [slot, v] = [...votes.entries()].sort((a, b) => b[1].score + (byAisle.get(areaOf(SLOT[b[0]]))! * 0.5) - (a[1].score + byAisle.get(areaOf(SLOT[a[0]]))! * 0.5))[0];
  const aisleShare = byAisle.get(areaOf(SLOT[slot]))! / total;
  const conf = Math.min(0.9, aisleShare * 0.8 + (v.score / total) * 0.2);
  const s = SLOT[slot];
  const aisleName = s.zone === 'aisle' && AISLE_NAMES[s.aisle!] !== `Aisle ${s.aisle}` ? ` (${AISLE_NAMES[s.aisle!]})` : '';
  return { slot, confidence: conf, because: `${v.why} ${v.ref.name}${aisleName}` };
}

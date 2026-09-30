// Turns what a worker says ("it's actually on the endcap facing aisle six") into a slot.

import { SLOT, SLOTS, type Slot } from './layout';

const NUM: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, for: 4, five: 5, six: 6, seven: 7, eight: 8, ate: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, first: 1, second: 2, third: 3, fourth: 4,
  fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
};

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((w) => (NUM[w] !== undefined ? String(NUM[w]) : w))
    .join(' ')
    .trim();
}

export interface ParsedLocation {
  slot: Slot;
  confidence: number;
}

export function parseLocation(input: string): ParsedLocation | null {
  const s = normalize(input);
  if (!s) return null;
  const num = (re: RegExp) => {
    const m = s.match(re);
    return m ? +m[1] : undefined;
  };

  const aisle = num(/(?:aisle|isle|row)\s*(\d{1,2})/) ?? num(/\ba(\d{1,2})\b/);
  const endcap = /\b(endcap|end cap|end|cap)\b/.test(s);
  const back = /\b(back|rear|meat|deli)\b/.test(s);
  const left = /\bleft\b/.test(s);
  const right = /\bright\b/.test(s);
  const section = s.match(/section\s*([a-e])\b/)?.[1]?.toUpperCase() ?? s.match(/\b(\d{1,2})([a-e])\b/)?.[2]?.toUpperCase();
  const shortAisle = s.match(/\b(\d{1,2})([a-e])\b/);

  if (endcap) {
    const n = num(/(?:endcap|end cap|end|cap)\s*(\d{1,2})/) ?? aisle ?? num(/(\d{1,2})/);
    if (n && SLOT[`E${n}-F`]) return { slot: SLOT[`E${n}-${back ? 'B' : 'F'}`], confidence: 0.9 };
  }
  const reg = num(/(?:register|lane|checkout|reg)\s*(\d)/);
  if (reg && SLOT[`RG-${reg}`]) return { slot: SLOT[`RG-${reg}`], confidence: 0.9 };

  const a = aisle ?? (shortAisle ? +shortAisle[1] : undefined);
  if (a && SLOT[`A${a}-A-L`]) {
    const sec = section ?? (/\b(front|near the front)\b/.test(s) ? 'A' : back ? 'E' : /\bmiddle\b/.test(s) ? 'C' : 'C');
    const side = right ? 'R' : 'L';
    return { slot: SLOT[`A${a}-${sec}-${side}`], confidence: section && (left || right) ? 0.95 : 0.7 };
  }

  // Fall back to fuzzy matching on slot labels ("dairy yogurt", "seasonal", "by the bananas").
  const words = s.split(' ').filter((w) => w.length > 2 && !['the', 'its', 'actually', 'on', 'by', 'near', 'over', 'there', 'with'].includes(w));
  let best: Slot | null = null;
  let bs = 0;
  for (const slot of SLOTS) {
    if (slot.zone === 'aisle' || slot.zone === 'endcap') continue;
    const hay = normalize(`${slot.label} ${slot.detail}`);
    let score = 0;
    for (const w of words) if (hay.includes(w.replace(/s$/, ''))) score += w.length;
    if (score > bs) {
      bs = score;
      best = slot;
    }
  }
  return best ? { slot: best, confidence: Math.min(0.85, 0.4 + bs / 20) } : null;
}

/** Extracts a time budget from "I've got ten minutes" / "15 min" / "half an hour". */
export function parseMinutes(input: string): number | undefined {
  const s = normalize(input);
  if (/half an hour|half hour/.test(s)) return 30;
  if (/an hour|1 hour/.test(s)) return 60;
  if (/quarter hour|15 minutes/.test(s)) return 15;
  const m = s.match(/(\d{1,3})\s*(?:min|minute|mins|m\b)/) ?? s.match(/\b(\d{1,3})\b/);
  return m ? +m[1] : undefined;
}

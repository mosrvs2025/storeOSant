// Client side of "snap your store": shrink photos, send them to /api/read-signs in
// batches, merge what comes back into a store config.

import type { StoreConfig } from './config';

export interface ReadAisle {
  number: number;
  name: string;
  categories: string[];
  frozen: boolean;
}
export interface ReadResult {
  storeName: string;
  aisles: ReadAisle[];
  departments: string[];
  unreadable: number;
}

export const BATCH = 8; // keeps each request well under Vercel's 4.5 MB body limit

/** Downscale a photo to a JPEG data URL small enough to upload over store Wi-Fi. */
export async function shrinkPhoto(file: Blob, max = 1280, quality = 0.72): Promise<string> {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s);
  c.height = Math.round(bmp.height * s);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c.toDataURL('image/jpeg', quality);
}

export function mergeResults(parts: ReadResult[]): ReadResult {
  const byNum = new Map<number, ReadAisle>();
  for (const p of parts)
    for (const a of p.aisles) {
      if (!Number.isFinite(a.number) || a.number < 1 || a.number > 60) continue;
      const cur = byNum.get(a.number);
      if (!cur) byNum.set(a.number, { ...a, categories: [...a.categories] });
      else {
        for (const c of a.categories) if (!cur.categories.some((x) => x.toLowerCase() === c.toLowerCase())) cur.categories.push(c);
        cur.frozen ||= a.frozen;
        // the same aisle photographed twice: the name becomes everything either sign listed
        if (cur.categories.length) cur.name = cur.categories.join(' · ');
        else if (a.name.length > cur.name.length) cur.name = a.name;
      }
    }
  const depts = new Map<string, string>();
  for (const p of parts) for (const d of p.departments) depts.set(d.toLowerCase(), d);
  return {
    storeName: parts.map((p) => p.storeName).find((n) => n.trim()) ?? '',
    aisles: [...byNum.values()].sort((a, b) => a.number - b.number),
    departments: [...depts.values()],
    unreadable: parts.reduce((a, p) => a + p.unreadable, 0),
  };
}

export async function readSigns(photos: string[], onProgress: (done: number) => void, endpoint = './api/read-signs'): Promise<ReadResult> {
  const parts: ReadResult[] = [];
  for (let i = 0; i < photos.length; i += BATCH) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ photos: photos.slice(i, i + BATCH) }),
    });
    const body = await res.json().catch(() => ({ error: `Server error ${res.status}` }));
    if (!res.ok) throw new Error(body.error ?? `Server error ${res.status}`);
    parts.push(body as ReadResult);
    onProgress(Math.min(photos.length, i + BATCH));
  }
  return mergeResults(parts);
}

export function toConfig(r: ReadResult, base: Partial<StoreConfig> = {}): StoreConfig {
  const max = r.aisles.reduce((m, a) => Math.max(m, a.number), 0);
  return {
    mode: 'real',
    name: base.name || r.storeName || '',
    number: base.number ?? '',
    aisles: Math.max(4, max || 12),
    aisleNames: Object.fromEntries(r.aisles.map((a) => [a.number, a.name || a.categories.join(' · ')])),
    frozen: r.aisles.filter((a) => a.frozen).map((a) => a.number),
  };
}

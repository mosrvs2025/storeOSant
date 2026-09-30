// Fernwood Market #214 — a fictional 260 × 170 ft grocery store.
// All coordinates are in feet. (0,0) is the back-left corner; y grows toward the front doors.

export type Pt = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };

export const STORE = { name: 'Fernwood Market', number: '#214', w: 260, h: 170 };

export type Zone =
  | 'aisle'
  | 'endcap'
  | 'produce'
  | 'bakery'
  | 'meat'
  | 'deli'
  | 'dairy'
  | 'front'
  | 'backstock';

export type Temp = 'ambient' | 'cold' | 'frozen';

export interface Slot {
  id: string;
  zone: Zone;
  label: string; // short: "Aisle 4 · B"
  detail: string; // long: "Section B · Left side"
  walk: Pt; // where a worker stands
  shelf: Rect; // what gets highlighted on the map
  aisle?: number;
  temp: Temp;
}

export const AISLE_COUNT = 12;
export const GONDOLA_Y0 = 26;
export const GONDOLA_Y1 = 108;
export const SECTIONS = ['A', 'B', 'C', 'D', 'E'] as const;

export const AISLE_NAMES: Record<number, string> = {
  1: 'Cereal & Breakfast',
  2: 'Coffee & Tea',
  3: 'Baking & Spices',
  4: 'Pasta & Dinners',
  5: 'Canned & Soup',
  6: 'Chips & Snacks',
  7: 'Cookies & Crackers',
  8: 'Soda & Water',
  9: 'International & Condiments',
  10: 'Paper & Cleaning',
  11: 'Frozen Meals',
  12: 'Frozen Treats & Veg',
};

export const gondolaX = (k: number) => 52 + 13 * k; // left edge, width 5
export const aisleX = (n: number) => 61 + 13 * (n - 1); // walkway center
const SECTION_LEN = (GONDOLA_Y1 - GONDOLA_Y0) / SECTIONS.length;

export interface Fixture {
  rect: Rect;
  kind: 'gondola' | 'case' | 'table' | 'counter' | 'register' | 'room' | 'display' | 'cooler';
  label?: string;
}

export const FIXTURES: Fixture[] = [
  { rect: { x: 8, y: 0, w: 46, h: 8 }, kind: 'case', label: 'Bakery' },
  { rect: { x: 60, y: 0, w: 90, h: 8 }, kind: 'case', label: 'Meat & Seafood' },
  { rect: { x: 150, y: 0, w: 55, h: 10 }, kind: 'counter', label: 'Deli' },
  { rect: { x: 205, y: 0, w: 55, h: 10 }, kind: 'room', label: 'Backstock' },
  { rect: { x: 250, y: 14, w: 10, h: 104 }, kind: 'cooler', label: 'Dairy' },
  { rect: { x: 0, y: 14, w: 6, h: 104 }, kind: 'cooler', label: 'Wet rack' },
  { rect: { x: 14, y: 24, w: 12, h: 20 }, kind: 'table' },
  { rect: { x: 14, y: 56, w: 12, h: 20 }, kind: 'table' },
  { rect: { x: 14, y: 88, w: 12, h: 18 }, kind: 'table' },
  { rect: { x: 32, y: 30, w: 10, h: 20 }, kind: 'table' },
  { rect: { x: 32, y: 64, w: 10, h: 20 }, kind: 'table' },
  ...Array.from({ length: AISLE_COUNT + 1 }, (_, k) => ({
    rect: { x: gondolaX(k), y: GONDOLA_Y0, w: 5, h: GONDOLA_Y1 - GONDOLA_Y0 },
    kind: (k >= 11 ? 'cooler' : 'gondola') as Fixture['kind'],
  })),
  ...Array.from({ length: 6 }, (_, r) => ({
    rect: { x: 58 + 22 * r, y: 128, w: 4, h: 12 },
    kind: 'register' as const,
    label: `${r + 1}`,
  })),
  { rect: { x: 196, y: 128, w: 30, h: 12 }, kind: 'counter', label: 'Service' },
  { rect: { x: 18, y: 130, w: 16, h: 12 }, kind: 'display', label: 'Seasonal' },
  { rect: { x: 236, y: 128, w: 18, h: 10 }, kind: 'display', label: 'Floral' },
];

// Where every work session starts and ends: the service desk, where go-back carts live.
export const FRONT_END: Pt = { x: 211, y: 150 };
export const DOORS: Rect = { x: 226, y: 168, w: 28, h: 2 };
export const CORRALS: { id: string; label: string; walk: Pt }[] = [
  { id: 'A', label: 'Corral A', walk: { x: 70, y: 192 } },
  { id: 'B', label: 'Corral B', walk: { x: 150, y: 196 } },
  { id: 'C', label: 'Corral C', walk: { x: 225, y: 192 } },
];

function buildSlots(): Slot[] {
  const slots: Slot[] = [];
  for (let n = 1; n <= AISLE_COUNT; n++) {
    const temp: Temp = n >= 11 ? 'frozen' : 'ambient';
    SECTIONS.forEach((s, i) => {
      const yFront = GONDOLA_Y1 - i * SECTION_LEN;
      const y = yFront - SECTION_LEN / 2;
      for (const side of ['L', 'R'] as const) {
        const gx = side === 'L' ? gondolaX(n - 1) + 2.5 : gondolaX(n);
        slots.push({
          id: `A${n}-${s}-${side}`,
          zone: 'aisle',
          aisle: n,
          label: `Aisle ${n} · ${s}`,
          detail: `Section ${s} · ${side === 'L' ? 'Left' : 'Right'} side`,
          walk: { x: aisleX(n) + (side === 'L' ? -1.5 : 1.5), y },
          shelf: { x: gx, y: yFront - SECTION_LEN, w: 2.5, h: SECTION_LEN },
          temp,
        });
      }
    });
  }
  // Endcaps on gondolas 1..12 (endcap N sits at the end of the shelf right of aisle N)
  for (let k = 1; k <= AISLE_COUNT; k++) {
    const cx = gondolaX(k) + 2.5;
    const temp: Temp = k >= 11 ? 'frozen' : 'ambient';
    slots.push({
      id: `E${k}-F`,
      zone: 'endcap',
      aisle: k,
      label: `Endcap ${k} · front`,
      detail: `Front endcap facing the registers, by Aisle ${k}`,
      walk: { x: cx, y: 113 },
      shelf: { x: gondolaX(k) - 1, y: GONDOLA_Y1, w: 7, h: 3 },
      temp,
    });
    slots.push({
      id: `E${k}-B`,
      zone: 'endcap',
      aisle: k,
      label: `Endcap ${k} · back`,
      detail: `Back endcap facing Meat & Deli, by Aisle ${k}`,
      walk: { x: cx, y: 20 },
      shelf: { x: gondolaX(k) - 1, y: GONDOLA_Y0 - 3, w: 7, h: 3 },
      temp,
    });
  }
  const P = (
    id: string,
    zone: Zone,
    label: string,
    detail: string,
    walk: Pt,
    shelf: Rect,
    temp: Temp = 'ambient',
  ) => slots.push({ id, zone, label, detail, walk, shelf, temp });

  P('PR-WET', 'produce', 'Produce · Wet rack', 'Misted greens along the left wall', { x: 9, y: 40 }, { x: 0, y: 20, w: 6, h: 44 }, 'cold');
  P('PR-HERB', 'produce', 'Produce · Herbs', 'Wet rack, front half', { x: 9, y: 90 }, { x: 0, y: 70, w: 6, h: 40 }, 'cold');
  P('PR-APL', 'produce', 'Produce · Apples', 'Table 1 by the bakery', { x: 29, y: 34 }, { x: 14, y: 24, w: 12, h: 20 });
  P('PR-CIT', 'produce', 'Produce · Citrus', 'Table 2, middle', { x: 29, y: 66 }, { x: 14, y: 56, w: 12, h: 20 });
  P('PR-BAN', 'produce', 'Produce · Bananas', 'Table 3 by the front', { x: 29, y: 97 }, { x: 14, y: 88, w: 12, h: 18 });
  P('PR-BER', 'produce', 'Produce · Berries', 'Island A', { x: 46, y: 40 }, { x: 32, y: 30, w: 10, h: 20 }, 'cold');
  P('PR-POT', 'produce', 'Produce · Potatoes & Onions', 'Island B', { x: 46, y: 74 }, { x: 32, y: 64, w: 10, h: 20 });
  P('BK-BREAD', 'bakery', 'Bakery · Bread', 'Bread rack, back-left', { x: 22, y: 12 }, { x: 8, y: 0, w: 22, h: 8 });
  P('BK-CASE', 'bakery', 'Bakery · Case', 'Pastry case', { x: 44, y: 12 }, { x: 30, y: 0, w: 24, h: 8 }, 'cold');
  P('MT-BEEF', 'meat', 'Meat · Beef', 'Meat case, left', { x: 75, y: 14 }, { x: 60, y: 0, w: 30, h: 8 }, 'cold');
  P('MT-POUL', 'meat', 'Meat · Poultry', 'Meat case, middle', { x: 105, y: 14 }, { x: 90, y: 0, w: 30, h: 8 }, 'cold');
  P('MT-PORK', 'meat', 'Meat · Pork & Sausage', 'Meat case, right', { x: 135, y: 14 }, { x: 120, y: 0, w: 30, h: 8 }, 'cold');
  P('DL-GRAB', 'deli', 'Deli · Grab & Go', 'Open cooler by the counter', { x: 165, y: 15 }, { x: 150, y: 0, w: 27, h: 10 }, 'cold');
  P('DL-CHS', 'deli', 'Deli · Specialty Cheese', 'Cheese island', { x: 192, y: 15 }, { x: 177, y: 0, w: 28, h: 10 }, 'cold');
  P('BS-MAIN', 'backstock', 'Backstock', 'Back room, through the swing doors', { x: 232, y: 14 }, { x: 205, y: 0, w: 55, h: 10 });
  P('DY-MILK', 'dairy', 'Dairy · Milk', 'Cooler doors 1–4', { x: 245, y: 24 }, { x: 250, y: 14, w: 10, h: 21 }, 'cold');
  P('DY-EGG', 'dairy', 'Dairy · Eggs', 'Cooler doors 5–7', { x: 245, y: 45 }, { x: 250, y: 35, w: 10, h: 21 }, 'cold');
  P('DY-YOG', 'dairy', 'Dairy · Yogurt', 'Cooler doors 8–10', { x: 245, y: 66 }, { x: 250, y: 56, w: 10, h: 21 }, 'cold');
  P('DY-BUT', 'dairy', 'Dairy · Butter & Cheese', 'Cooler doors 11–13', { x: 245, y: 87 }, { x: 250, y: 77, w: 10, h: 21 }, 'cold');
  P('DY-JUI', 'dairy', 'Dairy · Juice', 'Cooler doors 14–15', { x: 245, y: 106 }, { x: 250, y: 98, w: 10, h: 20 }, 'cold');
  for (let r = 0; r < 6; r++) {
    const x = 58 + 22 * r;
    P(`RG-${r + 1}`, 'front', `Register ${r + 1} rack`, `Impulse rack at lane ${r + 1}`, { x: x + 9, y: 134 }, { x: x + 4, y: 128, w: 3, h: 12 });
  }
  P('FE-SEAS', 'front', 'Seasonal pallet', 'Pallet display by the left entrance', { x: 40, y: 136 }, { x: 18, y: 130, w: 16, h: 12 });
  P('FE-SVC', 'front', 'Service desk', 'Customer service counter', { x: 211, y: 146 }, { x: 196, y: 128, w: 30, h: 12 });
  P('FE-FLOR', 'front', 'Floral', 'Floral stand by the doors', { x: 245, y: 144 }, { x: 236, y: 128, w: 18, h: 10 }, 'cold');
  return slots;
}

export const SLOTS: Slot[] = buildSlots();
export const SLOT: Record<string, Slot> = Object.fromEntries(SLOTS.map((s) => [s.id, s]));

export function nearestSlot(p: Pt, filter?: (s: Slot) => boolean): Slot {
  let best = SLOTS[0];
  let bd = Infinity;
  for (const s of SLOTS) {
    if (filter && !filter(s)) continue;
    const c = { x: s.shelf.x + s.shelf.w / 2, y: s.shelf.y + s.shelf.h / 2 };
    const d = Math.hypot(c.x - p.x, c.y - p.y) * 0.6 + Math.hypot(s.walk.x - p.x, s.walk.y - p.y) * 0.4;
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  return best;
}

export function zoneName(s: Slot): string {
  if (s.zone === 'aisle') return `Aisle ${s.aisle} — ${AISLE_NAMES[s.aisle!]}`;
  if (s.zone === 'endcap') return 'Endcaps';
  return s.label.split(' · ')[0];
}

// A coarse "area" key used for pulse / verification freshness.
export function areaOf(s: Slot): string {
  if (s.zone === 'aisle') return `Aisle ${s.aisle}`;
  if (s.zone === 'endcap') return 'Endcaps';
  if (s.zone === 'front') return 'Front end';
  return s.label.split(' · ')[0];
}

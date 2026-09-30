// Store configuration. Read once at startup; changing it reloads the app so the
// geometry-derived modules (layout, routing grid) are rebuilt.

export interface StoreConfig {
  mode: 'demo' | 'real';
  name: string;
  number: string;
  aisles: number;
  aisleNames: Record<number, string>;
  frozen: number[]; // aisle numbers that are freezer aisles
}

export const CONFIG_KEY = 'storeos.config';

export const DEMO_CONFIG: StoreConfig = {
  mode: 'demo',
  name: 'Fernwood Market',
  number: '#214',
  aisles: 12,
  aisleNames: {
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
  },
  frozen: [11, 12],
};

function read(): StoreConfig | null {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(CONFIG_KEY) : null;
    if (!raw) return null;
    const c = JSON.parse(raw) as StoreConfig;
    c.aisles = Math.max(4, Math.min(30, Math.round(c.aisles)));
    return c;
  } catch {
    return null;
  }
}

const stored = read();
/** True until the user picks "demo" or finishes setting up their store. */
export const NEEDS_SETUP = stored === null;
export const CONFIG: StoreConfig = stored ?? DEMO_CONFIG;
export const IS_REAL = CONFIG.mode === 'real';

export function saveConfig(c: StoreConfig, reload = true) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(c));
  // remember the real store's settings so switching to the demo and back loses nothing
  if (c.mode === 'real') localStorage.setItem(CONFIG_KEY + '.real', JSON.stringify(c));
  // keep the in-memory copy current so later saves in this session don't undo this one
  if (c.mode === CONFIG.mode) Object.assign(CONFIG, c);
  if (reload) location.reload();
}

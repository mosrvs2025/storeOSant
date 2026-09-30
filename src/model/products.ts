import { IS_REAL } from './config';

// A fictional product catalog. `plan` is where the corporate planogram says the item lives.
// `truth` is where it actually is in the demo store (used only to simulate history and
// to power the scanner's demo cart — the app itself never reads it for routing).

export interface Product {
  id: string;
  upc: string;
  name: string;
  brand: string;
  size: string;
  emoji: string;
  price: number;
  plan: string;
  truth: string;
  also?: string; // a real secondary location
  drifty?: boolean; // moves around a lot (seasonal / promo)
}

function upcCheck(d11: string): string {
  let odd = 0;
  let even = 0;
  for (let i = 0; i < 11; i++) {
    const n = +d11[i];
    if (i % 2 === 0) odd += n;
    else even += n;
  }
  return d11 + ((10 - ((odd * 3 + even) % 10)) % 10);
}

type Row = [string, string, string, string, number, string, string?, string?, boolean?];
// name, brand, size, emoji, price, plan slot, [truth slot], [also slot], [drifty]
const ROWS: Row[] = [
  ['Honey Nut Cheerios', 'General Mills', '15.4 oz', '🥣', 5.49, 'A1-B-L'],
  ['Frosted Flakes', "Kellogg's", '13.5 oz', '🥣', 4.99, 'A1-B-R'],
  ['Old Fashioned Oats', 'Quaker', '42 oz', '🌾', 6.29, 'A1-D-L'],
  ['Pop-Tarts Strawberry', "Kellogg's", '8 ct', '🍓', 3.79, 'A1-C-R'],
  ['Maple Syrup', 'Fernwood Farms', '12 oz', '🍁', 8.99, 'A1-E-L'],
  ['French Roast Coffee', 'Peet’s', '10.5 oz', '☕', 11.99, 'A2-B-L'],
  ['Colombia K-Cups', 'Dunkin’', '22 ct', '☕', 14.49, 'A2-C-R'],
  ['Green Tea', 'Bigelow', '20 ct', '🍵', 3.49, 'A2-D-L'],
  ['Hot Cocoa Mix', 'Swiss Miss', '8 ct', '🍫', 2.99, 'A2-E-R', 'FE-SEAS', undefined, true],
  ['All-Purpose Flour', 'Gold Medal', '5 lb', '🌾', 4.29, 'A3-B-L'],
  ['Granulated Sugar', 'Domino', '4 lb', '🧂', 3.99, 'A3-B-R'],
  ['Chocolate Chips', 'Nestlé Toll House', '12 oz', '🍫', 4.49, 'A3-C-L'],
  ['Ground Cinnamon', 'McCormick', '2.37 oz', '🫙', 5.29, 'A3-E-R'],
  ['Vanilla Extract', 'McCormick', '2 oz', '🫙', 9.99, 'A3-E-L'],
  ['Mac & Cheese Original', 'Kraft', '7.25 oz', '🧀', 1.49, 'A4-B-L'],
  ['Spaghetti', 'Barilla', '16 oz', '🍝', 1.99, 'A4-C-R'],
  ['Marinara Sauce', "Rao's", '24 oz', '🍅', 8.99, 'A4-D-R'],
  ['Jasmine Rice', 'Mahatma', '5 lb', '🍚', 7.49, 'A4-E-L'],
  ['Hamburger Helper', 'Betty Crocker', '6.4 oz', '🥘', 2.79, 'A4-B-R', 'A4-A-R'],
  ['Chicken Noodle Soup', "Campbell's", '10.75 oz', '🥫', 1.69, 'A5-B-L'],
  ['Black Beans', 'Goya', '15.5 oz', '🫘', 1.29, 'A5-C-R'],
  ['Diced Tomatoes', 'Hunt’s', '14.5 oz', '🥫', 1.49, 'A5-C-L'],
  ['Chunk Light Tuna', 'StarKist', '5 oz', '🐟', 1.39, 'A5-D-R'],
  ['Peanut Butter Creamy', 'Jif', '16 oz', '🥜', 3.99, 'A5-E-L'],
  ['Takis Fuego', 'Barcel', '9.9 oz', '🌶️', 4.79, 'A6-A-L', 'A6-A-L', 'RG-3'],
  ['Classic Potato Chips', "Lay's", '8 oz', '🥔', 4.99, 'A6-B-R'],
  ['Doritos Nacho Cheese', 'Frito-Lay', '9.25 oz', '🔺', 5.29, 'A6-B-L'],
  ['Cheez-It Original', 'Sunshine', '12.4 oz', '🧀', 4.99, 'A6-C-R'],
  ['Pretzel Twists', 'Rold Gold', '16 oz', '🥨', 3.99, 'A6-D-L'],
  ['Popcorn Butter', 'Orville', '6 ct', '🍿', 4.49, 'A6-E-R'],
  ['Oreo Original', 'Nabisco', '13.29 oz', '🍪', 4.99, 'A7-B-L'],
  ['Oreo Pumpkin Spice', 'Nabisco', '10.68 oz', '🎃', 5.49, 'A7-B-R', 'E6-F', undefined, true],
  ['Chips Ahoy!', 'Nabisco', '13 oz', '🍪', 4.49, 'A7-C-L'],
  ['Ritz Crackers', 'Nabisco', '13.7 oz', '🧇', 4.29, 'A7-C-R'],
  ['Goldfish Cheddar', 'Pepperidge Farm', '6.6 oz', '🐠', 2.99, 'A7-D-L'],
  ['Graham Crackers', 'Honey Maid', '14.4 oz', '🍘', 4.29, 'A7-E-R', 'A7-E-R', 'FE-SEAS'],
  ['Coca-Cola 12pk', 'Coca-Cola', '12 × 12 oz', '🥤', 7.99, 'A8-C-L'],
  ['Diet Coke 12pk', 'Coca-Cola', '12 × 12 oz', '🥤', 7.99, 'A8-C-R'],
  ['Sparkling Water Lime', 'LaCroix', '8 × 12 oz', '🫧', 5.49, 'A8-B-L'],
  ['Spring Water 24pk', 'Fernwood', '24 × 16.9 oz', '💧', 4.99, 'A8-A-R'],
  ['Gatorade Cool Blue', 'Gatorade', '28 oz', '🧃', 2.29, 'A8-D-L'],
  ['Red Bull', 'Red Bull', '8.4 oz', '⚡', 2.99, 'A8-E-R', 'RG-1', 'A8-E-R'],
  ['Sriracha', 'Huy Fong', '17 oz', '🌶️', 5.99, 'A9-B-L'],
  ['Soy Sauce', 'Kikkoman', '15 oz', '🥢', 3.99, 'A9-B-R'],
  ['Taco Shells', 'Old El Paso', '12 ct', '🌮', 2.79, 'A9-C-L'],
  ['Ketchup', 'Heinz', '32 oz', '🍅', 3.99, 'A9-D-R'],
  ['Yellow Mustard', "French's", '14 oz', '🌭', 1.99, 'A9-D-L', 'A9-E-L'],
  ['Mayonnaise', 'Hellmann’s', '30 oz', '🫙', 5.99, 'A9-E-R'],
  ['Paper Towels 6pk', 'Bounty', '6 rolls', '🧻', 12.99, 'A10-A-L'],
  ['Toilet Paper 12pk', 'Charmin', '12 rolls', '🧻', 13.99, 'A10-A-R'],
  ['Dish Soap', 'Dawn', '19.4 oz', '🧼', 3.49, 'A10-C-L'],
  ['Laundry Pods', 'Tide', '42 ct', '🫧', 13.49, 'A10-D-R'],
  ['Trash Bags', 'Glad', '40 ct', '🗑️', 9.99, 'A10-E-L'],
  ['Pepperoni Pizza', 'DiGiorno', '27.5 oz', '🍕', 7.99, 'A11-B-L'],
  ['Chicken Pot Pie', "Marie Callender's", '15 oz', '🥧', 4.49, 'A11-C-R'],
  ['Burritos Bean & Cheese', 'Amy’s', '6 oz', '🌯', 3.29, 'A11-D-L'],
  ['Frozen Waffles', 'Eggo', '10 ct', '🧇', 3.99, 'A11-E-R'],
  ['Vanilla Ice Cream', "Tillamook", '48 oz', '🍨', 6.99, 'A12-B-L'],
  ['Half Baked', "Ben & Jerry's", '16 oz', '🍦', 5.99, 'A12-B-R'],
  ['Frozen Peas', 'Birds Eye', '10.8 oz', '🟢', 2.49, 'A12-D-L'],
  ['Fries Crinkle Cut', 'Ore-Ida', '32 oz', '🍟', 4.99, 'A12-E-R'],
  ['Whole Milk Gallon', 'Fernwood Dairy', '1 gal', '🥛', 4.29, 'DY-MILK'],
  ['Oat Milk', 'Oatly', '64 oz', '🥛', 5.49, 'DY-MILK'],
  ['Large Eggs 12ct', 'Vital Farms', '12 ct', '🥚', 6.99, 'DY-EGG'],
  ['Greek Yogurt Plain', 'Fage', '32 oz', '🥣', 6.49, 'DY-YOG'],
  ['Salted Butter', 'Kerrygold', '8 oz', '🧈', 4.99, 'DY-BUT'],
  ['Sharp Cheddar', 'Tillamook', '8 oz', '🧀', 4.79, 'DY-BUT'],
  ['Orange Juice', 'Tropicana', '52 oz', '🍊', 5.29, 'DY-JUI'],
  ['Honeycrisp Apples', 'Produce', '3 lb bag', '🍎', 6.99, 'PR-APL'],
  ['Navel Oranges', 'Produce', '4 lb bag', '🍊', 5.99, 'PR-CIT'],
  ['Bananas', 'Produce', 'per lb', '🍌', 0.59, 'PR-BAN'],
  ['Strawberries', 'Driscoll’s', '1 lb', '🍓', 4.99, 'PR-BER'],
  ['Baby Spinach', 'Organic Girl', '5 oz', '🥬', 4.49, 'PR-WET'],
  ['Cilantro', 'Produce', 'bunch', '🌿', 0.99, 'PR-HERB'],
  ['Russet Potatoes', 'Produce', '5 lb bag', '🥔', 4.49, 'PR-POT'],
  ['Sourdough Loaf', 'Fernwood Bakery', '24 oz', '🍞', 5.99, 'BK-BREAD'],
  ['Blueberry Muffins', 'Fernwood Bakery', '4 ct', '🧁', 5.49, 'BK-CASE'],
  ['Ground Beef 80/20', 'Meat', '1 lb', '🥩', 5.99, 'MT-BEEF'],
  ['Chicken Breast', 'Meat', '1.5 lb', '🍗', 8.99, 'MT-POUL'],
  ['Bacon Thick Cut', 'Wright', '24 oz', '🥓', 10.99, 'MT-PORK'],
  ['Turkey Sandwich', 'Deli', 'each', '🥪', 6.99, 'DL-GRAB'],
  ['Brie Wheel', 'Président', '8 oz', '🧀', 7.99, 'DL-CHS'],
  ['Hummus Classic', 'Sabra', '10 oz', '🫘', 4.49, 'DL-GRAB', 'DY-BUT'],
  ['Gum Spearmint', 'Extra', '15 ct', '🟩', 1.79, 'RG-2'],
  ['Snickers', 'Mars', '1.86 oz', '🍫', 1.69, 'RG-4'],
  ['Halloween Fun Size Mix', 'Mars', '40 ct', '🎃', 12.99, 'FE-SEAS', 'E9-F', 'FE-SEAS', true],
  ['Sunflowers Bouquet', 'Floral', 'bunch', '🌻', 9.99, 'FE-FLOR'],
  ['Pumpkin Pie Filling', 'Libby’s', '15 oz', '🥧', 3.29, 'A3-D-R', 'E3-F', undefined, true],
  ['Apple Cider', 'Martinelli’s', '50.7 oz', '🍎', 5.99, 'A8-B-R', 'E8-F', 'A8-B-R', true],
];

const DEMO_PRODUCTS: Product[] = ROWS.map((r, i) => {
  const [name, brand, size, emoji, price, plan, truth, also, drifty] = r;
  const base = `0${(41200 + i * 37).toString().padStart(5, '0')}${(10000 + i * 131).toString().slice(-5)}`;
  return {
    id: `p${i.toString().padStart(3, '0')}`,
    upc: upcCheck(base.slice(0, 11)),
    name,
    brand,
    size,
    emoji,
    price,
    plan,
    truth: truth ?? plan,
    also,
    drifty,
  };
});

// ---------------------------------------------------------------------------
// The live catalog. In a real store it starts empty and grows as you scan.

export const CATALOG_KEY = 'storeos.catalog';

function loadCatalog(): Product[] {
  try {
    const raw = localStorage.getItem(CATALOG_KEY);
    return raw ? (JSON.parse(raw) as Product[]) : [];
  } catch {
    return [];
  }
}

export const PRODUCTS: Product[] = IS_REAL ? loadCatalog() : DEMO_PRODUCTS;
export const PRODUCT: Record<string, Product> = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));
export const BY_UPC: Record<string, Product> = Object.fromEntries(PRODUCTS.map((p) => [p.upc, p]));

function saveCatalog() {
  if (!IS_REAL) return;
  try {
    localStorage.setItem(CATALOG_KEY, JSON.stringify(PRODUCTS));
  } catch {
    /* storage full */
  }
}

export const normUpc = (code: string) => {
  const c = code.replace(/\D/g, '');
  return c.length === 13 && c.startsWith('0') ? c.slice(1) : c;
};

export function addProduct(p: Omit<Product, 'id' | 'truth'> & { truth?: string }): Product {
  const upc = normUpc(p.upc);
  const prod: Product = { ...p, upc, id: `u${upc || Date.now().toString(36)}`, truth: p.truth ?? p.plan };
  PRODUCTS.push(prod);
  PRODUCT[prod.id] = prod;
  BY_UPC[prod.upc] = prod;
  saveCatalog();
  return prod;
}

export function updateProduct(id: string, patch: Partial<Pick<Product, 'name' | 'brand' | 'size' | 'emoji'>>) {
  const p = PRODUCT[id];
  if (!p) return;
  Object.assign(p, patch);
  saveCatalog();
}

export function removeProduct(id: string) {
  const i = PRODUCTS.findIndex((p) => p.id === id);
  if (i < 0) return;
  const [p] = PRODUCTS.splice(i, 1);
  delete PRODUCT[id];
  delete BY_UPC[p.upc];
  saveCatalog();
}

export function replaceCatalog(list: Product[]) {
  PRODUCTS.splice(0, PRODUCTS.length, ...list);
  for (const k of Object.keys(PRODUCT)) delete PRODUCT[k];
  for (const k of Object.keys(BY_UPC)) delete BY_UPC[k];
  for (const p of list) {
    PRODUCT[p.id] = p;
    BY_UPC[p.upc] = p;
  }
  saveCatalog();
}

export function lookupUpc(code: string): Product | undefined {
  const c = normUpc(code);
  return BY_UPC[c] ?? BY_UPC[c.padStart(12, '0')] ?? (c.length === 13 ? BY_UPC[c.slice(1)] : undefined);
}

export function searchProducts(q: string, limit = 8): Product[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  if (/^\d{6,}$/.test(s)) {
    const hit = lookupUpc(s);
    if (hit) return [hit];
    return PRODUCTS.filter((p) => p.upc.includes(s)).slice(0, limit);
  }
  const words = s.split(/\s+/);
  return PRODUCTS.map((p) => {
    const hay = `${p.name} ${p.brand}`.toLowerCase();
    let score = 0;
    for (const w of words) {
      if (hay.includes(w)) score += hay.startsWith(w) || hay.includes(` ${w}`) ? 2 : 1;
      else score -= 3;
    }
    return { p, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.p);
}

// The go-back cart shown in demo mode: a believable mix of aisles, cold items and
// a couple of products whose database location is out of date.
export const DEMO_CART = [
  'Mac & Cheese Original',
  'Coca-Cola 12pk',
  'Takis Fuego',
  'Oreo Pumpkin Spice',
  'Vanilla Ice Cream',
  'Greek Yogurt Plain',
  'Baby Spinach',
  'Chicken Noodle Soup',
  'Paper Towels 6pk',
  'Sriracha',
  'Frozen Waffles',
  'Honey Nut Cheerios',
  'Chocolate Chips',
  'Hamburger Helper',
  'Red Bull',
].map((n) => DEMO_PRODUCTS.find((p) => p.name === n)!.id);

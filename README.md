# StoreOS — a live spatial operating system for a physical store

Corporate inventory systems describe what a store *should* look like. Workers live in what it *actually* looks like.
StoreOS keeps a continuously improving **Reality Layer**: every scan, put-away, “not here”, and camera sweep is an
observation, and beliefs about where things are decay over time and snap back wherever someone works.
**Using the app maintains the database.**

Demo store: *Fernwood Market #214*, a fictional 260 × 170 ft grocery store with 90 products, two weeks of simulated crew history, pickup orders, price-tag flags, shelf outs and a parking lot.

## Use it in your own store (Android)
**Open:** https://mosrvs2025.github.io/storeOSant/ in **Chrome on Android**. Then use ⋮ → **Add to Home screen**, and it runs full-screen and works offline.

1. **Set up my store**: name it, set how many numbered aisles you have, and optionally name them. Tap ❄ on freezer aisles.
2. **Map a Shelf**: stand at a section, tap it (aisle → section A–E → side ◀/▶), then scan everything there. **Next section →** moves you along the aisle.
   Unknown barcodes are added right away; names are looked up on Open Food Facts when you have signal, or you can rename them with ✎.
3. **Go-Backs**: scan the cart. Known items are routed automatically. For a new item, you name it and tap where it lives, once.
   At each stop, **✓ Put away** confirms the location and **📍 Not here?** corrects it. Every scan makes the map more accurate.
4. **Settings ⚙ → Export** now and then. Your map lives only on the phone.

**Scanning:** the phone camera (Chrome on Android has built-in barcode reading), or any Bluetooth barcode scanner in **HID / keyboard mode**.
Pair it in Android Bluetooth settings, keep the default "Enter" suffix, and just pull the trigger while StoreOS is open. Nothing needs to be selected.
Most $25–60 scanners (Tera, Eyoyo, NetumScan, Inateck) work this way. Get a 1D/2D one with Bluetooth.

**Layout:** StoreOS draws a standard grocery layout: produce/bakery on the left, meat & deli along the back, dairy on the right, registers at the front, and your aisles numbered left to right.
Routing only needs the order to be roughly right. It can't draw custom floor plans yet.

## Try the demo (≈2 minutes)
1. **Go-Backs** → tap items in the cart (or **⚡ Scan whole cart**, the camera, or type/say a UPC) → **Start Route**.
2. Follow turn-by-turn navigation. Cold and frozen items get routed first; the banner shows how many feet you save compared with walking in scan order.
3. At **Oreo Pumpkin Spice**, tap **📍 Not here?** and say or type *“it's actually on the endcap facing aisle six”*, or tap the map. You can attach a photo.
4. Watch the **Reality Layer update**. Open it, replay two weeks in the **time machine**, and open the product to see its evidence.
5. **Ask StoreOS**: *“I’ve got ten minutes. What should I do?”* It plans a route from live work across carts, tags, verification and pickups.
6. **Lens**: an AR-style HUD looking down an aisle. **Sweep** the aisle and the camera works as a sensor, confirming dozens of items at once and catching ones that moved. The shelf recognition is simulated from the demo's ground truth.

Also included: **Store Pulse** (live signals + area health), **Find Item** (with secondary locations and how recently each was seen), **Pick Order** (when an item isn't found, it adds a detour to the next-best location), **Stock** (starts in backstock, then goes to the outs), and **Walk Store / Truth Walk** (visits the spots where one look adds the most confidence per foot walked).

## Architecture
- `src/model/layout.ts`: store geometry, fixtures and ~190 named locations (aisle sections, endcaps, departments).
- `src/model/routing.ts`: walkable 2-ft grid, Dijkstra paths, and a TSP (nearest-neighbour + 2-opt + or-opt) with cold-chain urgency.
- `src/model/reality.ts`: observations → time-decayed beliefs, confidence, secondary homes, volatility; seeded history.
- `src/model/state.ts`: app state (localStorage), runs and stops, corrections, aisle sweeps.
- `src/model/copilot.ts`: an on-device planner that fills a time budget using value/time insertion.
- `src/model/parse.ts`: spoken locations and time budgets.
- `src/ui/*`: React screens. Everything runs offline, with no backend.

## Develop
```
npm install
npm run dev        # http://localhost:5173
npm test           # model unit tests
npm run build && npm run e2e        # demo store workflow in Chromium → e2e-shots/
node scripts/e2e-real.mjs           # real-store setup, Bluetooth-scanner mapping, go-backs
```
Pushing to this branch deploys to GitHub Pages (`.github/workflows/deploy.yml`).

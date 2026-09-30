# StoreOS — a live spatial operating system for a physical store

Corporate inventory systems describe what a store *should* look like. Workers live in what it *actually* looks like.
StoreOS keeps a continuously improving **Reality Layer**: every scan, put-away, “not here”, and camera sweep is an
observation, and beliefs about where things are decay over time and snap back wherever someone works.
**Using the app maintains the database.**

Demo store: *Fernwood Market #214*, a fictional 260 × 170 ft grocery store with 90 products, two weeks of simulated crew history, pickup orders, price-tag flags, shelf outs and a parking lot.

## Use it in your own store (Android)

**Open:** https://storeosant.vercel.app/ in **Chrome on Android**. Then use ⋮ → **Add to Home screen**, and it runs full-screen and works offline.

1. **Set up your store**, either way:
   - **📸 Snap my store:** walk along the registers photographing each hanging aisle sign. StoreOS reads them with Claude and drafts the layout: aisle count, names and freezer aisles. Review the draft before saving. You can add or update sign photos later from ⚙ Settings.
   - **⌨️ Type it in:** set the aisle count, optionally name them, and tap ❄ on freezer aisles. This works offline.
2. **Walk an Aisle** (how anyone teaches it, with no need to know the layout): read the hanging sign and tap the aisle number.
   Start at the front and scan every **shelf tag** on your left down to the back, then turn around and scan the other side back to the front.
   The order of your scans places each item in a section (A = front … E = back). About 3 minutes an aisle.
   Walking an aisle number the store doesn't have yet adds it. Names come from Open Food Facts when you have signal; rename leftovers in ⚙.
   **Map a Spot** handles one-off places (endcaps, coolers, displays): tap the spot, then scan what's there.
   **Smart guesses:** a new item nobody has mapped gets a predicted spot, e.g. "Probably Aisle 6 · 41% — similar to Doritos Nacho Cheese".
   The guess uses name, brand and category similarity to what's already mapped. **Use the guess** routes it there, and the put-away confirms or corrects it.
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
3. At **Oreo Pumpkin Spice**, tap **📍 Not here?** and say or type *"it's actually on the endcap facing aisle six"*, or tap the map. You can attach a photo.
4. Watch the **Reality Layer update**. Open it, replay two weeks in the **time machine**, and open the product to see its evidence.
5. **Ask StoreOS**: *"I’ve got ten minutes. What should I do?"* It plans a route from live work across carts, tags, verification and pickups.
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

Node.js 22+ and npm:

```sh
npm ci
npm run dev        # http://localhost:5173
npm test           # unit tests
npm run build      # production build to dist/
```

Additional browser workflows (Chromium / Playwright dependencies may need to be installed in your environment):

```sh
npm run e2e                    # end-to-end demo-store workflow (scripts/e2e.mjs)
node scripts/e2e-snap.mjs      # photo setup flow with the Claude API mocked
node scripts/e2e-real.mjs      # real-store setup, Bluetooth-scanner mapping, and go-backs
```

Hosted on Vercel. Import this repository with the Vite preset; `vercel.json` configures the app. `api/read-signs.ts` is a Vercel Function that reads aisle-sign photos with Claude and requires the server-side `ANTHROPIC_API_KEY` environment variable. Without the key, photo setup explains the error and manual layout entry remains available. GitHub Actions runs unit tests, checks the API TypeScript, and builds on pushes and pull requests; it does not deploy the site.


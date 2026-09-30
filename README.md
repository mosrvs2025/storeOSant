# StoreOS — a live spatial operating system for a physical store

Corporate inventory systems describe what a store *should* look like. Workers live in what it *actually* looks like.
StoreOS keeps a continuously improving **Reality Layer**: every scan, put-away, “not here”, and camera sweep is an
observation, and beliefs about where things are decay over time and snap back wherever someone works.
**Using the app maintains the database.**

Demo store: *Fernwood Market #214*, a fictional 260 × 170 ft grocery store with 90 products, two weeks of simulated crew history, pickup orders, price-tag flags, shelf outs and a parking lot.

## Try it (≈2 minutes)
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
npm run build && npm run e2e   # drives the full workflow in Chromium, screenshots → e2e-shots/
```
Reset the demo from the desktop side panel, or with Shift+Alt+R.

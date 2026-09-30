import { useMemo, useState } from 'react';
import { CORRALS, SLOT, STORE } from '../model/layout';
import { PRODUCT } from '../model/products';
import { pulse, type Signal } from '../model/pulse';
import { cartsIn, getState, mkStop, startPlan, startStock, startVerify, useKnowledge, useStore } from '../model/state';
import { StoreMap, type Pin } from './StoreMap';
import { MicIcon, clock, toast, useNow } from './common';
import { IS_REAL } from '../model/config';
import { PRODUCTS } from '../model/products';
import { sfx } from './feedback';
import type { Nav } from './App';

const DEMO_VERBS = [
  { id: 'scan', label: 'Go-Backs', icon: '↩️', hint: 'Scan a cart, get a route' },
  { id: 'find', label: 'Find Item', icon: '🔎', hint: 'Where is it, really?' },
  { id: 'orders', label: 'Pick Order', icon: '🧺', hint: 'Pickup orders' },
  { id: 'stock', label: 'Stock', icon: '📦', hint: 'Fill shelf outs' },
  { id: 'walk', label: 'Walk Store', icon: '👣', hint: 'Truth Walk' },
] as const;
const REAL_VERBS = [
  { id: 'scan', label: 'Go-Backs', icon: '↩️', hint: 'Scan a cart, get a route' },
  { id: 'aisle', label: 'Walk an Aisle', icon: '🏷️', hint: 'Scan shelf tags, learn it' },
  { id: 'find', label: 'Find Item', icon: '🔎', hint: 'Where is it, really?' },
  { id: 'map', label: 'Map a Spot', icon: '🗺️', hint: 'Endcaps, coolers, displays' },
  { id: 'walk', label: 'Walk Store', icon: '👣', hint: 'Re-check shaky spots' },
] as const;
const VERBS = IS_REAL ? REAL_VERBS : DEMO_VERBS;

export function Home({ go }: { go: Nav }) {
  const now = useNow();
  const s = useStore((x) => x);
  const k = useKnowledge();
  const signals = useMemo(() => pulse(s, now), [s, now]);
  const [showAll, setShowAll] = useState(false);
  const heat = useMemo(() => {
    const h: Record<string, number[]> = {};
    for (const x of Object.values(k)) (h[x.home] ??= []).push(x.confidence);
    return Object.fromEntries(Object.entries(h).map(([slot, a]) => [slot, a.reduce((p, c) => p + c, 0) / a.length]));
  }, [k]);
  const counts = Object.fromEntries(CORRALS.map((c) => [c.id, cartsIn(c.id, s, now)]));

  const pins: Pin[] = [];
  for (const f of s.flags) if (!f.resolved) pins.push({ id: f.id, at: SLOT[f.slot].walk, tone: f.kind === 'price' ? 'violet' : 'amber', label: f.kind === 'price' ? '$' : '!' });
  s.cart.forEach((pid, i) => pins.push({ id: `c${i}`, at: SLOT[k[pid].home].walk, tone: 'amber', small: true }));
  for (const o of s.orders) if (!o.picked) o.pids.forEach((pid, i) => pins.push({ id: `${o.id}${i}`, at: SLOT[k[pid].home].walk, tone: 'blue', small: true }));

  const act = (sig: Signal) => {
    sfx.tap();
    switch (sig.action) {
      case 'carts': {
        const c = CORRALS.find((x) => x.id === sig.ref)!;
        const n = Math.min(12, cartsIn(c.id, getState()));
        startPlan([mkStop({ kind: 'carts', point: c.walk, pids: [], title: `${n} carts · ${c.label}`, ref: c.id })], `Carts · ${c.label}`, sig.sub ?? '');
        return go('nav');
      }
      case 'gobacks':
        return go('scan');
      case 'pick':
        return go('orders');
      case 'stock':
        startStock();
        return go('nav');
      case 'verify':
        startVerify();
        return go('nav');
      case 'flag': {
        const f = getState().flags.find((x) => x.id === sig.ref)!;
        startPlan(
          [mkStop({ kind: 'flag', slot: f.slot, point: SLOT[f.slot].walk, pids: f.pid ? [f.pid] : [], title: `Fix tag · ${f.pid ? PRODUCT[f.pid].name : SLOT[f.slot].label}`, ref: f.id })],
          'Price tag fix',
          f.text,
        );
        return go('nav');
      }
      case 'reality':
        return go('reality');
    }
  };

  const verb = (id: (typeof VERBS)[number]['id']) => {
    sfx.tap();
    if (id === 'walk' && IS_REAL && PRODUCTS.length === 0) return toast('Map a few shelves first — then StoreOS knows what to re-check.', 'amber');
    if (id === 'stock') {
      startStock();
      return go('nav');
    }
    if (id === 'walk') {
      startVerify();
      return go('nav');
    }
    go(id);
  };

  const top = showAll ? signals : signals.slice(0, 3);
  return (
    <div className="screen home">
      <header className="home-head">
        <div className="brand">
          <span className="logo" aria-hidden>
            <svg viewBox="0 0 64 64" width="22" height="22">
              <path d="M14 48 C 22 26, 38 40, 50 14" stroke="currentColor" strokeWidth="7" fill="none" strokeLinecap="round" />
              <circle cx="50" cy="14" r="7" fill="currentColor" />
            </svg>
          </span>
          <div>
            <b>StoreOS</b>
            <small>
              {STORE.name} {STORE.number}
            </small>
          </div>
        </div>
        <div className="head-right">
          <button className="pill live" onClick={() => go('pulse')}>
            <i className="dot" /> {clock(now)}
          </button>
          <button className="icon-btn" onClick={() => go('settings')} aria-label="Settings">
            ⚙
          </button>
        </div>
      </header>

      <div className="home-map">
        <StoreMap heat={heat} pins={pins} me={s.me} corralCounts={IS_REAL ? undefined : counts} onTap={() => go('reality')} />
        <button className="map-legend" onClick={() => go('reality')}>
          <span className="legend-bar" /> Reality Layer · location confidence
        </button>
        <button className="lens-fab" onClick={() => go('lens')} aria-label="Aisle Lens">
          <span>◉</span> Lens
        </button>
      </div>

      <section className="home-sheet">
        <button className="ask" onClick={() => go('copilot')}>
          <span className="spark">✦</span>
          <span className="ask-text">“I’ve got ten minutes. What should I do?”</span>
          <span className="mic-dot">
            <MicIcon />
          </span>
        </button>

        {IS_REAL && PRODUCTS.length < 25 && (
          <button className="teach-card" onClick={() => go('aisle')}>
            <b>{PRODUCTS.length === 0 ? '👋 Teach StoreOS your store' : `🗺️ ${PRODUCTS.length} products mapped — keep going`}</b>
            <small>Tap <b>Walk an Aisle</b>: say which aisle you’re in, then scan the shelf tags down one side and back up the other. About 3 minutes an aisle, and no need to know the layout. Unmapped items still get a smart guess.</small>
          </button>
        )}
        <h2 className="q">What are you doing?</h2>
        <div className={`verbs ${VERBS.length % 2 === 0 ? 'odd' : ''}`}>
          {VERBS.map((v) => (
            <button key={v.id} className={`verb ${v.id === 'scan' ? 'primary' : ''} ${v.id === (IS_REAL && PRODUCTS.length === 0 ? 'aisle' : 'scan') && s.intro ? 'beckon' : ''}`} onClick={() => verb(v.id)}>
              <span className="vi">{v.icon}</span>
              <b>{v.label}</b>
              <small>{v.hint}</small>
            </button>
          ))}
        </div>

        <div className="pulse-mini">
          <div className="pm-head">
            <h3>
              <i className="dot" /> Store Pulse <span>{clock(now)}</span>
            </h3>
            <button className="link" onClick={() => setShowAll((x) => !x)}>
              {showAll ? 'Less' : `All ${signals.length}`}
            </button>
          </div>
          {top.length === 0 && <p className="muted small quiet">All quiet. Signals show up here as you scan, map and correct things.</p>}
          {top.map((sig) => (
            <button key={sig.id} className={`signal t-${sig.tone}`} onClick={() => act(sig)} disabled={!sig.action}>
              <span className="si">{sig.icon}</span>
              <span className="st">
                <b>{sig.text}</b>
                {sig.sub && <small>{sig.sub}</small>}
              </span>
              {sig.action && <span className="chev">›</span>}
            </button>
          ))}
        </div>

        <div className="home-links">
          <button onClick={() => go('reality')}>
            <b>Reality Layer</b>
            <small>Time machine · what the store learned</small>
          </button>
          <button onClick={() => go('lens')}>
            <b>Aisle Lens</b>
            <small>Point your camera down an aisle</small>
          </button>
        </div>
      </section>
    </div>
  );
}

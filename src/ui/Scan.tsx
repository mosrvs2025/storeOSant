import { useEffect, useMemo, useState } from 'react';
import { IS_REAL } from '../model/config';
import { Camera, hasBarcodeDetector, useWedgeScanner } from './scanning';
import { LearnSheet } from './Learn';
import { FRONT_END, SLOT } from '../model/layout';
import { DEMO_CART, PRODUCT, lookupUpc, searchProducts, type Product } from '../model/products';
import { addToCart, clearCart, groupBySlot, handleSec, knowledge, planStops, removeFromCart, setState, startGoBacks, useKnowledge, useStore } from '../model/state';
import { WALK_FPS } from '../model/routing';
import { StoreMap, type Pin } from './StoreMap';
import { Conf, TopBar, VoiceInput, toast } from './common';
import { sfx } from './feedback';
import type { Nav } from './App';

export function Scan({ go }: { go: Nav }) {
  const cart = useStore((s) => s.cart);
  const k = useKnowledge();
  const [q, setQ] = useState('');
  const [cam, setCam] = useState(IS_REAL && hasBarcodeDetector());
  const [learning, setLearning] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [auto, setAuto] = useState(false);
  const pile = useMemo(() => DEMO_CART.filter((pid) => !cart.includes(pid)), [cart]);
  const hasCamera = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

  const scan = (p: Product) => {
    sfx.scan();
    addToCart(p.id);
    setState((s) => (s.intro ? { ...s, intro: false } : s));
    setFlash(p.id);
    setTimeout(() => setFlash((f) => (f === p.id ? null : f)), 700);
  };

  const onCode = (code: string) => {
    const p = lookupUpc(code);
    if (p) scan(p);
    else if (IS_REAL) {
      sfx.scan();
      setLearning(code);
    } else {
      sfx.error();
      toast(`UPC ${code} isn't in this store's catalog`, 'red');
    }
  };
  useWedgeScanner(onCode, !learning);

  // "Scan the whole cart" — rapid-fire demo
  useEffect(() => {
    if (!auto) return;
    if (!pile.length) {
      setAuto(false);
      return;
    }
    const t = setTimeout(() => scan(PRODUCT[pile[0]]), 230);
    return () => clearTimeout(t);
  }, [auto, pile]);

  const est = useMemo(() => {
    if (!cart.length) return null;
    const stops = groupBySlot(cart, knowledge(), 'putaway');
    const { feet } = planStops(stops, FRONT_END);
    const secs = feet / WALK_FPS + stops.reduce((a, s) => a + handleSec(s), 0);
    return { feet, mins: Math.max(1, Math.round(secs / 60)), stops: stops.length };
  }, [cart]);

  const pins: Pin[] = cart.map((pid, i) => {
    const kn = k[pid];
    return { id: `${pid}${i}`, at: SLOT[kn.home].walk, tone: kn.confidence < 0.6 ? 'amber' : 'mint', pulse: flash === pid };
  });
  const matches = q.trim() ? searchProducts(q, 5) : [];
  const recent = [...cart].map((pid, i) => ({ pid, i })).reverse();

  return (
    <div className="screen scan">
      <TopBar
        title="Go-Backs"
        sub={cart.length ? `${cart.length} in cart` : 'Scan everything in the cart'}
        onBack={() => go('home')}
        right={
          cart.length > 0 && (
            <button className="link" onClick={clearCart}>
              Clear
            </button>
          )
        }
      />

      <div className="scan-top">
        {cam ? (
          <Camera onCode={(c) => !learning && onCode(c)} onFail={(why) => (setCam(false), toast(why, 'amber'))} />
        ) : IS_REAL ? (
          <div className="wedge-hint">
            <b>🔫 Ready to scan</b>
            <small>Pull your Bluetooth scanner’s trigger{hasBarcodeDetector() ? ', turn on the camera,' : ''} or type the UPC below. New items: StoreOS asks where they live once, then remembers.</small>
          </div>
        ) : (
          <div className="pile">
            <div className="pile-head">
              <span>🛒 Cart from the service desk</span>
              {pile.length > 0 ? (
                <button className="chip-btn" onClick={() => setAuto(true)} disabled={auto}>
                  {auto ? 'Scanning…' : '⚡ Scan whole cart'}
                </button>
              ) : (
                <span className="muted">Cart empty</span>
              )}
            </div>
            <div className="pile-grid">
              {pile.length === 0 && <p className="muted small">Everything's scanned. Start the route ↓</p>}
              {pile.map((pid) => {
                const p = PRODUCT[pid];
                return (
                  <button key={pid} className="pile-item" onClick={() => scan(p)} aria-label={`Scan ${p.name}`}>
                    <span className="pe">{p.emoji}</span>
                    <span className="pn">{p.name}</span>
                    <span className="barcode" aria-hidden />
                  </button>
                );
              })}
            </div>
            <div className="laser" />
          </div>
        )}
        {hasCamera && (
          <button className="cam-toggle" onClick={() => setCam((c) => !c)}>
            {cam ? (IS_REAL ? 'Camera off' : '🛒 Demo cart') : '📷 Camera'}
          </button>
        )}
      </div>

      <div className="scan-input">
        <VoiceInput
          value={q}
          onChange={setQ}
          placeholder="Type or say a product or UPC"
          onSubmit={(v) => {
            const hit = lookupUpc(v) ?? searchProducts(v, 1)[0];
            if (hit) {
              scan(hit);
              setQ('');
            } else if (IS_REAL && /^\d{6,14}$/.test(v.trim())) {
              setLearning(v.trim());
              setQ('');
            } else {
              sfx.error();
              toast('No match in the catalog', 'red');
            }
          }}
        />
        {matches.length > 0 && (
          <div className="matches">
            {matches.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  scan(p);
                  setQ('');
                }}
              >
                {p.emoji} {p.name} <small>{p.brand}</small>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="scan-body">
        {cart.length > 0 && (
          <div className="scan-map">
            <StoreMap pins={pins} me={FRONT_END} dim />
          </div>
        )}
        <ul className="scanned">
          {recent.map(({ pid, i }) => {
            const p = PRODUCT[pid];
            const kn = k[pid];
            const s = SLOT[kn.home];
            return (
              <li key={`${pid}${i}`} className={flash === pid && i === cart.length - 1 ? 'new' : ''}>
                <span className="pe">{p.emoji}</span>
                <span className="pt">
                  <b>{p.name}</b>
                  <small>
                    {s.label} · {s.detail.split(' · ')[1] ?? s.detail}
                    {s.temp !== 'ambient' && <em className={`temp ${s.temp}`}>{s.temp === 'frozen' ? '❄ frozen' : '◆ cold'}</em>}
                    {kn.volatile && <em className="temp moving">moving</em>}
                  </small>
                </span>
                <Conf c={kn.confidence} />
                <button className="x" onClick={() => removeFromCart(i)} aria-label="Remove">
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className={`scan-cta ${est ? 'ready' : ''}`}>
        {est ? (
          <>
            <div>
              <b>
                {cart.length} item{cart.length === 1 ? '' : 's'} · {est.mins}-min route
              </b>
              <small>
                {est.stops} stops · {Math.round(est.feet)} ft
              </small>
            </div>
            <button
              className="btn primary"
              onClick={() => {
                sfx.confirm();
                startGoBacks();
                go('nav');
              }}
            >
              Start Route →
            </button>
          </>
        ) : (
          <div className="hint">
            <b>SCAN → toss → SCAN → toss</b>
            <small>Tap items in the cart (or use the camera). StoreOS figures out where each one really lives.</small>
          </div>
        )}
      </div>
      {learning && (
        <LearnSheet
          upc={learning}
          onClose={() => setLearning(null)}
          onLearned={(p) => {
            setLearning(null);
            scan(p);
          }}
        />
      )}
    </div>
  );
}

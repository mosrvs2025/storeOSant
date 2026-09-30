import { useEffect, useMemo, useRef, useState } from 'react';
import { AISLE_COUNT, AISLE_NAMES, SECTIONS, SLOT, aisleX } from '../model/layout';
import { PRODUCT } from '../model/products';
import { areaHealth, fmtAgo } from '../model/reality';
import { distance } from '../model/routing';
import { sweepAisle, useKnowledge, useStore, type SweepResult } from '../model/state';
import { Conf, clock } from './common';
import { ProductSheet } from './Reality';
import { sfx } from './feedback';
import type { Nav } from './App';

interface Chip {
  id: string;
  side: 'L' | 'R' | 'C';
  depth: number; // 0 = near (section A / front endcap), 1 = far (section E)
  tone: 'amber' | 'violet' | 'blue' | 'red' | 'mint';
  head: string;
  sub?: string;
  pid?: string;
}

// Where a point on a shelf lands in a one-point-perspective view down the aisle.
function project(side: Chip['side'], depth: number) {
  const d = 0.12 + depth * 0.78;
  const persp = 1 / (1 + d * 2.2);
  const x = side === 'C' ? 50 : side === 'L' ? 50 - 46 * persp : 50 + 46 * persp;
  const y = 50 + 34 * persp - 12 * (1 - persp);
  return { x, y, s: 0.55 + persp * 0.55 };
}

export function Lens({ go }: { go: Nav }) {
  const s = useStore((x) => x);
  const k = useKnowledge();
  const nearest = useMemo(() => {
    let best = 6;
    let bd = Infinity;
    for (let n = 1; n <= AISLE_COUNT; n++) {
      const d = Math.abs(aisleX(n) - s.me.x);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    return best;
  }, [s.me.x]);
  const [aisle, setAisle] = useState(nearest);
  const [cam, setCam] = useState<MediaStream | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [sweeping, setSweeping] = useState(false);
  const [result, setResult] = useState<SweepResult | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (video.current && cam) {
      video.current.srcObject = cam;
      void video.current.play().catch(() => {});
    }
    return () => cam?.getTracks().forEach((t) => t.stop());
  }, [cam]);

  const health = areaHealth(s.obs, Date.now()).find((h) => h.area === `Aisle ${aisle}`);

  const chips: Chip[] = useMemo(() => {
    const out: Chip[] = [];
    const depthOf = (slot: string) => {
      const sl = SLOT[slot];
      if (sl.zone === 'endcap') return 0;
      return (SECTIONS.indexOf(slot.split('-')[1] as (typeof SECTIONS)[number]) + 0.5) / SECTIONS.length;
    };
    const sideOf = (slot: string): Chip['side'] => (SLOT[slot].zone === 'endcap' ? (slot === `E${aisle - 1}-F` ? 'L' : 'R') : (slot.endsWith('-L') ? 'L' : 'R'));
    const here = (slot: string) => {
      const sl = SLOT[slot];
      return (sl.zone === 'aisle' && sl.aisle === aisle) || slot === `E${aisle}-F` || slot === `E${aisle - 1}-F`;
    };
    const gob = new Map<string, string[]>();
    s.cart.forEach((pid) => {
      const h = k[pid].home;
      if (here(h)) gob.set(h, [...(gob.get(h) ?? []), pid]);
    });
    for (const [slot, pids] of gob)
      out.push({ id: `g${slot}`, side: sideOf(slot), depth: depthOf(slot), tone: 'amber', head: `↩ ${pids.length} GO-BACK${pids.length > 1 ? 'S' : ''}`, sub: PRODUCT[pids[0]].name, pid: pids[0] });
    for (const f of s.flags) {
      if (f.resolved || !here(f.slot)) continue;
      out.push({ id: f.id, side: sideOf(f.slot), depth: depthOf(f.slot), tone: f.kind === 'price' ? 'violet' : 'red', head: f.kind === 'price' ? '⚠ PRICE TAG MISMATCH' : '📦 SHELF OUT', sub: f.pid ? PRODUCT[f.pid].name : undefined, pid: f.pid });
    }
    for (const o of s.orders) {
      if (o.picked) continue;
      for (const pid of o.pids) {
        const h = k[pid].home;
        if (!here(h)) continue;
        const ft = Math.round(distance(s.me, SLOT[h].walk));
        out.push({ id: `${o.id}${pid}`, side: sideOf(h), depth: depthOf(h), tone: 'blue', head: `↑ PICK ITEM — ${ft} ft`, sub: PRODUCT[pid].name, pid });
      }
    }
    const unsure = Object.values(k).filter((x) => here(x.home) && x.confidence < 0.62);
    for (const u of unsure.slice(0, 3))
      out.push({ id: `u${u.pid}`, side: sideOf(u.home), depth: depthOf(u.home), tone: 'red', head: `? ${Math.round(u.confidence * 100)}% SURE`, sub: PRODUCT[u.pid].name, pid: u.pid });
    // de-overlap: nudge chips at the same side/depth
    const seen = new Map<string, number>();
    for (const c of out) {
      const key = `${c.side}${c.depth.toFixed(2)}`;
      const n = seen.get(key) ?? 0;
      seen.set(key, n + 1);
      c.depth = Math.min(1, c.depth + n * 0.16);
    }
    return out;
  }, [s.cart, s.flags, s.orders, k, aisle, s.me]);

  const sweep = () => {
    setSweeping(true);
    setResult(null);
    sfx.scan();
    setTimeout(() => {
      const r = sweepAisle(aisle);
      setSweeping(false);
      setResult(r);
      if (r.found.length) sfx.learn();
      else sfx.confirm();
    }, 2200);
  };

  const enableCam = async () => {
    try {
      setCam(await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }));
    } catch {
      setCam(null);
    }
  };

  return (
    <div className="screen lens">
      <div className="lens-view">
        {cam ? <video ref={video} playsInline muted /> : <FakeAisle aisle={aisle} />}
        <div className={`lens-sweep ${sweeping ? 'on' : ''}`} />
        {chips.map((c) => {
          const p = project(c.side, c.depth);
          return (
            <button
              key={c.id}
              className={`hud-chip t-${c.tone} side-${c.side}`}
              style={{ left: `${p.x}%`, top: `${p.y}%`, transform: `translate(${c.side === 'L' ? '0' : c.side === 'R' ? '-100%' : '-50%'}, -50%) scale(${p.s})` }}
              onClick={() => c.pid && setOpen(c.pid)}
            >
              <b>{c.head}</b>
              {c.sub && <small>{c.sub}</small>}
            </button>
          );
        })}
        <div className="hud-top">
          <button className="icon-btn ghost" onClick={() => go('home')} aria-label="Close lens">
            ✕
          </button>
          <div className="hud-title">
            <b>AISLE {aisle}</b>
            <small>{AISLE_NAMES[aisle]}</small>
          </div>
          <div className="hud-verified">
            {health?.lastVerified && Date.now() - health.lastVerified < 3 * 3600e3 ? <span className="ok">✓ AISLE VERIFIED {fmtAgo(health.lastVerified, Date.now()).toUpperCase()}</span> : <span className="stale">⚠ LAST VERIFIED {fmtAgo(health?.lastVerified, Date.now()).toUpperCase()}</span>}
            {health && <Conf c={health.confidence} />}
          </div>
        </div>
        <div className="hud-nav">
          <button disabled={aisle <= 1} onClick={() => (setAisle((a) => a - 1), setResult(null))}>
            ‹ {aisle - 1 || ''}
          </button>
          <span>{clock(Date.now())}</span>
          <button disabled={aisle >= AISLE_COUNT} onClick={() => (setAisle((a) => a + 1), setResult(null))}>
            {aisle < AISLE_COUNT ? aisle + 1 : ''} ›
          </button>
        </div>
      </div>

      <div className="lens-panel">
        {result ? (
          <div className="sweep-result">
            <h3>📸 Aisle {result.aisle} swept</h3>
            <p>
              <b>{result.seen.length}</b> products confirmed on shelf
              {result.missing.length > 0 && (
                <>
                  {' '}
                  · <b>{result.missing.length}</b> not where expected
                </>
              )}
            </p>
            {result.found.map((f) => (
              <p key={f.pid} className="found">
                🔎 Found <b>{PRODUCT[f.pid].name}</b> on {SLOT[f.to].label} — the store thought {SLOT[f.from].label}. Learned.
              </p>
            ))}
            <button className="btn ghost wide" onClick={() => go('reality')}>
              See it in the Reality Layer
            </button>
          </div>
        ) : (
          <>
            <p className="lens-copy">
              Walk the aisle with the camera up. Every frame is an observation: StoreOS confirms what’s on the shelf, notices what moved, and the whole aisle’s confidence snaps back to fresh.
            </p>
            <div className="lens-actions">
              {!cam && !!navigator.mediaDevices && (
                <button className="btn ghost" onClick={enableCam}>
                  📷 Use camera
                </button>
              )}
              <button className="btn primary grow" onClick={sweep} disabled={sweeping}>
                {sweeping ? 'Reading shelves…' : `Sweep Aisle ${aisle}`}
              </button>
            </div>
            <small className="muted">Demo: shelf recognition is simulated from the fictional store’s ground truth.</small>
          </>
        )}
      </div>
      {open && <ProductSheet pid={open} onClose={() => setOpen(null)} go={go} />}
    </div>
  );
}

/** A stylised one-point-perspective aisle used when the camera is off. */
function FakeAisle({ aisle }: { aisle: number }) {
  const cold = aisle >= 11;
  const hue = cold ? 205 : (aisle * 37) % 360;
  const shelves = [0, 1, 2, 3, 4];
  return (
    <svg className="fake-aisle" viewBox="0 0 100 100" preserveAspectRatio="none">
      <defs>
        <linearGradient id="floor" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#2a3542" />
          <stop offset="1" stopColor="#11171e" />
        </linearGradient>
        <linearGradient id="ceil" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1c2530" />
          <stop offset="1" stopColor="#0b0f14" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill="#0b0f14" />
      <polygon points="0,0 100,0 58,40 42,40" fill="url(#ceil)" />
      <polygon points="0,100 100,100 58,56 42,56" fill="url(#floor)" />
      {[20, 40, 60, 80].map((x) => (
        <line key={x} x1={x} y1={0} x2={50 + (x - 50) * 0.16} y2={40} stroke="#e8f0ff" strokeOpacity={0.18} strokeWidth={0.6} />
      ))}
      {(['L', 'R'] as const).map((side) => (
        <g key={side}>
          <polygon points={side === 'L' ? '0,0 42,40 42,56 0,100' : '100,0 58,40 58,56 100,100'} fill={`hsl(${hue} 30% 16%)`} />
          {shelves.map((i) => {
            const t = (i + 1) / 6;
            const y0 = t * 100;
            const y1 = 40 + t * 16;
            return <line key={i} x1={side === 'L' ? 0 : 100} y1={y0} x2={side === 'L' ? 42 : 58} y2={y1} stroke={cold ? '#7fd4ff' : '#9aa7b6'} strokeOpacity={0.35} strokeWidth={0.5} />;
          })}
          {Array.from({ length: 34 }, (_, j) => {
            const d = j / 34;
            const persp = 1 / (1 + d * 2.6);
            const x = side === 'L' ? 42 - 42 * persp : 58 + 42 * persp;
            const row = j % 5;
            const t = (row + 0.5) / 6;
            const y = 48 + (t * 100 - 48) * persp;
            return <rect key={j} x={x - 1.4 * persp} y={y - 4 * persp} width={2.8 * persp} height={5 * persp} fill={`hsl(${(hue + j * 47) % 360} 55% 55%)`} opacity={0.55} />;
          })}
        </g>
      ))}
      <rect x="42" y="40" width="16" height="16" fill="#0e141b" stroke="#2b3644" strokeWidth={0.3} />
    </svg>
  );
}

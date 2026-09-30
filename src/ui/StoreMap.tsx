import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AISLE_COUNT, CORRALS, DELI_W, DOORS, FIXTURES, FRONT_END, MEAT_W, SLOT, SLOTS, STORE, aisleX, isFrozenAisle, type Pt, type Rect } from '../model/layout';

export const MAP_H = 206;
export const FULL: Rect = { x: -4, y: -4, w: STORE.w + 8, h: MAP_H + 6 };

export interface Pin {
  id: string;
  at: Pt;
  label?: string;
  tone?: 'mint' | 'amber' | 'red' | 'blue' | 'violet' | 'dim';
  pulse?: boolean;
  small?: boolean;
}

export interface MapProps {
  view?: Rect;
  heat?: Record<string, number>; // slot -> 0..1 confidence
  highlight?: { slot: string; tone?: Pin['tone'] }[];
  route?: Pt[];
  routeDone?: Pt[];
  pins?: Pin[];
  me?: Pt | null;
  heading?: number;
  corralCounts?: Record<string, number>;
  onTap?: (p: Pt) => void;
  children?: ReactNode;
  className?: string;
  dim?: boolean;
}

const TONE: Record<NonNullable<Pin['tone']>, string> = {
  mint: 'var(--mint)',
  amber: 'var(--amber)',
  red: 'var(--red)',
  blue: 'var(--blue)',
  violet: 'var(--violet)',
  dim: 'var(--muted)',
};

export const heatColor = (c: number) => {
  // red (unsure) → amber → mint (certain)
  const h = Math.max(0, Math.min(1, (c - 0.35) / 0.6));
  return `hsl(${Math.round(355 + h * 125) % 360} ${70 + h * 5}% ${52 + h * 4}%)`;
};

const StaticLayer = memo(function StaticLayer() {
  return (
    <g>
      <rect x={0} y={0} width={STORE.w} height={STORE.h} rx={3} className="m-floor" />
      {/* lot */}
      <rect x={0} y={STORE.h + 2} width={STORE.w} height={MAP_H - STORE.h - 2} rx={3} className="m-lot" />
      {Array.from({ length: 24 }, (_, i) => (
        <line key={i} x1={8 + i * 10.5} x2={8 + i * 10.5} y1={STORE.h + 20} y2={STORE.h + 30} className="m-stall" />
      ))}
      <rect x={DOORS.x} y={DOORS.y - 1} width={DOORS.w} height={4} className="m-door" />
      <text x={DOORS.x + DOORS.w / 2} y={STORE.h + 8} className="m-lbl m-lbl-xs" textAnchor="middle">
        ENTRANCE
      </text>
      {FIXTURES.map((f, i) => (
        <rect key={i} x={f.rect.x} y={f.rect.y} width={f.rect.w} height={f.rect.h} rx={f.kind === 'gondola' ? 1 : 1.6} className={`m-fx m-${f.kind}`} />
      ))}
      {Array.from({ length: AISLE_COUNT }, (_, i) => (
        <g key={i} transform={`translate(${aisleX(i + 1)} 118)`}>
          <circle r={3.6} className="m-aisle-dot" />
          <text y={1.35} className="m-aisle-num" textAnchor="middle">
            {i + 1}
          </text>
        </g>
      ))}
      <text x={27} y={5.4} className="m-lbl" textAnchor="middle">BAKERY</text>
      <text x={60 + MEAT_W / 2} y={5.4} className="m-lbl" textAnchor="middle">MEAT & SEAFOOD</text>
      <text x={60 + MEAT_W + DELI_W / 2} y={6.4} className="m-lbl" textAnchor="middle">DELI</text>
      <text x={STORE.w - 28} y={6.4} className="m-lbl m-lbl-dim" textAnchor="middle">BACKSTOCK</text>
      <text x={STORE.w - 5} y={66} className="m-lbl" textAnchor="middle" transform={`rotate(90 ${STORE.w - 5} 66)`}>DAIRY</text>
      <text x={24} y={118} className="m-lbl" textAnchor="middle">PRODUCE</text>
      <text x={26} y={137} className="m-lbl m-lbl-xs" textAnchor="middle">SEASONAL</text>
      <text x={FRONT_END.x} y={135.5} className="m-lbl m-lbl-xs" textAnchor="middle">SERVICE</text>
      <text x={STORE.w - 15} y={134} className="m-lbl m-lbl-xs" textAnchor="middle">FLORAL</text>
      <text x={(58 + FRONT_END.x) / 2} y={152} className="m-lbl m-lbl-dim" textAnchor="middle">FRONT END</text>
      {Array.from({ length: AISLE_COUNT }, (_, i) =>
        isFrozenAisle(i + 1) && !isFrozenAisle(i) ? (
          <text key={i} x={aisleX(i + 1)} y={22} className="m-lbl m-lbl-xs m-lbl-ice" textAnchor="middle">FROZEN</text>
        ) : null,
      )}
    </g>
  );
});

function useAnimatedView(target: Rect): Rect {
  const [v, setV] = useState(target);
  const cur = useRef(target);
  useEffect(() => {
    const from = cur.current;
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 650);
      const e = 1 - Math.pow(1 - k, 3);
      const n = {
        x: from.x + (target.x - from.x) * e,
        y: from.y + (target.y - from.y) * e,
        w: from.w + (target.w - from.w) * e,
        h: from.h + (target.h - from.h) * e,
      };
      cur.current = n;
      setV(n);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target.x, target.y, target.w, target.h]);
  return v;
}

const poly = (pts: Pt[]) => pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

export function StoreMap(props: MapProps) {
  const { view = FULL, heat, highlight, route, routeDone, pins, me, heading, corralCounts, onTap, children, className, dim } = props;
  const v = useAnimatedView(view);
  const svg = useRef<SVGSVGElement>(null);
  const heatRects = useMemo(() => {
    if (!heat) return null;
    return SLOTS.filter((s) => heat[s.id] !== undefined).map((s) => (
      <rect key={s.id} x={s.shelf.x} y={s.shelf.y} width={s.shelf.w} height={s.shelf.h} rx={0.8} fill={heatColor(heat[s.id])} className="m-heat" />
    ));
  }, [heat]);

  const tap = (e: React.PointerEvent) => {
    if (!onTap || !svg.current) return;
    const pt = svg.current.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const m = svg.current.getScreenCTM();
    if (!m) return;
    const p = pt.matrixTransform(m.inverse());
    onTap({ x: p.x, y: p.y });
  };

  return (
    <svg
      ref={svg}
      className={`store-map ${dim ? 'dim' : ''} ${className ?? ''}`}
      viewBox={`${v.x} ${v.y} ${v.w} ${v.h}`}
      preserveAspectRatio="xMidYMid meet"
      onPointerUp={tap}
      role="img"
      aria-label="Store map"
    >
      <defs>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id="meHalo">
          <stop offset="0" stopColor="var(--blue)" stopOpacity="0.45" />
          <stop offset="1" stopColor="var(--blue)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <StaticLayer />
      {heatRects}
      {corralCounts &&
        CORRALS.map((c) => {
          const n = corralCounts[c.id] ?? 0;
          return (
            <g key={c.id} transform={`translate(${c.walk.x} ${c.walk.y})`}>
              <rect x={-11} y={-4} width={22} height={8} rx={2} className={`m-corral ${n >= 10 ? 'hot' : ''}`} />
              <text y={1.5} className="m-lbl m-lbl-xs" textAnchor="middle">
                {c.id} · {n} 🛒
              </text>
            </g>
          );
        })}
      {highlight?.map((h) => {
        const s = SLOT[h.slot];
        if (!s) return null;
        return (
          <rect
            key={h.slot + (h.tone ?? '')}
            x={s.shelf.x - 0.8}
            y={s.shelf.y - 0.8}
            width={s.shelf.w + 1.6}
            height={s.shelf.h + 1.6}
            rx={1.4}
            className="m-hl"
            style={{ fill: TONE[h.tone ?? 'mint'], stroke: TONE[h.tone ?? 'mint'] }}
            filter="url(#glow)"
          />
        );
      })}
      {routeDone && routeDone.length > 1 && <polyline points={poly(routeDone)} className="m-route-done" />}
      {route && route.length > 1 && (
        <>
          <polyline points={poly(route)} className="m-route-casing" />
          <polyline points={poly(route)} className="m-route" />
          <polyline points={poly(route)} className="m-route-flow" />
        </>
      )}
      {pins?.map((p) => (
        <g key={p.id} transform={`translate(${p.at.x} ${p.at.y})`} className={`m-pin ${p.pulse ? 'pulse' : ''}`}>
          {p.pulse && <circle r={7} className="m-pin-ring" style={{ stroke: TONE[p.tone ?? 'mint'] }} />}
          <circle r={p.small ? 2.2 : 3.6} style={{ fill: TONE[p.tone ?? 'mint'] }} className="m-pin-dot" />
          {p.label && !p.small && (
            <text y={1.3} textAnchor="middle" className="m-pin-lbl">
              {p.label}
            </text>
          )}
        </g>
      ))}
      {me && (
        <g transform={`translate(${me.x} ${me.y})`} className="m-me">
          <circle r={10} fill="url(#meHalo)" />
          {heading !== undefined && <path d="M0 0 L-5 -12 A13 13 0 0 1 5 -12 Z" transform={`rotate(${heading})`} className="m-me-cone" />}
          <circle r={2.8} className="m-me-dot" />
        </g>
      )}
      {children}
    </svg>
  );
}

export function boundsOf(pts: Pt[], pad = 18, aspect = 1.25): Rect {
  if (!pts.length) return FULL;
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  let w = x1 - x0 + pad * 2;
  let h = y1 - y0 + pad * 2;
  w = Math.max(w, 70);
  h = Math.max(h, 56);
  if (w / h > aspect) h = w / aspect;
  else w = h * aspect;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

export { FRONT_END };

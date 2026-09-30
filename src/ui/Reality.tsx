import { useEffect, useMemo, useState } from 'react';
import { SLOT } from '../model/layout';
import { PRODUCT, PRODUCTS, searchProducts } from '../model/products';
import { allKnowledge, fmtAgo, type Knowledge, type Obs } from '../model/reality';
import { startFind, useStore } from '../model/state';
import { StoreMap, type Pin } from './StoreMap';
import { Conf, Sheet, TopBar, pct } from './common';
import type { Nav } from './App';

const DAY = 864e5;
const SPAN = 14 * DAY;

function heatOf(k: Record<string, Knowledge>) {
  const h: Record<string, number[]> = {};
  for (const x of Object.values(k)) (h[x.home] ??= []).push(x.confidence);
  return Object.fromEntries(Object.entries(h).map(([slot, a]) => [slot, a.reduce((p, c) => p + c, 0) / a.length]));
}

const KIND_LABEL: Record<Obs['kind'], string> = { plan: 'Planogram', confirm: 'Put away / confirmed', seen: 'Seen on shelf', correct: 'Corrected by a worker', missing: 'Reported not there' };

export function ProductSheet({ pid, onClose, go }: { pid: string; onClose: () => void; go: Nav }) {
  const obs = useStore((s) => s.obs);
  const p = PRODUCT[pid];
  const now = Date.now();
  const k = useMemo(() => allKnowledge(obs, now)[pid], [obs, pid]);
  const mine = useMemo(() => obs.filter((o) => o.pid === pid).sort((a, b) => b.t - a.t), [obs, pid]);
  const timeline = mine.filter((o) => o.kind !== 'plan' && now - o.t < SPAN);
  return (
    <Sheet title={`${p.emoji} ${p.name}`} onClose={onClose} className="prod-sheet">
      <p className="muted small">
        {p.brand} · {p.size} · ${p.price.toFixed(2)} · UPC {p.upc}
      </p>
      <div className="ps-map">
        <StoreMap highlight={k.beliefs.slice(0, 4).map((b, i) => ({ slot: b.slot, tone: i === 0 ? 'mint' : 'violet' }))} pins={k.beliefs.slice(0, 4).map((b, i) => ({ id: b.slot, at: SLOT[b.slot].walk, label: String(i + 1), tone: i === 0 ? 'mint' : 'violet' }))} />
      </div>
      <h3 className="h3">Where it lives</h3>
      <ul className="beliefs">
        {k.beliefs.map((b, i) => (
          <li key={b.slot}>
            <span className="bi">{i + 1}</span>
            <span className="bt">
              <b>{SLOT[b.slot].label}</b>
              <small>
                {i === 0 ? 'Home' : b.share >= 0.12 ? 'Secondary' : 'Weak evidence'}
                {b.slot === p.plan && ' · planogram'}
              </small>
            </span>
            {i === 0 ? <Conf c={k.confidence} /> : <span className="share">{pct(b.share)}</span>}
          </li>
        ))}
      </ul>
      {k.volatile && <p className="warn-box">⚠ Location changing frequently{k.lastSeen ? ` · last confirmed ${SLOT[k.lastSeen.slot].label}, ${fmtAgo(k.lastSeen.t, now)}` : ''}</p>}
      <h3 className="h3">Last 14 days of evidence</h3>
      <div className="timeline">
        {timeline.map((o) => (
          <i key={o.id} className={`tl ${o.kind}`} style={{ left: `${100 - ((now - o.t) / SPAN) * 100}%` }} title={`${KIND_LABEL[o.kind]} · ${SLOT[o.slot].label} · ${o.who}`} />
        ))}
        <span className="tl-a">14d</span>
        <span className="tl-b">now</span>
      </div>
      <ul className="obs-list">
        {mine.slice(0, 6).map((o) => (
          <li key={o.id} className={o.kind}>
            <b>{KIND_LABEL[o.kind]}</b> · {SLOT[o.slot].label}
            <small>
              {o.kind === 'plan' ? 'corporate' : o.who} · {fmtAgo(o.t, now)}
            </small>
            {o.photo && <img src={o.photo} alt="" />}
          </li>
        ))}
      </ul>
      <button
        className="btn primary wide"
        onClick={() => {
          startFind(pid);
          go('nav');
        }}
      >
        Take me there →
      </button>
    </Sheet>
  );
}

export function Reality({ go }: { go: Nav }) {
  const obs = useStore((s) => s.obs);
  const learns = useStore((s) => s.learns);
  const [now] = useState(Date.now());
  const [t, setT] = useState(now);
  const [playing, setPlaying] = useState(false);
  const [tab, setTab] = useState<'learned' | 'unsure' | 'moving'>(learns.length ? 'learned' : 'unsure');
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setT((x) => {
        const n = x + DAY / 4;
        if (n >= now) {
          setPlaying(false);
          return now;
        }
        return n;
      });
    }, 120);
    return () => clearInterval(id);
  }, [playing, now]);

  const k = useMemo(() => allKnowledge(obs, t), [obs, t]);
  const heat = useMemo(() => heatOf(k), [k]);
  const overall = Object.values(k).reduce((a, x) => a + x.confidence, 0) / PRODUCTS.length;
  const recent = useMemo(() => obs.filter((o) => o.kind !== 'plan' && o.t <= t && t - o.t < 6 * 3600e3), [obs, t]);
  const pins: Pin[] = recent.slice(-40).map((o) => ({ id: o.id, at: SLOT[o.slot].walk, small: true, tone: o.kind === 'correct' ? 'violet' : o.kind === 'missing' ? 'red' : 'mint' }));
  const total = obs.filter((o) => o.t <= t && o.kind !== 'plan').length;

  const kNow = useMemo(() => allKnowledge(obs, now), [obs, now]);
  const unsure = useMemo(() => Object.values(kNow).sort((a, b) => a.confidence - b.confidence).slice(0, 12), [kNow]);
  const moving = useMemo(() => Object.values(kNow).filter((x) => x.volatile), [kNow]);
  const found = q.trim() ? searchProducts(q, 6) : [];

  const when =
    now - t < 60e3
      ? 'Live · now'
      : new Date(t).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }) + ` · ${fmtAgo(t, now).replace(' ago', '')} ago`;

  return (
    <div className="screen reality">
      <TopBar title="Reality Layer" sub="Where things actually are — learned from everyday work" onBack={() => go('home')} />
      <div className="rl-map">
        <StoreMap heat={heat} pins={pins} />
        <div className="rl-overlay">
          <b>{when}</b>
          <span>
            Store confidence <Conf c={overall} />
          </span>
          <small>{total} observations so far</small>
        </div>
      </div>
      <div className="time-machine">
        <button className="play" onClick={() => (t >= now - 60e3 ? (setT(now - SPAN), setPlaying(true)) : setPlaying((p) => !p))} aria-label="Replay">
          {playing ? '❚❚' : '▶'}
        </button>
        <input type="range" min={now - SPAN} max={now} step={3600e3} value={t} onChange={(e) => (setPlaying(false), setT(+e.target.value))} aria-label="Time machine" />
        <button className="chip-btn" onClick={() => (setPlaying(false), setT(now))}>
          Now
        </button>
      </div>
      <p className="tm-caption">⏪ Replay two weeks: watch confidence decay where nobody looks and snap back wherever someone works.</p>

      <div className="rl-search">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Look up any product…" />
        {found.map((p) => (
          <button key={p.id} className="row-btn" onClick={() => setOpen(p.id)}>
            {p.emoji} {p.name} <Conf c={kNow[p.id].confidence} />
          </button>
        ))}
      </div>

      <div className="tabs">
        <button className={tab === 'learned' ? 'on' : ''} onClick={() => setTab('learned')}>
          Learned {learns.length > 0 && <em>{learns.length}</em>}
        </button>
        <button className={tab === 'unsure' ? 'on' : ''} onClick={() => setTab('unsure')}>
          Least certain
        </button>
        <button className={tab === 'moving' ? 'on' : ''} onClick={() => setTab('moving')}>
          On the move <em>{moving.length}</em>
        </button>
      </div>
      <ul className="rl-list">
        {tab === 'learned' &&
          (learns.length ? (
            learns.map((l) => (
              <li key={l.id} onClick={() => setOpen(l.pid)}>
                <span className="pe">{PRODUCT[l.pid].emoji}</span>
                <span className="pt">
                  <b>{PRODUCT[l.pid].name}</b>
                  <small>
                    {SLOT[l.from].label} → {SLOT[l.to].label} · {fmtAgo(l.t, Date.now())} via {l.via}
                  </small>
                </span>
                <span className="delta">
                  {pct(l.before)}→{pct(l.after)}
                </span>
              </li>
            ))
          ) : (
            <li className="empty">Nothing yet from you. Run Go-Backs and tap “Not here?” when something’s moved — corrections show up here instantly.</li>
          ))}
        {tab === 'unsure' &&
          unsure.map((x) => (
            <li key={x.pid} onClick={() => setOpen(x.pid)}>
              <span className="pe">{PRODUCT[x.pid].emoji}</span>
              <span className="pt">
                <b>{PRODUCT[x.pid].name}</b>
                <small>
                  {SLOT[x.home].label} · last seen {fmtAgo(x.lastSeen?.t, Date.now())}
                </small>
              </span>
              <Conf c={x.confidence} />
            </li>
          ))}
        {tab === 'moving' &&
          moving.map((x) => (
            <li key={x.pid} onClick={() => setOpen(x.pid)}>
              <span className="pe">{PRODUCT[x.pid].emoji}</span>
              <span className="pt">
                <b>{PRODUCT[x.pid].name}</b>
                <small>
                  {x.beliefs
                    .slice(0, 3)
                    .map((b) => SLOT[b.slot].label)
                    .join(' · ')}
                </small>
              </span>
              <Conf c={x.confidence} />
            </li>
          ))}
      </ul>
      {open && <ProductSheet pid={open} onClose={() => setOpen(null)} go={go} />}
    </div>
  );
}

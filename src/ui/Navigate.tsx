import { useEffect, useMemo, useRef, useState } from 'react';
import { CORRALS, FRONT_END, GONDOLA_Y1, SLOT, type Pt } from '../model/layout';
import { PRODUCT } from '../model/products';
import { fmtAgo } from '../model/reality';
import { path, pathLength, WALK_FPS } from '../model/routing';
import { cancelRun, completeStop, getState, handleSec, notFoundAt, skipStop, useKnowledge, useStore, type Learn, type Stop } from '../model/state';
import { StoreMap, boundsOf, FULL, type Pin } from './StoreMap';
import { Conf, clock, toast } from './common';
import { Correct, LearnMoment } from './Correct';
import { say, sfx, voiceGuidance } from './feedback';
import type { Nav } from './App';

const shelfOf = (pid: string) => 1 + (parseInt(pid.slice(1), 10) * 7) % 5;

function direction(stop: Stop, leg: Pt[]): { head: string; sub: string } {
  const feet = Math.round(pathLength(leg) / 5) * 5;
  const walk = feet < 8 ? "You're here" : `Walk ${feet} ft`;
  if (stop.kind === 'carts') return { head: CORRALS.find((c) => c.id === stop.ref)?.label ?? 'Parking lot', sub: `${walk} · out the front doors` };
  if (!stop.slot) return { head: stop.title, sub: walk };
  const s = SLOT[stop.slot];
  if (s.zone === 'aisle') {
    const before = leg.length > 1 ? leg[leg.length - 2] : leg[0];
    const fromFront = before.y > s.walk.y;
    const lower = s.id.endsWith('-L'); // left side of the aisle as seen from the registers
    const yourSide = fromFront === lower ? 'left' : 'right';
    const end = before.y > GONDOLA_Y1 - 4 ? 'from the front' : before.y < 30 ? 'from the back' : '';
    return { head: `Aisle ${s.aisle}`, sub: `${walk}${end ? ` · enter ${end}` : ''} · on your ${yourSide}` };
  }
  return { head: s.label.split(' · ')[0], sub: `${walk} · ${s.label.split(' · ')[1] ?? s.detail}` };
}

const DONE_LABEL: Record<Stop['kind'], string> = {
  putaway: '✓ Put away',
  pick: '✓ Picked',
  stock: '✓ Stocked',
  verify: '✓ Looks right',
  carts: '✓ Carts collected',
  flag: '✓ Tag fixed',
  load: '✓ Loaded',
};

export function Navigate({ go }: { go: Nav }) {
  const run = useStore((s) => s.run);
  const me = useStore((s) => s.me);
  const k = useKnowledge();
  const [fixing, setFixing] = useState<string | null>(null);
  const [learned, setLearned] = useState<Learn | null>(null);
  const [overview, setOverview] = useState(false);
  const [verified, setVerified] = useState<Record<string, boolean>>({});

  const runId = useRef(run?.id);
  if (run) runId.current = run.id;
  useEffect(() => {
    // finished → summary; cancelled (or nothing running) → home
    if (!run && !learned) go(getState().lastRun?.id === runId.current ? 'done' : 'home');
  }, [run, learned, go]);

  const stop = run?.stops[run.idx];
  const leg = useMemo(() => (stop ? path(me, stop.point) : []), [me, stop?.id, stop?.point]);
  const rest = useMemo(() => {
    if (!run) return [];
    const pts = [stop!.point, ...run.stops.slice(run.idx + 1).map((s) => s.point), FRONT_END];
    const out: Pt[] = [];
    for (let i = 0; i < pts.length - 1; i++) out.push(...path(pts[i], pts[i + 1]));
    return out;
  }, [run?.id, run?.idx, run?.stops.length]);

  useEffect(() => {
    setVerified({});
    if (stop) {
      const d = direction(stop, leg);
      say(`Next, ${d.head}. ${stop.pids.length ? PRODUCT[stop.pids[0]].name : stop.title}`);
    }
  }, [stop?.id]);

  if (!run || !stop) return learned ? <LearnMoment learn={learned} onDone={() => setLearned(null)} /> : null;

  const d = direction(stop, leg);
  const remaining = run.stops.slice(run.idx);
  const remainFeet = pathLength(leg) + pathLength(rest);
  const remainSec = remainFeet / WALK_FPS + remaining.reduce((a, s) => a + handleSec(s), 0);
  const eta = Date.now() + remainSec * 1000;
  const slot = stop.slot ? SLOT[stop.slot] : null;

  const pins: Pin[] = run.stops.map((s, i) => ({
    id: s.id,
    at: s.movedTo ? SLOT[s.movedTo].walk : s.point,
    label: s.done ? (s.done === 'moved' ? '↪' : s.done === 'skipped' ? '–' : '✓') : String(i + 1),
    tone: i === run.idx ? 'mint' : s.done ? 'dim' : s.kind === 'verify' ? 'violet' : s.kind === 'carts' ? 'amber' : 'blue',
    pulse: i === run.idx,
  }));

  const view = overview ? FULL : boundsOf([me, stop.point], 22, 1.3);

  const done = () => {
    sfx.confirm();
    completeStop({ verified });
    const r = getState().run;
    if (!r) sfx.done();
    if (stop.kind === 'verify') {
      const miss = Object.values(verified).filter((v) => !v).length;
      toast(`+${stop.pids.length - miss} confirmations${miss ? ` · ${miss} flagged missing` : ''} · confidence up`, 'mint');
    }
  };

  const notFound = (pid: string) => {
    sfx.error();
    const alt = notFoundAt(pid);
    toast(alt ? `Not there — try ${SLOT[alt].label} next (added to route)` : 'Marked missing. The store will learn from this.', 'amber');
  };

  return (
    <div className="screen nav">
      <div className="nav-banner">
        <button className="icon-btn ghost" onClick={() => (confirm('End this route?') ? cancelRun() : null)} aria-label="End route">
          ✕
        </button>
        <div className="nb-main">
          <small>NEXT</small>
          <h1>{d.head}</h1>
          <p>{d.sub}</p>
        </div>
        <div className="nb-count">
          <b>
            {run.idx + 1}/{run.stops.length}
          </b>
          <small>stops</small>
        </div>
      </div>

      <div className="nav-map">
        <StoreMap view={view} route={leg} routeDone={rest} pins={pins} me={me} highlight={slot ? [{ slot: slot.id }] : []} corralCounts={stop.kind === 'carts' ? { [stop.ref!]: 0 } : undefined} />
        <div className="nav-chips">
          {run.coldFirst && slot && slot.temp !== 'ambient' && <span className="chip-note ice">❄ Cold items routed first</span>}
          {run.naiveFeet && run.idx === 0 && (
            <span className="chip-note">
              Saves {Math.round(run.naiveFeet - run.feet)} ft vs. scan order
            </span>
          )}
          {run.reason && run.idx === 0 && <span className="chip-note why">{run.reason}</span>}
        </div>
        <button className="chip-btn nav-overview" onClick={() => setOverview((o) => !o)}>
          {overview ? 'Follow' : 'Overview'}
        </button>
        <button
          className={`chip-btn nav-voice ${voiceGuidance.on ? 'on' : ''}`}
          onClick={() => {
            voiceGuidance.set(!voiceGuidance.on);
            say(voiceGuidance.on ? 'Voice guidance on' : 'Voice guidance off', true);
            setOverview((o) => o);
          }}
        >
          {voiceGuidance.on ? '🔊' : '🔈'}
        </button>
      </div>

      <div className="stop-card">
        <div className="sc-meta">
          <span>
            ETA {clock(eta)} · {Math.max(1, Math.round(remainSec / 60))} min left
          </span>
          <span className="progress">
            <i style={{ width: `${(run.idx / run.stops.length) * 100}%` }} />
          </span>
        </div>

        {slot && (
          <div className="sc-where">
            <b>{slot.label}</b>
            <span>{slot.detail}</span>
          </div>
        )}

        {stop.kind === 'carts' && (
          <div className="sc-note">
            🛒 Collect <b>{stop.title.split(' · ')[0]}</b>, bring them to the vestibule. Corral counts reset when you confirm.
          </div>
        )}
        {stop.kind === 'flag' && (
          <div className="sc-note">🏷️ {getState().flags.find((f) => f.id === stop.ref)?.text}. Print a new tag at the service desk on your way.</div>
        )}
        {stop.kind === 'load' && (
          <div className="sc-note">
            📦 Pull{' '}
            {stop.pids.map((p) => (
              <b key={p}>{PRODUCT[p].name}, </b>
            ))}
            onto a U-boat.
          </div>
        )}
        {stop.kind === 'verify' && <p className="sc-note">Glance at the shelf. Tap anything that <b>isn't</b> here.</p>}

        {stop.kind !== 'carts' && stop.kind !== 'load' && stop.kind !== 'flag' && (
          <ul className="sc-items">
            {stop.pids.map((pid) => {
              const p = PRODUCT[pid];
              const kn = k[pid];
              const miss = verified[pid] === false;
              return (
                <li key={pid} className={miss ? 'miss' : ''}>
                  <span className="pe">{p.emoji}</span>
                  <div className="it">
                    <b>{p.name}</b>
                    <small>
                      {p.brand} · {p.size}
                      {slot?.zone === 'aisle' && ` · Shelf ${shelfOf(pid)}`}
                    </small>
                    <small className="evidence">
                      {kn.lastSeen ? `Seen by ${kn.lastSeen.who} ${fmtAgo(kn.lastSeen.t, Date.now())}` : 'Planogram only — never confirmed'}
                      {kn.secondary && ` · also ${SLOT[kn.secondary].label}`}
                    </small>
                    {kn.volatile && <small className="warn">⚠ Location changing frequently</small>}
                  </div>
                  <div className="it-right">
                    <Conf c={kn.confidence} />
                    {stop.kind === 'verify' ? (
                      <button className={`toggle ${miss ? 'off' : 'on'}`} onClick={() => setVerified((v) => ({ ...v, [pid]: v[pid] === false }))}>
                        {miss ? 'Missing' : 'Here'}
                      </button>
                    ) : stop.kind === 'pick' ? (
                      <button className="nothere" onClick={() => notFound(pid)}>
                        Not found?
                      </button>
                    ) : (
                      <button className="nothere" onClick={() => setFixing(pid)}>
                        📍 Not here?
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="sc-actions">
          <button className="btn ghost" onClick={() => (sfx.tap(), skipStop())}>
            Skip
          </button>
          <button className="btn primary grow big" onClick={done}>
            {DONE_LABEL[stop.kind]}
          </button>
        </div>
        {run.idx + 1 < run.stops.length && (
          <p className="then">
            Then: {(() => {
              const n = run.stops[run.idx + 1];
              return n.slot ? `${SLOT[n.slot].label} — ${n.title}` : n.title;
            })()}
          </p>
        )}
      </div>

      {fixing && (
        <Correct
          pid={fixing}
          onClose={() => setFixing(null)}
          onLearned={(l) => {
            setFixing(null);
            setLearned(l);
          }}
        />
      )}
      {learned && <LearnMoment learn={learned} onDone={() => setLearned(null)} />}
      {run.learned > 0 && <div className="learn-badge">🧠 {run.learned} learned this route</div>}
    </div>
  );
}

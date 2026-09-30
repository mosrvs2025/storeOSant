import { useEffect, useRef, useState } from 'react';
import { CONFIG, saveConfig } from '../model/config';
import { AISLE_COUNT, AISLE_NAMES, SECTIONS } from '../model/layout';
import { lookupUpc, normUpc, updateProduct } from '../model/products';
import { learnNewProduct, sawAt } from '../model/state';
import { TopBar, VoiceInput, toast } from './common';
import { Camera, hasBarcodeDetector, lookupOnline, useWedgeScanner } from './scanning';
import { sfx } from './feedback';
import type { Nav } from './App';

// Walk an aisle, scanning shelf tags in order. The order of the scans tells us the
// section (front → back), so nobody has to know or tap the layout.

const RESUME_KEY = 'storeos.walk.aisle';

type Phase = 'pick' | 'left' | 'right' | 'done';
interface Result {
  total: number;
  added: number;
  confirmed: number;
  alsoHere: number;
}

/** Spread an ordered list of scans evenly over sections A (front) … E (back). */
export function sectionFor(i: number, n: number, frontToBack: boolean) {
  const idx = Math.min(SECTIONS.length - 1, Math.floor((i * SECTIONS.length) / Math.max(1, n)));
  return SECTIONS[frontToBack ? idx : SECTIONS.length - 1 - idx];
}

export function WalkAisle({ go }: { go: Nav }) {
  const resume = Number(sessionStorage.getItem(RESUME_KEY)) || null;
  const [aisle, setAisle] = useState<number | null>(resume && resume <= AISLE_COUNT ? resume : null);
  const [phase, setPhase] = useState<Phase>(resume && resume <= AISLE_COUNT ? 'left' : 'pick');
  const [sign, setSign] = useState(resume ? CONFIG.aisleNames[resume] ?? '' : '');
  const [frozen, setFrozen] = useState(false);
  const [other, setOther] = useState('');
  const [scans, setScans] = useState<string[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Result>({ total: 0, added: 0, confirmed: 0, alsoHere: 0 });
  const [cam, setCam] = useState(false);
  const [q, setQ] = useState('');
  const listEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (resume) sessionStorage.removeItem(RESUME_KEY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => listEnd.current?.scrollIntoView({ block: 'nearest' }), [scans.length]);

  const start = (n: number) => {
    const name = sign.trim();
    const cfg = {
      ...CONFIG,
      aisles: Math.max(CONFIG.aisles, n),
      aisleNames: name ? { ...CONFIG.aisleNames, [n]: name } : CONFIG.aisleNames,
      frozen: frozen ? [...new Set([...CONFIG.frozen, n])] : CONFIG.frozen,
    };
    if (n > AISLE_COUNT || frozen !== CONFIG.frozen.includes(n)) {
      // The floor plan has to grow (or change) first; come straight back here after the reload.
      sessionStorage.setItem(RESUME_KEY, String(n));
      history.replaceState(null, '', '#aisle');
      saveConfig(cfg);
      return;
    }
    if (name !== (CONFIG.aisleNames[n] ?? '')) {
      saveConfig(cfg, false);
      AISLE_NAMES[n] = name;
    }
    setAisle(n);
    setPhase('left');
    sfx.confirm();
  };

  const scan = (raw: string) => {
    const code = normUpc(raw);
    if (code.length < 6) return;
    if (scans.includes(code)) {
      toast('Already scanned on this side', 'amber');
      return;
    }
    sfx.scan();
    setScans((s) => [...s, code]);
    const known = lookupUpc(code);
    if (known) setNames((m) => ({ ...m, [code]: `${known.emoji} ${known.name}` }));
    else
      lookupOnline(code).then((info) => {
        if (info) setNames((m) => ({ ...m, [code]: `${info.emoji} ${info.name}` }));
      });
  };
  useWedgeScanner(scan, phase === 'left' || phase === 'right');

  /** Commit one side: the order of the scans places each item in a section. */
  const commit = (side: 'L' | 'R') => {
    const frontToBack = side === 'L'; // down the left side, back up the right side
    const r = { ...result };
    scans.forEach((code, i) => {
      const slot = `A${aisle}-${sectionFor(i, scans.length, frontToBack)}-${side}`;
      const known = lookupUpc(code);
      r.total++;
      if (known) {
        if (sawAt(known.id, slot) === 'confirmed') r.confirmed++;
        else r.alsoHere++;
        return;
      }
      const label = names[code]?.replace(/^\S+\s/, '');
      const p = learnNewProduct({ upc: code, name: label ?? `Item …${code.slice(-5)}` }, slot);
      r.added++;
      lookupOnline(code).then((info) => info && updateProduct(p.id, { name: info.name, brand: info.brand, size: info.size, emoji: info.emoji, cats: info.cats }));
    });
    setResult(r);
    setScans([]);
    setNames({});
  };

  if (phase === 'pick') {
    const max = Math.max(AISLE_COUNT, 12);
    return (
      <div className="screen">
        <TopBar title="Walk an Aisle" sub="The fastest way to teach StoreOS your store" onBack={() => go('home')} />
        <div className="pad">
          <p className="lead">Go to the front end of an aisle and look at the hanging sign. Which aisle is it?</p>
          <div className="num-grid">
            {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
              <button key={n} className={`ap big ${aisle === n ? 'on' : ''}`} onClick={() => (setAisle(n), setSign(CONFIG.aisleNames[n] ?? ''), setFrozen(CONFIG.frozen.includes(n)))}>
                {n}
              </button>
            ))}
            <input className="ap big other" inputMode="numeric" placeholder="#" value={other} onChange={(e) => (setOther(e.target.value.replace(/\D/g, '').slice(0, 2)), setAisle(+e.target.value || null))} />
          </div>
          {aisle && (
            <>
              <label className="sign-field">
                What does the sign say? <small>(optional)</small>
                <input value={sign} onChange={(e) => setSign(e.target.value)} placeholder="e.g. Chips · Soda · Water" />
              </label>
              <button className={`chip-btn ${frozen ? 'on ice' : ''}`} onClick={() => setFrozen((f) => !f)}>
                ❄ {frozen ? 'Freezer aisle' : 'Freezer aisle?'}
              </button>
              <button className="btn primary wide big" onClick={() => start(aisle)}>
                Start aisle {aisle} →
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  if (phase === 'done')
    return (
      <div className="screen">
        <div className="done-hero">
          <div className="done-check">✓</div>
          <h1>Aisle {aisle} learned</h1>
          <p>{CONFIG.aisleNames[aisle!] || 'Every scan is now a known location'}</p>
        </div>
        <div className="done-stats three">
          <div>
            <b>{result.total}</b>
            <small>tags scanned</small>
          </div>
          <div>
            <b>{result.added}</b>
            <small>new products</small>
          </div>
          <div>
            <b>{result.confirmed + result.alsoHere}</b>
            <small>already known</small>
          </div>
        </div>
        <div className="pad">
          <p className="muted small">Names fill in from Open Food Facts in the background. Anything left as “Item …12345” can be renamed in ⚙ Settings.</p>
          <button
            className="btn primary wide big"
            onClick={() => {
              const n = aisle! + 1;
              setAisle(n);
              setSign(CONFIG.aisleNames[n] ?? '');
              setFrozen(CONFIG.frozen.includes(n));
              setResult({ total: 0, added: 0, confirmed: 0, alsoHere: 0 });
              setPhase('pick');
            }}
          >
            Next: aisle {aisle! + 1} →
          </button>
          <button className="btn ghost wide" onClick={() => go('home')}>
            Done for now
          </button>
        </div>
      </div>
    );

  const left = phase === 'left';
  return (
    <div className="screen walk-aisle">
      <TopBar
        title={`Aisle ${aisle} · ${left ? 'left side' : 'right side'}`}
        sub={left ? 'Walk front → back' : 'Walk back → front'}
        onBack={() => (scans.length && !confirm('Discard the scans on this side?') ? null : (setScans([]), setPhase('pick')))}
      />
      <div className="pad tight">
        <div className="walk-diagram" aria-hidden>
          <div className={`wd-side ${left ? 'on' : 'done'}`}>{left ? '↑' : '✓'}</div>
          <div className="wd-aisle">
            <span>BACK</span>
            <span>FRONT</span>
          </div>
          <div className={`wd-side ${left ? '' : 'on'}`}>{left ? '' : '↓'}</div>
        </div>
        <p className="lead center">
          {left ? (
            <>
              Start at the <b>front</b>. Scan every <b>shelf tag on your left</b>, in order, as you walk to the back.
            </>
          ) : (
            <>
              Turn around. Scan every <b>shelf tag on the other side</b> as you walk back to the front.
            </>
          )}
        </p>
        {cam && <Camera onCode={scan} onFail={(why) => (setCam(false), toast(why, 'amber'))} compact />}
        <div className="ms-actions">
          {hasBarcodeDetector() && (
            <button className="chip-btn" onClick={() => setCam((c) => !c)}>
              {cam ? 'Camera off' : '📷 Camera'}
            </button>
          )}
          <span className="walk-count">
            <b>{scans.length}</b> tags
          </span>
        </div>
        <VoiceInput
          value={q}
          onChange={setQ}
          placeholder="Or type a UPC"
          onSubmit={(v) => {
            scan(v);
            setQ('');
          }}
        />
        <ol className="walk-list">
          {scans.map((code, i) => (
            <li key={code}>
              <span className="wl-sec">{sectionFor(i, scans.length, left)}</span>
              <span className="wl-name">{names[code] ?? `UPC ${code}`}</span>
              <span className={`tag ${lookupUpc(code) ? 'confirmed' : 'new'}`}>{lookupUpc(code) ? '✓' : 'NEW'}</span>
            </li>
          ))}
          <div ref={listEnd} />
        </ol>
        <button
          className="btn primary wide big sticky-cta"
          onClick={() => {
            commit(left ? 'L' : 'R');
            sfx.confirm();
            setPhase(left ? 'right' : 'done');
          }}
        >
          {left ? (scans.length ? 'Reached the back → other side' : 'Nothing on this side → other side') : 'Finish aisle ✓'}
        </button>
      </div>
    </div>
  );
}

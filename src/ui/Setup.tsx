import { useRef, useState } from 'react';
import { CONFIG, DEMO_CONFIG, IS_REAL, saveConfig, type StoreConfig } from '../model/config';
import { AISLE_COUNT } from '../model/layout';
import { PRODUCTS, removeProduct, updateProduct } from '../model/products';
import { SnapSetup } from './SnapSetup';
import type { ReadResult } from '../model/signs';
import { exportBackup, importBackup, resetDemo, useKnowledge } from '../model/state';
import { SLOT } from '../model/layout';
import { Conf, TopBar, toast } from './common';
import type { Nav } from './App';

export function StoreForm({ initial, onSave, cta }: { initial: StoreConfig; onSave: (c: StoreConfig) => void; cta: string }) {
  const [c, setC] = useState<StoreConfig>({ ...initial, mode: 'real' });
  const setAisles = (n: number) => setC((x) => ({ ...x, aisles: Math.max(4, Math.min(30, n)) }));
  return (
    <div className="store-form">
      <label>
        Store name
        <input value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} placeholder="e.g. Safeway" />
      </label>
      <label>
        Store number <small>(optional)</small>
        <input value={c.number} onChange={(e) => setC({ ...c, number: e.target.value })} placeholder="#1234" />
      </label>
      <div className="field">
        <span>Numbered aisles</span>
        <div className="stepper">
          <button onClick={() => setAisles(c.aisles - 1)}>−</button>
          <b>{c.aisles}</b>
          <button onClick={() => setAisles(c.aisles + 1)}>+</button>
        </div>
      </div>
      <p className="muted small">
        StoreOS lays out the aisles between produce/bakery (left), meat &amp; deli (back wall), dairy (right) and the registers (front). Not sure? Leave it — walking a higher-numbered aisle adds it automatically.
      </p>
      <h3 className="h3">Aisle names &amp; freezers</h3>
      <div className="aisle-names">
        {Array.from({ length: c.aisles }, (_, i) => i + 1).map((n) => (
          <div key={n} className="an-row">
            <span className="an-num">{n}</span>
            <input value={c.aisleNames[n] ?? ''} placeholder="What’s in it? (optional)" onChange={(e) => setC({ ...c, aisleNames: { ...c.aisleNames, [n]: e.target.value } })} />
            <button className={`ice-toggle ${c.frozen.includes(n) ? 'on' : ''}`} onClick={() => setC({ ...c, frozen: c.frozen.includes(n) ? c.frozen.filter((x) => x !== n) : [...c.frozen, n] })}>
              ❄
            </button>
          </div>
        ))}
      </div>
      <button className="btn primary wide big" disabled={!c.name.trim()} onClick={() => onSave({ ...c, name: c.name.trim() })}>
        {cta}
      </button>
    </div>
  );
}

const BLANK: StoreConfig = { mode: 'real', name: '', number: '', aisles: 12, aisleNames: {}, frozen: [] };

/** First launch: snap signs, type it in, or try the demo. */
export function Setup() {
  const [mode, setMode] = useState<'choose' | 'type' | 'snap' | 'review'>('choose');
  const [draft, setDraft] = useState<StoreConfig>(BLANK);
  const [read, setRead] = useState<ReadResult | null>(null);
  if (mode === 'snap')
    return (
      <SnapSetup
        onBack={() => setMode('choose')}
        onTypeInstead={() => setMode('type')}
        onDraft={(c, r) => {
          setDraft(c);
          setRead(r);
          setMode('review');
        }}
      />
    );
  if (mode === 'review' && read)
    return (
      <div className="screen">
        <TopBar title="Here’s your store" sub="Check it over — fix anything the photos got wrong" onBack={() => setMode('snap')} />
        <div className="pad">
          <div className="read-summary">
            <b>
              Read {read.aisles.length} aisle{read.aisles.length === 1 ? '' : 's'}
              {read.aisles.some((a) => a.frozen) && ` · ${read.aisles.filter((a) => a.frozen).length} freezer`}
            </b>
            {read.departments.length > 0 && <small>Departments seen: {read.departments.join(', ')}</small>}
            {missingAisles(read).length > 0 && <small className="warn">No sign read for aisle {missingAisles(read).join(', ')} — add a name below if you like.</small>}
            {read.unreadable > 0 && <small>{read.unreadable} photo{read.unreadable === 1 ? '' : 's'} had no readable sign.</small>}
          </div>
          <StoreForm key={JSON.stringify(draft)} initial={draft} onSave={(c) => saveConfig(c)} cta="Looks right — create my store →" />
        </div>
      </div>
    );
  if (mode === 'type')
    return (
      <div className="screen">
        <TopBar title="Set up your store" sub="Takes a minute. You can change it later." onBack={() => setMode('choose')} />
        <div className="pad">
          <StoreForm initial={BLANK} onSave={(c) => saveConfig(c)} cta="Create my store →" />
        </div>
      </div>
    );
  return (
    <div className="screen setup">
      <div className="setup-hero">
        <div className="logo big">
          <svg viewBox="0 0 64 64" width="40" height="40">
            <path d="M14 48 C 22 26, 38 40, 50 14" stroke="currentColor" strokeWidth="7" fill="none" strokeLinecap="round" />
            <circle cx="50" cy="14" r="7" fill="currentColor" />
          </svg>
        </div>
        <h1>StoreOS</h1>
        <p>A live map of where things actually are in your store — built by scanning while you work.</p>
      </div>
      <div className="pad">
        <button className="choice" onClick={() => setMode('snap')}>
          <b>📸 Snap my store</b>
          <small>Walk the front end photographing the aisle signs. StoreOS reads them and builds your layout.</small>
        </button>
        <button className="choice" onClick={() => setMode('type')}>
          <b>⌨️ Type it in</b>
          <small>Enter how many aisles and what’s in them. Works offline.</small>
        </button>
        <button className="choice" onClick={() => saveConfig(DEMO_CONFIG)}>
          <b>🧪 Try the demo store</b>
          <small>A fictional grocery store with two weeks of history, so you can see every feature.</small>
        </button>
      </div>
    </div>
  );
}

export function Settings({ go }: { go: Nav }) {
  const k = useKnowledge();
  const [edit, setEdit] = useState(false);
  const [snap, setSnap] = useState<StoreConfig | null | 'shoot'>(null);
  const [q, setQ] = useState('');
  const [, bump] = useState(0);
  const file = useRef<HTMLInputElement>(null);
  const list = PRODUCTS.filter((p) => `${p.name} ${p.brand} ${p.upc}`.toLowerCase().includes(q.toLowerCase())).slice(0, 60);

  const download = () => {
    const blob = new Blob([exportBackup()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `storeos-${CONFIG.name.replace(/\W+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (snap === 'shoot')
    return (
      <SnapSetup
        onBack={() => setSnap(null)}
        onTypeInstead={() => (setSnap(null), setEdit(true))}
        onDraft={(c) =>
          setSnap({
            ...CONFIG,
            aisles: Math.max(CONFIG.aisles, c.aisles),
            aisleNames: { ...CONFIG.aisleNames, ...c.aisleNames },
            frozen: [...new Set([...CONFIG.frozen, ...c.frozen])],
          })
        }
      />
    );
  if (snap)
    return (
      <div className="screen">
        <TopBar title="Updated from photos" sub="Check it, then save. Mapped products keep their spots." onBack={() => setSnap(null)} />
        <div className="pad">
          <StoreForm initial={snap} onSave={(c) => saveConfig(c)} cta="Save store" />
        </div>
      </div>
    );
  if (edit)
    return (
      <div className="screen">
        <TopBar title="Edit store" sub="Saving reloads the app. Mapped products keep their spots." onBack={() => setEdit(false)} />
        <div className="pad">
          <StoreForm initial={CONFIG} onSave={(c) => saveConfig(c)} cta="Save store" />
        </div>
      </div>
    );

  return (
    <div className="screen">
      <TopBar title="Settings" sub={`${CONFIG.name} ${CONFIG.number} · ${IS_REAL ? 'your store' : 'demo'}`} onBack={() => go('home')} />
      <div className="pad">
        {IS_REAL && (
          <button className="btn ghost wide" onClick={() => setEdit(true)}>
            ✎ Edit store layout ({AISLE_COUNT} aisles)
          </button>
        )}
        {IS_REAL && (
          <button className="btn ghost wide" onClick={() => setSnap('shoot')}>
            📸 Update aisles from sign photos
          </button>
        )}
        <h3 className="h3">Backup</h3>
        <p className="muted small">Your map lives only on this phone. Export a backup now and then — clearing Chrome’s data would erase it.</p>
        <div className="row2">
          <button className="btn ghost grow" onClick={download}>
            ⬇ Export
          </button>
          <button className="btn ghost grow" onClick={() => file.current?.click()}>
            ⬆ Import
          </button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                importBackup(await f.text());
              } catch (err) {
                toast(String((err as Error).message), 'red');
              }
            }}
          />
        </div>

        {IS_REAL && (
          <>
            <h3 className="h3">Catalog · {PRODUCTS.length} products</h3>
            <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or UPC…" />
            <ul className="rl-list flush">
              {list.map((p) => (
                <li key={p.id}>
                  <span className="pe">{p.emoji}</span>
                  <span className="pt">
                    <b>{p.name}</b>
                    <small>
                      {SLOT[k[p.id]?.home]?.label ?? '—'} · {p.upc}
                    </small>
                  </span>
                  <Conf c={k[p.id]?.confidence ?? 0} />
                  <button
                    className="x"
                    aria-label="Rename"
                    onClick={() => {
                      const name = prompt('Product name', p.name);
                      if (name?.trim()) {
                        updateProduct(p.id, { name: name.trim() });
                        bump((x) => x + 1);
                      }
                    }}
                  >
                    ✎
                  </button>
                  <button
                    className="x"
                    aria-label="Delete"
                    onClick={() => {
                      if (confirm(`Remove ${p.name} from the catalog?`)) {
                        removeProduct(p.id);
                        bump((x) => x + 1);
                      }
                    }}
                  >
                    🗑
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        <h3 className="h3">Mode</h3>
        {IS_REAL ? (
          <button className="btn ghost wide" onClick={() => confirm('Switch to the demo store? Your store is kept and you can switch back.') && saveConfig({ ...DEMO_CONFIG })}>
            🧪 Open the demo store
          </button>
        ) : (
          <>
            <button
              className="btn primary wide"
              onClick={() => {
                const prev = localStorage.getItem('storeos.config.real');
                localStorage.removeItem('storeos.config');
                if (prev) saveConfig(JSON.parse(prev));
                else location.reload();
              }}
            >
              🏬 Use my own store
            </button>
            <button className="btn ghost wide" onClick={() => confirm('Reset the demo store?') && (resetDemo(), go('home'))}>
              Reset demo data
            </button>
          </>
        )}
        <p className="muted small version">StoreOS · data stays on this device</p>
      </div>
    </div>
  );
}

function missingAisles(r: ReadResult) {
  const have = new Set(r.aisles.map((a) => a.number));
  const max = Math.max(0, ...have);
  return Array.from({ length: max }, (_, i) => i + 1).filter((n) => !have.has(n));
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { AISLE_COUNT, AISLE_NAMES, SECTIONS, SLOT, SLOTS, nearestSlot, type Slot } from '../model/layout';
import { PRODUCT, PRODUCTS, lookupUpc, normUpc, updateProduct, type Product } from '../model/products';
import { parseLocation } from '../model/parse';
import { learnNewProduct, sawAt, useKnowledge, useStore } from '../model/state';
import { StoreMap, boundsOf, FULL } from './StoreMap';
import { Sheet, TopBar, VoiceInput, toast } from './common';
import { Camera, hasBarcodeDetector, lookupOnline, useWedgeScanner } from './scanning';
import { sfx } from './feedback';
import type { Nav } from './App';

/** Choose a spot in the store: tap the map, say it, or pick aisle/section/side. */
export function SlotPicker({ value, onChange, height = 220 }: { value: Slot | null; onChange: (s: Slot) => void; height?: number }) {
  const [q, setQ] = useState('');
  const [zoom, setZoom] = useState(false);
  const aisle = value?.zone === 'aisle' ? value.aisle! : null;
  const set = (s: Slot | undefined) => {
    if (!s) return;
    sfx.tap();
    onChange(s);
  };
  const pick = (a: number, sec: string, side: string) => set(SLOT[`A${a}-${sec}-${side}`]);
  return (
    <div className="slot-picker">
      <VoiceInput
        value={q}
        onChange={setQ}
        placeholder="Say it: “aisle 4 section B left”"
        onSubmit={(v) => {
          const r = parseLocation(v);
          if (r) {
            set(r.slot);
            setQ('');
          } else toast(`Couldn’t place “${v}” — tap the map`, 'amber');
        }}
      />
      <div className="corr-map" style={{ height }}>
        <StoreMap
          view={zoom && value ? boundsOf([value.walk], 40, 1.4) : FULL}
          highlight={value ? [{ slot: value.id, tone: 'violet' }] : []}
          pins={value ? [{ id: 'v', at: value.walk, tone: 'violet', label: '✓', pulse: true }] : []}
          onTap={(pt) => set(nearestSlot(pt))}
        />
        <span className="corr-hint">{value ? value.label : 'Tap the map'}</span>
        {value && (
          <button className="chip-btn corr-zoom" onClick={() => setZoom((z) => !z)}>
            {zoom ? 'Whole store' : 'Zoom'}
          </button>
        )}
      </div>
      <div className="aisle-pick">
        <div className="ap-row scroll">
          {Array.from({ length: AISLE_COUNT }, (_, i) => i + 1).map((a) => (
            <button key={a} className={`ap ${aisle === a ? 'on' : ''}`} onClick={() => pick(a, 'C', 'L')}>
              {a}
            </button>
          ))}
        </div>
        {aisle && (
          <div className="ap-row">
            {SECTIONS.map((sec) =>
              (['L', 'R'] as const).map((side) => {
                const id = `A${aisle}-${sec}-${side}`;
                return (
                  <button key={id} className={`ap small ${value?.id === id ? 'on' : ''}`} onClick={() => pick(aisle, sec, side)}>
                    {sec}
                    {side === 'L' ? '◀' : '▶'}
                  </button>
                );
              }),
            )}
          </div>
        )}
        {aisle && <small className="muted">{AISLE_NAMES[aisle] === `Aisle ${aisle}` ? `Aisle ${aisle}` : `Aisle ${aisle} · ${AISLE_NAMES[aisle]}`} · A = front (by the registers), E = back · ◀ left / right ▶ facing the back wall</small>}
      </div>
    </div>
  );
}

/** An unknown barcode: name it and say where it lives. */
export function LearnSheet({ upc, onClose, onLearned, initialSlot }: { upc: string; onClose: () => void; onLearned: (p: Product) => void; initialSlot?: string }) {
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [size, setSize] = useState('');
  const [emoji, setEmoji] = useState('📦');
  const [looking, setLooking] = useState(true);
  const [slot, setSlot] = useState<Slot | null>(initialSlot ? SLOT[initialSlot] : null);
  useEffect(() => {
    let live = true;
    lookupOnline(upc).then((info) => {
      if (!live) return;
      setLooking(false);
      if (info) {
        setName((n) => n || info.name);
        setBrand(info.brand);
        setSize(info.size);
        setEmoji(info.emoji);
      }
    });
    return () => {
      live = false;
    };
  }, [upc]);
  return (
    <Sheet title="New item — teach StoreOS" onClose={onClose}>
      <p className="muted small">UPC {normUpc(upc)} isn’t in your store yet. {looking ? 'Looking it up…' : ''}</p>
      <div className="learn-form">
        <span className="pe">{emoji}</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={looking ? 'Looking up name…' : 'What is it? e.g. Takis Fuego 9.9oz'} autoFocus />
      </div>
      {brand && (
        <p className="muted small">
          {brand} {size && `· ${size}`}
        </p>
      )}
      <h3 className="h3">Where does it live?</h3>
      <SlotPicker value={slot} onChange={setSlot} />
      <button
        className="btn primary wide"
        disabled={!slot || !name.trim()}
        onClick={() => {
          const p = learnNewProduct({ upc, name: name.trim(), brand, size, emoji }, slot!.id);
          sfx.learn();
          toast(`Learned ${p.name} → ${slot!.label}`, 'violet');
          onLearned(p);
        }}
      >
        {slot ? `Save — it lives at ${slot.label}` : 'Pick where it lives'}
      </button>
    </Sheet>
  );
}

interface Scanned {
  key: number;
  pid: string;
  result: 'new' | 'confirmed' | 'moved';
}

/** Stand at a shelf, scan everything on it. The fastest way to teach StoreOS a store. */
export function MapShelf({ go }: { go: Nav }) {
  const k = useKnowledge();
  useStore((s) => s.obs.length); // re-render as the catalog grows
  const [slot, setSlot] = useState<Slot | null>(null);
  const [picking, setPicking] = useState(true);
  const [log, setLog] = useState<Scanned[]>([]);
  const [cam, setCam] = useState(hasBarcodeDetector());
  const [q, setQ] = useState('');
  const n = useRef(0);
  const [, bump] = useState(0);
  const slotRef = useRef(slot);
  slotRef.current = slot;

  const scan = (raw: string) => {
    const s = slotRef.current;
    if (!s) return;
    const code = normUpc(raw);
    if (code.length < 6) return;
    sfx.scan();
    const known = lookupUpc(code);
    if (known) {
      const r = sawAt(known.id, s.id);
      setLog((l) => [{ key: n.current++, pid: known.id, result: r }, ...l]);
      return;
    }
    // Create it right away with a placeholder name; fill in the real name when the lookup returns.
    const p = learnNewProduct({ upc: code, name: `Item …${code.slice(-5)}` }, s.id);
    setLog((l) => [{ key: n.current++, pid: p.id, result: 'new' }, ...l]);
    lookupOnline(code).then((info) => {
      if (!info) return;
      updateProduct(p.id, { name: info.name, brand: info.brand, size: info.size, emoji: info.emoji });
      bump((x) => x + 1); // re-render with the new name
    });
  };
  useWedgeScanner(scan, !!slot && !picking);

  const next = () => {
    if (!slot || slot.zone !== 'aisle') return;
    const [, sec, side] = slot.id.split('-');
    const i = SECTIONS.indexOf(sec as (typeof SECTIONS)[number]);
    const id = i < SECTIONS.length - 1 ? `A${slot.aisle}-${SECTIONS[i + 1]}-${side}` : `A${slot.aisle}-A-${side === 'L' ? 'R' : 'L'}`;
    setSlot(SLOT[id]);
    sfx.tap();
    toast(`Now mapping ${SLOT[id].label} · ${SLOT[id].detail}`, 'mint');
  };

  const here = useMemo(() => (slot ? PRODUCTS.filter((p) => k[p.id]?.home === slot.id) : []), [k, slot]);
  const mappedSlots = useMemo(() => new Set(PRODUCTS.map((p) => k[p.id]?.home)).size, [k]);

  if (picking || !slot)
    return (
      <div className="screen">
        <TopBar title="Map a shelf" sub={`${PRODUCTS.length} products · ${mappedSlots} of ${SLOTS.length} spots mapped`} onBack={() => go('home')} />
        <div className="pad">
          <p className="lead">Stand in front of a shelf section, pick it below, then scan everything on it. Unknown items get named automatically from Open Food Facts when possible.</p>
          <SlotPicker value={slot} onChange={setSlot} height={250} />
          <button className="btn primary wide big" disabled={!slot} onClick={() => setPicking(false)}>
            {slot ? `Start scanning ${slot.label}` : 'Pick a shelf'}
          </button>
        </div>
      </div>
    );

  return (
    <div className="screen map-shelf">
      <TopBar title={slot.label} sub={slot.detail} onBack={() => setPicking(true)} right={<button className="link" onClick={() => go('home')}>Done</button>} />
      <div className="pad tight">
        {cam ? (
          <Camera onCode={scan} onFail={(why) => (setCam(false), toast(why, 'amber'))} compact />
        ) : (
          <div className="wedge-hint">
            <b>🔫 Ready for your scanner</b>
            <small>Pull the trigger on your Bluetooth scanner — or type a UPC below.</small>
          </div>
        )}
        <div className="ms-actions">
          {hasBarcodeDetector() && (
            <button className="chip-btn" onClick={() => setCam((c) => !c)}>
              {cam ? 'Camera off' : '📷 Camera'}
            </button>
          )}
          {slot.zone === 'aisle' && (
            <button className="chip-btn on" onClick={next}>
              Next section →
            </button>
          )}
        </div>
        <VoiceInput
          value={q}
          onChange={setQ}
          placeholder="Type a UPC"
          onSubmit={(v) => {
            scan(v);
            setQ('');
          }}
        />
        <div className="ms-stats">
          <span>
            <b>{log.length}</b> scanned here
          </span>
          <span>
            <b>{log.filter((l) => l.result === 'new').length}</b> new
          </span>
          <span>
            <b>{here.length}</b> live at this spot
          </span>
        </div>
        <ul className="scanned">
          {log.map((l) => {
            const p = PRODUCT[l.pid];
            if (!p) return null;
            return (
              <li key={l.key} className={l.key === n.current - 1 ? 'new' : ''}>
                <span className="pe">{p.emoji}</span>
                <span className="pt">
                  <b>{p.name}</b>
                  <small>
                    {p.brand ? `${p.brand} · ` : ''}UPC {p.upc}
                  </small>
                </span>
                <span className={`tag ${l.result}`}>{l.result === 'new' ? 'NEW' : l.result === 'moved' ? '↪ ALSO HERE' : '✓'}</span>
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
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

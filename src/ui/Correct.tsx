import { useMemo, useState } from 'react';
import { SLOT, nearestSlot, type Slot } from '../model/layout';
import { PRODUCT } from '../model/products';
import { parseLocation } from '../model/parse';
import { fmtAgo } from '../model/reality';
import { correctStop, useKnowledge, useStore, type Learn } from '../model/state';
import { StoreMap, boundsOf, FULL } from './StoreMap';
import { Conf, Sheet, VoiceInput, pct } from './common';
import { sfx } from './feedback';

async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const s = 220 / Math.max(img.width, img.height);
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * s);
    c.height = Math.round(img.height * s);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.7);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function Correct({ pid, onClose, onLearned }: { pid: string; onClose: () => void; onLearned: (l: Learn) => void }) {
  const p = PRODUCT[pid];
  const k = useKnowledge()[pid];
  const me = useStore((s) => s.me);
  const run = useStore((s) => s.run);
  const from = run?.stops[run.idx]?.slot ?? k.home;
  const [pick, setPick] = useState<Slot | null>(null);
  const [via, setVia] = useState<Learn['via']>('tap');
  const [heard, setHeard] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [photo, setPhoto] = useState<string | undefined>();
  const [zoomed, setZoomed] = useState(true);

  const suggestions = useMemo(() => {
    const out: { slot: Slot; why: string }[] = [];
    for (const b of k.beliefs) if (b.slot !== from) out.push({ slot: SLOT[b.slot], why: `${pct(b.share)} of sightings` });
    if (k.lastSeen && k.lastSeen.slot !== from && !out.some((o) => o.slot.id === k.lastSeen!.slot))
      out.unshift({ slot: SLOT[k.lastSeen.slot], why: `seen ${fmtAgo(k.lastSeen.t, Date.now())}` });
    const near = nearestSlot(me, (s) => s.id !== from && s.zone === 'endcap');
    if (!out.some((o) => o.slot.id === near.id)) out.push({ slot: near, why: 'nearest endcap' });
    return out.slice(0, 4);
  }, [k, from, me]);

  const view = zoomed ? boundsOf([me, SLOT[from].walk, ...(pick ? [pick.walk] : [])], 40, 1.4) : FULL;

  const choose = (s: Slot, how: Learn['via']) => {
    sfx.tap();
    setPick(s);
    setVia(how);
  };

  const commit = () => {
    if (!pick) return;
    sfx.learn();
    const l = correctStop(pid, pick.id, via, photo);
    onLearned(l);
  };

  return (
    <Sheet title={<>📍 Where is it actually?</>} onClose={onClose} className="correct">
      <div className="corr-prod">
        <span className="pe">{p.emoji}</span>
        <div>
          <b>{p.name}</b>
          <small>
            Not at {SLOT[from].label} · store was <Conf c={k.confidence} /> sure
          </small>
        </div>
      </div>

      <VoiceInput
        value={q}
        onChange={setQ}
        placeholder="Say it: “endcap facing aisle six”"
        onSubmit={(v) => {
          const r = parseLocation(v);
          if (r) {
            setHeard(v);
            choose(r.slot, 'voice');
            setZoomed(true);
          } else {
            sfx.error();
            setHeard(`Couldn't place “${v}” — tap the map instead`);
          }
        }}
      />
      {heard && pick && via === 'voice' && (
        <p className="heard">
          “{heard}” → <b>{pick.label}</b>
        </p>
      )}
      {heard && !pick && <p className="heard err">{heard}</p>}

      <div className="corr-map">
        <StoreMap
          view={view}
          me={me}
          highlight={[{ slot: from, tone: 'red' }, ...(pick ? [{ slot: pick.id, tone: 'violet' as const }] : [])]}
          pins={pick ? [{ id: 'pick', at: pick.walk, tone: 'violet', pulse: true, label: '✓' }] : []}
          onTap={(pt) => {
            choose(nearestSlot(pt), 'tap');
          }}
        />
        <span className="corr-hint">Tap the map where it is</span>
        <button className="chip-btn corr-zoom" onClick={() => setZoomed((z) => !z)}>
          {zoomed ? 'Whole store' : 'Zoom in'}
        </button>
      </div>

      <div className="sugg">
        {suggestions.map((s) => (
          <button key={s.slot.id} className={`chip ${pick?.id === s.slot.id ? 'on' : ''}`} onClick={() => choose(s.slot, 'list')}>
            {s.slot.label}
            <small>{s.why}</small>
          </button>
        ))}
      </div>

      <div className="corr-foot">
        <label className="photo-btn">
          {photo ? <img src={photo} alt="Shelf" /> : '📷'}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setPhoto(await shrink(f));
            }}
          />
        </label>
        <button className="btn primary grow" disabled={!pick} onClick={commit}>
          {pick ? `It's at ${pick.label} — teach StoreOS` : 'Pick where it is'}
        </button>
      </div>
    </Sheet>
  );
}

export function LearnMoment({ learn, onDone }: { learn: Learn; onDone: () => void }) {
  const p = PRODUCT[learn.pid];
  return (
    <div className="learn-wrap" onClick={onDone}>
      <div className="learn">
        <div className="learn-burst" />
        <p className="eyebrow">Reality Layer updated</p>
        <h2>
          {p.emoji} {p.name}
        </h2>
        <div className="learn-move">
          <div className="from">
            <small>was</small>
            <b>{SLOT[learn.from].label}</b>
          </div>
          <span className="arrow">→</span>
          <div className="to">
            <small>now</small>
            <b>{SLOT[learn.to].label}</b>
          </div>
        </div>
        <div className="learn-bars">
          <div>
            <small>Old belief</small>
            <span className="bar old">
              <i style={{ width: pct(learn.before) }} />
            </span>
            <b>{pct(learn.before)}</b>
          </div>
          <div>
            <small>New belief</small>
            <span className="bar new">
              <i style={{ width: pct(learn.after) }} />
            </span>
            <b>{pct(learn.after)}</b>
          </div>
        </div>
        {learn.photo && <img className="learn-photo" src={learn.photo} alt="Evidence" />}
        <p className="learn-note">Next time anyone scans this item, StoreOS routes them to {SLOT[learn.to].label}. Confidence keeps climbing as others confirm it.</p>
        <button className="btn primary" onClick={onDone}>
          Keep going
        </button>
      </div>
    </div>
  );
}

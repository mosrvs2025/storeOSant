import { useRef, useState } from 'react';
import type { StoreConfig } from '../model/config';
import { readSigns, shrinkPhoto, toConfig, type ReadResult } from '../model/signs';
import { TopBar } from './common';
import { sfx } from './feedback';

type Phase = 'shoot' | 'reading' | 'error';

/** Walk the store snapping signs; StoreOS reads them and drafts the layout. */
export function SnapSetup({ onBack, onDraft, onTypeInstead }: { onBack: () => void; onDraft: (c: StoreConfig, r: ReadResult) => void; onTypeInstead: () => void }) {
  const [photos, setPhotos] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>('shoot');
  const [done, setDone] = useState(0);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const pick = useRef<HTMLInputElement>(null);

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    const out: string[] = [];
    for (const f of Array.from(files)) {
      try {
        out.push(await shrinkPhoto(f));
      } catch {
        /* not an image */
      }
    }
    setPhotos((p) => [...p, ...out]);
    setBusy(false);
    sfx.scan();
  };

  const build = async () => {
    setPhase('reading');
    setDone(0);
    try {
      const r = await readSigns(photos, setDone);
      if (!r.aisles.length) throw new Error('No aisle numbers could be read. Get closer to the signs, or type your aisles in instead.');
      sfx.learn();
      onDraft(toConfig(r), r);
    } catch (e) {
      sfx.error();
      setErr((e as Error).message || 'Something went wrong');
      setPhase('error');
    }
  };

  if (phase === 'reading')
    return (
      <div className="screen">
        <div className="reading">
          <div className="reading-orb" />
          <h2>Reading your signs…</h2>
          <p className="muted">
            {done} of {photos.length} photos
          </p>
          <span className="progress wide">
            <i style={{ width: `${(done / photos.length) * 100}%` }} />
          </span>
        </div>
      </div>
    );

  return (
    <div className="screen">
      <TopBar title="Snap your store" sub="Walk the front end, photograph the signs" onBack={onBack} />
      <div className="pad">
        {phase === 'error' && (
          <div className="warn-box">
            {err}
            <div className="row2 mt">
              <button className="btn ghost grow" onClick={() => setPhase('shoot')}>
                Add more photos
              </button>
              <button className="btn ghost grow" onClick={onTypeInstead}>
                Type it instead
              </button>
            </div>
          </div>
        )}
        <ol className="snap-steps">
          <li>Walk along the registers and photograph <b>every hanging aisle sign</b> — one sign per photo, as straight-on as you can.</li>
          <li>Optional: department signs (Deli, Bakery, Pharmacy…) and the storefront for the name.</li>
          <li>
            Tap <b>Build my store</b>. StoreOS reads the signs and drafts the layout for you to check.
          </li>
        </ol>
        <div className="snap-grid">
          {photos.map((p, i) => (
            <div key={i} className="snap-thumb">
              <img src={p} alt={`Sign photo ${i + 1}`} />
              <button aria-label="Remove photo" onClick={() => setPhotos((ps) => ps.filter((_, j) => j !== i))}>
                ✕
              </button>
            </div>
          ))}
          <button className="snap-add" onClick={() => input.current?.click()} disabled={busy}>
            <span>📸</span>
            {busy ? 'Adding…' : photos.length ? 'Snap another' : 'Snap a sign'}
          </button>
        </div>
        <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (void add(e.target.files), (e.target.value = ''))} />
        <input ref={pick} type="file" accept="image/*" multiple hidden onChange={(e) => (void add(e.target.files), (e.target.value = ''))} />
        <button className="link pick-gallery" onClick={() => pick.current?.click()}>
          …or pick photos you already took
        </button>
        <button className="btn primary wide big" disabled={!photos.length || busy} onClick={build}>
          {photos.length ? `Build my store from ${photos.length} photo${photos.length === 1 ? '' : 's'} →` : 'Snap some signs first'}
        </button>
        <p className="muted small center mt">Photos are sent to Claude (Anthropic) to read the sign text, and aren’t kept. Everything else stays on this phone.</p>
      </div>
    </div>
  );
}

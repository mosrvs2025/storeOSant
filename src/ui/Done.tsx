import { SLOT } from '../model/layout';
import { PRODUCT } from '../model/products';
import { useStore } from '../model/state';
import { StoreMap, type Pin } from './StoreMap';
import { pct } from './common';
import type { Nav } from './App';

export function Done({ go }: { go: Nav }) {
  const run = useStore((s) => s.lastRun);
  const learns = useStore((s) => s.learns);
  if (!run) {
    go('home');
    return null;
  }
  const mins = Math.max(1, Math.round((run.finishedAt - run.startedAt) / 60e3));
  const ok = run.stops.filter((s) => s.done === 'ok').length;
  const moved = run.stops.filter((s) => s.done === 'moved');
  const skipped = run.stops.filter((s) => s.done === 'skipped').length;
  const items = run.stops.reduce((a, s) => a + Math.max(1, s.pids.length), 0);
  const thisRun = learns.filter((l) => l.t >= run.startedAt);
  const confirmations = run.stops.filter((s) => s.done === 'ok').reduce((a, s) => a + s.pids.length, 0);
  const pins: Pin[] = run.stops.map((s) => ({
    id: s.id,
    at: s.movedTo ? SLOT[s.movedTo].walk : s.point,
    tone: s.done === 'moved' ? 'violet' : s.done === 'ok' ? 'mint' : 'dim',
    label: s.done === 'moved' ? '↪' : s.done === 'ok' ? '✓' : '–',
  }));

  return (
    <div className="screen done">
      <div className="done-hero">
        <div className="done-check">✓</div>
        <h1>{run.kind === 'goback' ? 'Cart cleared' : run.kind === 'verify' ? 'Truth Walk complete' : 'Route complete'}</h1>
        <p>{run.title}</p>
      </div>
      <div className="done-stats">
        <div>
          <b>{items}</b>
          <small>items</small>
        </div>
        <div>
          <b>{mins}m</b>
          <small>elapsed</small>
        </div>
        <div>
          <b>{Math.round(run.feet)}</b>
          <small>ft planned</small>
        </div>
        {run.naiveFeet ? (
          <div>
            <b>{Math.round(((run.naiveFeet - run.feet) / run.naiveFeet) * 100)}%</b>
            <small>less walking</small>
          </div>
        ) : (
          <div>
            <b>{ok}</b>
            <small>stops done</small>
          </div>
        )}
      </div>
      <div className="done-map">
        <StoreMap pins={pins} dim />
      </div>

      <section className="done-learn">
        <h2>🧠 What the store learned from you</h2>
        <ul>
          <li>
            <b>{confirmations}</b> location{confirmations === 1 ? '' : 's'} confirmed — those items now read as fresh, high-confidence facts.
          </li>
          {thisRun.map((l) => (
            <li key={l.id} className="learned">
              {PRODUCT[l.pid].emoji} <b>{PRODUCT[l.pid].name}</b> moved {SLOT[l.from].label} → <b>{SLOT[l.to].label}</b>
              <span className="delta">
                {pct(l.before)} → {pct(l.after)}
              </span>
            </li>
          ))}
          {moved.length === 0 && thisRun.length === 0 && <li className="muted">No corrections this time. When something isn’t where StoreOS says, tap “Not here?” and it learns.</li>}
          {skipped > 0 && <li className="muted">{skipped} skipped stop{skipped === 1 ? '' : 's'} left as-is.</li>}
        </ul>
      </section>

      <div className="done-actions">
        <button className="btn ghost" onClick={() => go('reality')}>
          See the Reality Layer
        </button>
        <button className="btn primary grow" onClick={() => go('home')}>
          Done
        </button>
      </div>
    </div>
  );
}

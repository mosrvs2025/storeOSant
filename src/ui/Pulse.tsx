import { useMemo } from 'react';
import { CORRALS, SLOT } from '../model/layout';
import { pulse } from '../model/pulse';
import { areaHealth, fmtAgo } from '../model/reality';
import { cartsIn, useStore } from '../model/state';
import { StoreMap, type Pin } from './StoreMap';
import { Conf, TopBar, clock, useNow } from './common';
import type { Nav } from './App';

export function Pulse({ go }: { go: Nav }) {
  const now = useNow(5000);
  const s = useStore((x) => x);
  const signals = useMemo(() => pulse(s, now), [s, now]);
  const health = useMemo(() => areaHealth(s.obs, now).sort((a, b) => a.confidence - b.confidence), [s.obs, now]);
  const pins: Pin[] = signals.filter((x) => x.at).map((x) => ({ id: x.id, at: x.at!, tone: x.tone, pulse: x.tone === 'red', label: x.icon === '🏷️' ? '$' : '!' }));
  for (const f of s.flags) if (!f.resolved && !pins.some((p) => p.id === f.id)) pins.push({ id: f.id, at: SLOT[f.slot].walk, tone: 'amber', small: true });
  const counts = Object.fromEntries(CORRALS.map((c) => [c.id, cartsIn(c.id, s, now)]));
  return (
    <div className="screen pulse">
      <TopBar title={<>Store Pulse <span className="live-dot" /></>} sub={clock(now)} onBack={() => go('home')} />
      <div className="pulse-map">
        <StoreMap pins={pins} corralCounts={counts} me={s.me} />
      </div>
      <div className="pad">
        {signals.map((sig) => (
          <div key={sig.id} className={`signal big t-${sig.tone}`}>
            <span className="si">{sig.icon}</span>
            <span className="st">
              <b>{sig.text}</b>
              {sig.sub && <small>{sig.sub}</small>}
            </span>
          </div>
        ))}
        <button className="btn primary wide" onClick={() => go('copilot')}>
          ✦ What should I do about it?
        </button>
        <h3 className="h3">Area health</h3>
        <ul className="health">
          {health.map((h) => (
            <li key={h.area}>
              <b>{h.area}</b>
              <small>
                verified {fmtAgo(h.lastVerified, now)}
                {Math.abs(h.trend) > 0.01 && <em className={h.trend < 0 ? 'down' : 'up'}>{h.trend < 0 ? '▼' : '▲'}{Math.abs(Math.round(h.trend * 100))} 24h</em>}
              </small>
              <Conf c={h.confidence} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

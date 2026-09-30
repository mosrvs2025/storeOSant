import { useCallback, useEffect, useState } from 'react';
import { resetDemo, useStore } from '../model/state';
import { Home } from './Home';
import { Scan } from './Scan';
import { Navigate } from './Navigate';
import { Done } from './Done';
import { Reality } from './Reality';
import { Pulse } from './Pulse';
import { Copilot } from './Copilot';
import { Find, Orders } from './Find';
import { Lens } from './Lens';
import { Toasts } from './common';
import { MapShelf } from './Learn';
import { WalkAisle } from './WalkAisle';
import { Settings, Setup } from './Setup';
import { IS_REAL, NEEDS_SETUP } from '../model/config';

export type Screen = 'home' | 'scan' | 'nav' | 'done' | 'reality' | 'pulse' | 'copilot' | 'find' | 'orders' | 'lens' | 'map' | 'settings' | 'aisle';
export type Nav = (s: Screen) => void;

const SCREENS: Record<Screen, (p: { go: Nav }) => JSX.Element | null> = {
  home: Home,
  scan: Scan,
  nav: Navigate,
  done: Done,
  reality: Reality,
  pulse: Pulse,
  copilot: Copilot,
  find: Find,
  orders: Orders,
  lens: Lens,
  map: MapShelf,
  settings: Settings,
  aisle: WalkAisle,
};

function initial(): Screen {
  const h = location.hash.replace('#', '') as Screen;
  return h in SCREENS ? h : 'home';
}

export function App() {
  const hasRun = useStore((s) => !!s.run);
  const [screen, setScreen] = useState<Screen>(() => (hasRun ? 'nav' : initial()));
  const go = useCallback<Nav>((s) => {
    setScreen(s);
    history.replaceState(null, '', `#${s}`);
    window.scrollTo(0, 0);
  }, []);
  useEffect(() => {
    const onHash = () => {
      const h = location.hash.replace('#', '') as Screen;
      if (h in SCREENS) setScreen(h);
    };
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'R' && e.shiftKey && e.altKey) {
        resetDemo();
        go('home');
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [go]);
  const View = SCREENS[screen];
  if (NEEDS_SETUP)
    return (
      <div className="device">
        <div className="app">
          <Setup />
        </div>
      </div>
    );
  return (
    <div className="device">
      <div className="app" key={screen}>
        <View go={go} />
      </div>
      <Toasts />
      <aside className="desk-note" hidden={IS_REAL}>
        <h2>StoreOS</h2>
        <p>A live spatial operating system for a physical store. Best on a phone — or right here in the frame.</p>
        <ol>
          <li>
            Tap <b>Go-Backs</b> → <b>⚡ Scan whole cart</b> → <b>Start Route</b>.
          </li>
          <li>
            At the <b>Oreo Pumpkin Spice</b> stop, tap <b>📍 Not here?</b> and say or type “endcap facing aisle six”.
          </li>
          <li>Watch the Reality Layer learn, then replay two weeks in the time machine.</li>
          <li>
            Ask the copilot: <i>“I’ve got ten minutes.”</i> Open <b>Lens</b> and sweep an aisle.
          </li>
        </ol>
        <button
          className="link"
          onClick={() => {
            if (confirm('Reset the demo store to its starting state?')) {
              resetDemo();
              go('home');
            }
          }}
        >
          Reset demo store
        </button>
      </aside>
    </div>
  );
}

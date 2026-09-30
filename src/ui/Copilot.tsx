import { useEffect, useRef, useState } from 'react';
import { FRONT_END } from '../model/layout';
import { ask, type Answer } from '../model/copilot';
import { path } from '../model/routing';
import { startFind, startPlan, useStore } from '../model/state';
import { StoreMap, type Pin } from './StoreMap';
import { TopBar, VoiceInput } from './common';
import { say, sfx } from './feedback';
import type { Nav } from './App';

interface Msg {
  who: 'me' | 'os';
  text: string;
  a?: Answer;
}

const SUGGEST = ["I've got ten minutes. What should I do?", 'Where are the Takis?', "What's going on in aisle 9?", 'I have 25 minutes'];

export function Copilot({ go }: { go: Nav }) {
  const me = useStore((s) => s.me);
  const [msgs, setMsgs] = useState<Msg[]>([
    { who: 'os', text: 'I can see the whole store: pending work, where things really are, and where you’re standing. Ask me anything, or tell me how much time you have.' },
  ]);
  const [q, setQ] = useState('');
  const [thinking, setThinking] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ behavior: 'smooth' }), [msgs, thinking]);

  const send = (text: string) => {
    setQ('');
    setMsgs((m) => [...m, { who: 'me', text }]);
    setThinking(true);
    setTimeout(() => {
      const a = ask(text);
      setThinking(false);
      setMsgs((m) => [...m, { who: 'os', text: a.text, a }]);
      sfx.tap();
      say(a.text);
    }, 450);
  };

  return (
    <div className="screen copilot">
      <TopBar title="✦ Ask StoreOS" sub="Reasoning over the live store model" onBack={() => go('home')} />
      <div className="chat">
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.who}`}>
            <p>{m.text}</p>
            {m.a?.plan && <PlanCard a={m.a} me={me} go={go} />}
            {m.a?.findPid && (
              <button
                className="btn primary"
                onClick={() => {
                  startFind(m.a!.findPid!);
                  go('nav');
                }}
              >
                Take me there →
              </button>
            )}
          </div>
        ))}
        {thinking && (
          <div className="msg os thinking">
            <i />
            <i />
            <i />
          </div>
        )}
        <div ref={end} />
      </div>
      <div className="suggest">
        {SUGGEST.map((s) => (
          <button key={s} className="chip" onClick={() => send(s)}>
            {s}
          </button>
        ))}
      </div>
      <div className="chat-input">
        <VoiceInput value={q} onChange={setQ} onSubmit={send} placeholder="Ask or tap the mic…" />
      </div>
    </div>
  );
}

function PlanCard({ a, me, go }: { a: Answer; me: { x: number; y: number }; go: Nav }) {
  const plan = a.plan!;
  const pts = [me, ...plan.stops.map((s) => s.point), FRONT_END];
  const route = pts.slice(1).flatMap((p, i) => path(pts[i], p));
  const pins: Pin[] = plan.stops.map((s, i) => ({ id: s.id, at: s.point, label: String(i + 1), tone: s.kind === 'carts' ? 'amber' : s.kind === 'verify' ? 'violet' : s.kind === 'flag' ? 'violet' : 'blue' }));
  return (
    <div className="plan-card">
      <div className="plan-map">
        <StoreMap route={route} pins={pins} me={me} />
      </div>
      <ol>
        {plan.stops.map((s) => (
          <li key={s.id}>{s.title}</li>
        ))}
      </ol>
      <button
        className="btn primary wide"
        onClick={() => {
          startPlan(plan.stops, plan.title, a.text.split('.')[0] + '.');
          go('nav');
        }}
      >
        Start · ~{plan.minutes} min →
      </button>
    </div>
  );
}

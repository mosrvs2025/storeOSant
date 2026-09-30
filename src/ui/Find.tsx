import { useState } from 'react';
import { SLOT } from '../model/layout';
import { PRODUCT, PRODUCTS, searchProducts } from '../model/products';
import { fmtAgo } from '../model/reality';
import { startPick, useKnowledge, useStore } from '../model/state';
import { Conf, TopBar, VoiceInput, clock } from './common';
import { ProductSheet } from './Reality';
import type { Nav } from './App';

export function Find({ go }: { go: Nav }) {
  const k = useKnowledge();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const res = q.trim() ? searchProducts(q.replace(/^(where('s| is| are)?|find)\s+(the\s+)?/i, ''), 10) : ['Takis Fuego', 'Oreo Pumpkin Spice', 'Red Bull', 'Hummus Classic', 'Apple Cider'].map((n) => PRODUCTS.find((p) => p.name === n)!);
  return (
    <div className="screen find">
      <TopBar title="Find Item" sub="Where it actually is — not just where it should be" onBack={() => go('home')} />
      <div className="pad">
        <VoiceInput value={q} onChange={setQ} onSubmit={setQ} placeholder="Say or type a product…" autoFocus />
        {!q.trim() && <p className="muted small label">Customers ask about these a lot</p>}
        <ul className="results">
          {res.map((p) => {
            const kn = k[p.id];
            return (
              <li key={p.id} onClick={() => setOpen(p.id)}>
                <span className="pe">{p.emoji}</span>
                <span className="pt">
                  <b>{p.name}</b>
                  <small>
                    {SLOT[kn.home].label}
                    {kn.secondary && ` · also ${SLOT[kn.secondary].label}`}
                  </small>
                  <small className="evidence">{kn.volatile ? '⚠ moving around · ' : ''}last seen {fmtAgo(kn.lastSeen?.t, Date.now())}</small>
                </span>
                <Conf c={kn.confidence} />
              </li>
            );
          })}
        </ul>
      </div>
      {open && <ProductSheet pid={open} onClose={() => setOpen(null)} go={go} />}
    </div>
  );
}

export function Orders({ go }: { go: Nav }) {
  const orders = useStore((s) => s.orders);
  const k = useKnowledge();
  return (
    <div className="screen orders">
      <TopBar title="Pick Order" sub="Pickup orders, routed by where items really are" onBack={() => go('home')} />
      <div className="pad">
        {orders.map((o) => {
          const due = Math.round((o.due - Date.now()) / 60e3);
          const shaky = o.pids.filter((pid) => k[pid].confidence < 0.6);
          return (
            <div key={o.id} className={`order ${o.picked ? 'picked' : ''}`}>
              <div className="order-head">
                <b>{o.customer}</b>
                <span className={`due ${due < 20 ? 'hot' : ''}`}>{o.picked ? `Picked ${clock(o.picked)}` : `Due ${clock(o.due)} · ${due} min`}</span>
              </div>
              <ul>
                {o.pids.map((pid) => (
                  <li key={pid}>
                    {PRODUCT[pid].emoji} {PRODUCT[pid].name}
                    <small>{SLOT[k[pid].home].label}</small>
                    <Conf c={k[pid].confidence} />
                  </li>
                ))}
              </ul>
              {shaky.length > 0 && !o.picked && (
                <p className="warn-box small">
                  ⚠ {shaky.map((p) => PRODUCT[p].name).join(', ')} {shaky.length === 1 ? 'has' : 'have'} been moving. StoreOS will suggest backup spots if you can’t find {shaky.length === 1 ? 'it' : 'them'}.
                </p>
              )}
              {!o.picked && (
                <button
                  className="btn primary wide"
                  onClick={() => {
                    startPick(o.id);
                    go('nav');
                  }}
                >
                  Start pick →
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

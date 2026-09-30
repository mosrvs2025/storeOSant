import { useEffect, useState, type ReactNode } from 'react';
import { heatColor } from './StoreMap';
import { canListen, listen } from './feedback';

export function useNow(ms = 15000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
export const pct = (c: number) => `${Math.round(c * 100)}%`;

export function Conf({ c, big }: { c: number; big?: boolean }) {
  return (
    <span className={`conf ${big ? 'big' : ''}`} style={{ ['--c' as string]: heatColor(c) }}>
      <i>
        <s style={{ width: `${Math.round(c * 100)}%` }} />
      </i>
      <b>{pct(c)}</b>
    </span>
  );
}

export function Sheet({ children, onClose, title, className }: { children: ReactNode; onClose?: () => void; title?: ReactNode; className?: string }) {
  return (
    <div className="sheet-wrap" onPointerDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`sheet ${className ?? ''}`} role="dialog">
        <div className="grab" />
        {title && (
          <div className="sheet-head">
            <h2>{title}</h2>
            {onClose && (
              <button className="icon-btn" onClick={onClose} aria-label="Close">
                ✕
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export function TopBar({ title, sub, onBack, right }: { title: ReactNode; sub?: ReactNode; onBack?: () => void; right?: ReactNode }) {
  return (
    <header className="topbar">
      {onBack && (
        <button className="icon-btn" onClick={onBack} aria-label="Back">
          ←
        </button>
      )}
      <div className="tb-title">
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      <div className="tb-right">{right}</div>
    </header>
  );
}

/** Text field with a mic button that fills it from speech. */
export function VoiceInput({
  value,
  onChange,
  onSubmit,
  placeholder,
  autoFocus,
  autoListen,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  placeholder: string;
  autoFocus?: boolean;
  autoListen?: boolean;
}) {
  const [hearing, setHearing] = useState(false);
  const mic = async () => {
    if (!canListen()) return;
    setHearing(true);
    try {
      const l = listen(onChange);
      const t = await l.done;
      if (t.trim()) onSubmit(t);
    } catch {
      /* denied */
    } finally {
      setHearing(false);
    }
  };
  useEffect(() => {
    if (autoListen) void mic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <form
      className={`voice-input ${hearing ? 'hearing' : ''}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onSubmit(value);
      }}
    >
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={hearing ? 'Listening…' : placeholder} autoFocus={autoFocus} enterKeyHint="go" />
      {canListen() && (
        <button type="button" className={`mic ${hearing ? 'on' : ''}`} onClick={mic} aria-label="Speak">
          <MicIcon />
        </button>
      )}
      <button type="submit" className="send" aria-label="Send" disabled={!value.trim()}>
        ↑
      </button>
    </form>
  );
}

export const MicIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </svg>
);

let toastFn: ((t: Toast) => void) | null = null;
interface Toast {
  id: number;
  text: ReactNode;
  tone?: 'mint' | 'amber' | 'red' | 'violet';
}
let toastN = 0;
export const toast = (text: ReactNode, tone?: Toast['tone']) => toastFn?.({ id: toastN++, text, tone });

export function Toasts() {
  const [list, setList] = useState<Toast[]>([]);
  useEffect(() => {
    toastFn = (t) => {
      setList((l) => [...l.slice(-2), t]);
      setTimeout(() => setList((l) => l.filter((x) => x.id !== t.id)), 3200);
    };
    return () => {
      toastFn = null;
    };
  }, []);
  return (
    <div className="toasts" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`toast ${t.tone ?? ''}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

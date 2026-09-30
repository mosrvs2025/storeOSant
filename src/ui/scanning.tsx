import { useEffect, useRef, useState } from 'react';

/**
 * Bluetooth / USB barcode scanners in HID ("keyboard") mode type the code very fast
 * and finish with Enter. We catch those bursts anywhere in the app — unless the user
 * is typing in a text field, where the field's own submit handles the code.
 */
export function useWedgeScanner(onCode: (code: string) => void, enabled = true) {
  const cb = useRef(onCode);
  cb.current = onCode;
  useEffect(() => {
    if (!enabled) return;
    let buf = '';
    let last = 0;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const now = performance.now();
      if (now - last > 120) buf = '';
      last = now;
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (buf.length >= 6) {
          e.preventDefault();
          cb.current(buf);
        }
        buf = '';
        return;
      }
      if (/^[0-9A-Za-z]$/.test(e.key)) buf += e.key;
    };
    addEventListener('keydown', onKey, true);
    return () => removeEventListener('keydown', onKey, true);
  }, [enabled]);
}

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };
export const hasBarcodeDetector = () => typeof window !== 'undefined' && 'BarcodeDetector' in window;

/** Live rear camera with continuous barcode detection (Chrome on Android). */
export function Camera({ onCode, onFail, compact }: { onCode: (c: string) => void; onFail: (why: string) => void; compact?: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const cb = useRef({ onCode, onFail });
  cb.current = { onCode, onFail };
  const [hit, setHit] = useState(false);
  useEffect(() => {
    let stream: MediaStream | null = null;
    let stop = false;
    let last = '';
    let lastAt = 0;
    (async () => {
      try {
        const BD = (window as unknown as { BarcodeDetector?: new (o: object) => Detector }).BarcodeDetector;
        if (!BD) {
          cb.current.onFail('This browser can’t read barcodes from the camera. Use Chrome on Android, a Bluetooth scanner, or type the UPC.');
          return;
        }
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        if (stop || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const det = new BD({ formats: ['upc_a', 'ean_13', 'upc_e', 'ean_8', 'code_128'] });
        const loop = async () => {
          if (stop || !video.current) return;
          try {
            const codes = await det.detect(video.current);
            const c = codes[0]?.rawValue;
            if (c && (c !== last || Date.now() - lastAt > 2500)) {
              last = c;
              lastAt = Date.now();
              setHit(true);
              setTimeout(() => setHit(false), 350);
              cb.current.onCode(c);
            }
          } catch {
            /* frame not ready */
          }
          setTimeout(loop, 150);
        };
        void loop();
      } catch {
        cb.current.onFail('Camera blocked. Allow camera access for this site in Chrome’s settings, then try again.');
      }
    })();
    return () => {
      stop = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  return (
    <div className={`camera ${compact ? 'compact' : ''} ${hit ? 'hit' : ''}`}>
      <video ref={video} playsInline muted />
      <div className="reticle" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Product names from Open Food Facts (free, open database of grocery barcodes).

export interface OnlineInfo {
  name: string;
  brand: string;
  size: string;
  emoji: string;
}

const EMOJI: [RegExp, string][] = [
  [/ice cream|frozen dessert/i, '🍨'],
  [/frozen/i, '🧊'],
  [/milk|dairy/i, '🥛'],
  [/cheese/i, '🧀'],
  [/yogurt/i, '🥣'],
  [/egg/i, '🥚'],
  [/bread|bakery/i, '🍞'],
  [/cereal|breakfast/i, '🥣'],
  [/coffee/i, '☕'],
  [/tea\b/i, '🍵'],
  [/soda|soft drink|cola|carbonated/i, '🥤'],
  [/water/i, '💧'],
  [/juice/i, '🧃'],
  [/beer|wine|alcohol/i, '🍺'],
  [/chip|crisp/i, '🥔'],
  [/cookie|biscuit/i, '🍪'],
  [/cracker/i, '🧇'],
  [/candy|chocolate|confection/i, '🍫'],
  [/pasta|noodle/i, '🍝'],
  [/rice/i, '🍚'],
  [/sauce|condiment|ketchup|mustard/i, '🫙'],
  [/soup|canned/i, '🥫'],
  [/meat|beef|pork|chicken|poultry/i, '🥩'],
  [/fish|seafood|tuna/i, '🐟'],
  [/fruit|apple|banana|berr/i, '🍎'],
  [/vegetable/i, '🥦'],
  [/snack/i, '🍿'],
  [/pet|dog|cat/i, '🐾'],
  [/baby/i, '🍼'],
  [/clean|detergent|soap|laundry/i, '🧼'],
  [/paper|tissue|towel/i, '🧻'],
];

export function guessEmoji(text: string) {
  for (const [re, e] of EMOJI) if (re.test(text)) return e;
  return '📦';
}

export async function lookupOnline(upc: string): Promise<OnlineInfo | null> {
  const code = upc.replace(/\D/g, '');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 4000);
  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,brands,quantity,categories`, { signal: ctl.signal });
    if (!r.ok) return null;
    const j = await r.json();
    const p = j?.product;
    if (!p?.product_name) return null;
    return {
      name: String(p.product_name).trim(),
      brand: String(p.brands ?? '').split(',')[0].trim(),
      size: String(p.quantity ?? '').trim(),
      emoji: guessEmoji(`${p.categories ?? ''} ${p.product_name}`),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

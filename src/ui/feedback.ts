// Sound, haptics, speech — the things that make a handheld feel physical.

let ctx: AudioContext | null = null;
function audio() {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function tone(freq: number, ms = 70, type: OscillatorType = 'square', gain = 0.05, delay = 0) {
  const a = audio();
  if (!a) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.value = freq;
  const t = a.currentTime + delay / 1000;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + ms / 1000 + 0.02);
}

export const buzz = (p: number | number[]) => {
  try {
    navigator.vibrate?.(p);
  } catch {
    /* no haptics */
  }
};

export const sfx = {
  scan() {
    tone(1850, 80, 'square', 0.04);
    buzz(18);
  },
  confirm() {
    tone(880, 90, 'sine', 0.08);
    tone(1320, 140, 'sine', 0.07, 80);
    buzz([12, 40, 12]);
  },
  learn() {
    tone(660, 120, 'sine', 0.07);
    tone(990, 120, 'sine', 0.07, 110);
    tone(1320, 220, 'sine', 0.06, 220);
    buzz([10, 30, 10, 30, 30]);
  },
  error() {
    tone(220, 160, 'sawtooth', 0.05);
    buzz([40, 30, 40]);
  },
  tap() {
    tone(1200, 25, 'sine', 0.03);
  },
  done() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 180, 'sine', 0.07, i * 90));
    buzz([20, 50, 20, 50, 60]);
  },
};

let voiceOn = (() => {
  try {
    return localStorage.getItem('storeos.voice') === '1';
  } catch {
    return false;
  }
})();
export const voiceGuidance = {
  get on() {
    return voiceOn;
  },
  set(v: boolean) {
    voiceOn = v;
    try {
      localStorage.setItem('storeos.voice', v ? '1' : '0');
    } catch {
      /* ignore */
    }
  },
};

export function say(text: string, force = false) {
  if (!force && !voiceOn) return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch {
    /* no speech */
  }
}

// ---------------------------------------------------------------------------
// Speech recognition (Chrome / Safari). Resolves with the transcript.

type SR = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
  onerror: (e: unknown) => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
};

export const canListen = () =>
  typeof window !== 'undefined' && !!((window as unknown as Record<string, unknown>).SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition);

export function listen(onPartial?: (t: string) => void): { done: Promise<string>; stop: () => void } {
  const W = window as unknown as Record<string, new () => SR>;
  const Ctor = W.SpeechRecognition || W.webkitSpeechRecognition;
  if (!Ctor) return { done: Promise.reject(new Error('no-speech')), stop: () => {} };
  const r = new Ctor();
  r.lang = 'en-US';
  r.interimResults = true;
  r.maxAlternatives = 1;
  let text = '';
  const done = new Promise<string>((resolve, reject) => {
    r.onresult = (e) => {
      text = Array.from(e.results)
        .map((x) => x[0].transcript)
        .join(' ');
      onPartial?.(text);
    };
    r.onerror = (e) => reject(e);
    r.onend = () => resolve(text);
  });
  r.start();
  return { done, stop: () => r.stop() };
}

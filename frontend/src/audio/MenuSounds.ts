/** Menu sound effects: short square-wave blips in the spirit of 8-bit
 *  console UIs. Uses its own AudioContext so it never contends with the
 *  game Synth's voice limits or compressor. */

export type MenuSound = 'next' | 'prev' | 'enter';

interface Blip {
  /** [frequency Hz, duration s] steps played back to back */
  steps: [number, number][];
  type: OscillatorType;
  gain: number;
}

// Rising pitch for "next", falling for "prev", a quick two-note arpeggio for "enter".
export const MENU_SOUNDS: Record<MenuSound, Blip> = {
  next: {
    steps: [
      [1320, 0.022],
      [1760, 0.028],
    ],
    type: 'square',
    gain: 0.5,
  },
  prev: {
    steps: [
      [1760, 0.022],
      [1320, 0.028],
    ],
    type: 'square',
    gain: 0.5,
  },
  enter: {
    steps: [
      [660, 0.04],
      [990, 0.04],
      [1320, 0.07],
    ],
    type: 'square',
    gain: 0.6,
  },
};

const MASTER_GAIN = 0.06;
// Held arrow keys auto-repeat fast; throttle so repeats read as a tick, not a buzz.
const MIN_INTERVAL_MS = 35;
// A sound whose context took longer than this to resume is dropped, so a
// context unlocked much later never plays a stale blip.
const MAX_RESUME_DELAY_MS = 500;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let lastPlayed = Number.NEGATIVE_INFINITY;

function ensureContext(): AudioContext | null {
  if (ctx) return ctx;

  // biome-ignore lint/suspicious/noExplicitAny: vendor-prefixed AudioContext not in lib.dom types
  const Ctor = window.AudioContext || (window as any).webkitAudioContext;

  if (!Ctor) return null;

  ctx = new Ctor() as AudioContext;
  master = ctx.createGain();
  master.gain.value = MASTER_GAIN;
  master.connect(ctx.destination);

  return ctx;
}

function schedule(audio: AudioContext, sound: MenuSound): void {
  if (!master) return;

  const { steps, type, gain } = MENU_SOUNDS[sound];
  const osc = audio.createOscillator();
  const env = audio.createGain();
  const start = audio.currentTime;
  let t = start;

  osc.type = type;

  // Stepped (not glided) pitch gives the chiptune "arpeggio" character.
  for (const [freq, duration] of steps) {
    osc.frequency.setValueAtTime(freq, t);
    t += duration;
  }

  env.gain.setValueAtTime(0, start);
  env.gain.linearRampToValueAtTime(gain, start + 0.003);
  env.gain.setValueAtTime(gain, t - 0.012);
  env.gain.linearRampToValueAtTime(0, t);

  osc.connect(env);
  env.connect(master);
  osc.start(start);
  osc.stop(t + 0.01);
  osc.onended = () => {
    osc.disconnect();
    env.disconnect();
  };
}

export function playMenuSound(sound: MenuSound): void {
  const now = performance.now();

  if (now - lastPlayed < MIN_INTERVAL_MS) return;

  lastPlayed = now;

  try {
    const audio = ensureContext();

    if (!audio) return;

    if (audio.state === 'running') {
      schedule(audio, sound);
      return;
    }

    audio
      .resume()
      .then(() => {
        if (performance.now() - now <= MAX_RESUME_DELAY_MS) {
          schedule(audio, sound);
        }
      })
      .catch((err) => console.error('Menu sound failed', err));
  } catch (err) {
    console.error('Menu sound failed', err);
  }
}

// After a page reload the browser keeps the AudioContext suspended until a
// real user gesture. MIDI input does not count as one, so unlock on the first
// click/touch/key press instead of waiting for the first menu sound.
const UNLOCK_EVENTS = ['pointerdown', 'keydown', 'touchend'] as const;

function unlockOnGesture(): void {
  const audio = ensureContext();

  if (!audio) return;

  void audio.resume().then(() => {
    if (audio.state !== 'running') return;

    for (const type of UNLOCK_EVENTS) {
      document.removeEventListener(type, unlockOnGesture, true);
    }
  });
}

if (typeof document !== 'undefined') {
  for (const type of UNLOCK_EVENTS) {
    document.addEventListener(type, unlockOnGesture, true);
  }
}

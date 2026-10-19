/** Slight daily flavor for menu blips: a per-browser salt (localStorage)
 *  seeded by the local calendar day recolors each blip. The day's key sits
 *  anywhere in ±4 semitones (some days grave, some aigu), individual blips
 *  occasionally drop/rise an octave, tempo shifts ±10%, loudness ±20%, and
 *  the timbre may switch to triangle or sawtooth. Cross-blip ratios stay in
 *  semitones/octaves — a day is transposed, never out of tune. */

import { clamp, lerp } from '../utils/helpers.js';
import type { Blip, MenuSound } from './MenuSounds.js';

/** Integer semitones the shared day key may span (grave ⇄ aigu). */
export const DAY_KEY_RANGE: [number, number] = [-4, 4];
/** Register an individual blip may wander per octave draws. */
export const DAY_MIN_SEMITONES = -12;
export const DAY_MAX_SEMITONES = 9;
export const DAY_DURATION_RANGE: [number, number] = [0.9, 1.1];
export const DAY_GAIN_RANGE: [number, number] = [0.8, 1.2];
/** Chip-typical timbres a day may take, mostly keeping the square. */
export const DAY_TIMBRES: OscillatorType[] = ['square', 'triangle', 'sawtooth'];

const SALT_KEY = 'riffernal:menu-sound-salt';
const FALLBACK_SALT = 'riffernal-fallback';

export interface DayFactor {
  /** Transposition multiplier applied to every step frequency of the blip */
  pitch: number;
  /** Semitones behind `pitch` (integer: day key plus octave wander) */
  semitones?: number;
  /** Multiplier on each step duration (the blip's tempo) */
  duration: number;
  /** Multiplier on the blip gain */
  gain: number;
  /** The day's waveform color, overriding the blip's stock type */
  type?: OscillatorType;
}

export type DayVariation = Record<MenuSound, DayFactor>;

export function semitonesToPitch(semitones: number): number {
  return 2 ** (semitones / 12);
}

// Days since epoch aligned to local midnight, using getTimezoneOffset()'s
// convention (negative minutes east of UTC). Pass an offset explicitly so
// callers can drive it deterministically.
export function localDayNumber(date: Date, offsetMinutes: number): number {
  return Math.floor((date.getTime() - offsetMinutes * 60_000) / 86_400_000);
}

/** Random identity for this browser, generated once and kept in
 *  localStorage so the daily flavors match across sessions. Falls back to a
 *  constant salt when storage is unavailable; days still differ. */
export function getSalt(): string {
  try {
    const stored = localStorage.getItem(SALT_KEY);

    if (!stored) {
      const salt = `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(SALT_KEY, salt);
      return salt;
    }

    return stored;
  } catch (err) {
    console.error('Menu sound salt unavailable', err);
    return FALLBACK_SALT;
  }
}

/** FNV-1a, for mixing a salt string into a 32-bit PRNG seed. */
function hashString(str: string): number {
  let h = 2166136261;

  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }

  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;

  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic per-browser per-day blip factors. The day's key and timbre
 *  are drawn once and shared by every blip; register may wander an octave
 *  per sound, and tempo/loudness are drawn per sound (next, prev, enter in
 *  that order) from one PRNG stream seeded by salt + day, so the whole day
 *  plays identically and tomorrow differs. */
export function deriveDailyVariation(salt: string, day: number): DayVariation {
  const prng = mulberry32(hashString(`${salt}:${day}`));

  // Integer semitones: the day lands ON a key, not halfway past one.
  const daySemitones = Math.round(lerp(DAY_KEY_RANGE[0], DAY_KEY_RANGE[1], prng()));
  const type = drawTimbre(prng);

  const draw = (): DayFactor => {
    const octave = drawOctave(prng);
    const semitones = clamp(
      daySemitones + octave,
      DAY_MIN_SEMITONES,
      DAY_MAX_SEMITONES,
    );

    return {
      pitch: semitonesToPitch(semitones),
      semitones,
      duration: lerp(DAY_DURATION_RANGE[0], DAY_DURATION_RANGE[1], prng()),
      gain: lerp(DAY_GAIN_RANGE[0], DAY_GAIN_RANGE[1], prng()),
      type,
    };
  };

  return {
    next: draw(),
    prev: draw(),
    enter: draw(),
  };
}

// 60% of days keep the square, a quarter turn triangle, a few sawtooth.
function drawTimbre(prng: () => number): OscillatorType {
  const t = prng();

  if (t < 0.6) return 'square';
  if (t < 0.85) return 'triangle';

  return 'sawtooth';
}

// 1-in-5 blips shift register by an octave for a deeper/brighter voice.
function drawOctave(prng: () => number): number {
  const t = prng();

  if (t < 0.1) return -12;
  if (t < 0.2) return 12;

  return 0;
}

/** Frequency, tempo and loudness scale the blip uniformly, keeping its
 *  shape; the day's timbre replaces the stock one. */
export function applyDailyVariation(blip: Blip, factor: DayFactor): Blip {
  return {
    steps: blip.steps.map(
      ([freq, duration]) => [freq * factor.pitch, duration * factor.duration] as [number, number],
    ),
    type: factor.type ?? blip.type,
    gain: blip.gain * factor.gain,
  };
}

let currentDay: number | null = null;
let dailyVariation: DayVariation | null = null;

export function currentDailyVariation(): DayVariation {
  const now = new Date();
  const day = localDayNumber(now, now.getTimezoneOffset());

  if (dailyVariation === null || currentDay !== day) {
    currentDay = day;
    dailyVariation = deriveDailyVariation(getSalt(), day);
  }

  return dailyVariation;
}

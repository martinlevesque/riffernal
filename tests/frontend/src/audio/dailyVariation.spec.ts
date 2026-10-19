import { beforeEach, expect, test } from 'bun:test';

interface Store {
  data: Record<string, string>;
}

const store: Store = { data: {} };

(globalThis as any).localStorage = {
  getItem: (key: string) => (key in store.data ? store.data[key] : null),
  setItem: (key: string, value: string) => {
    store.data[key] = value;
  },
};

const documentStub: { events: Set<string> } = { events: new Set() };

(globalThis as any).document = {
  addEventListener: (type: string) => {
    documentStub.events.add(type);
  },
  removeEventListener: (type: string) => {
    documentStub.events.delete(type);
  },
};

import {
  applyDailyVariation,
  DAY_DURATION_RANGE,
  DAY_GAIN_RANGE,
  DAY_KEY_RANGE,
  DAY_MAX_SEMITONES,
  DAY_MIN_SEMITONES,
  DAY_TIMBRES,
  deriveDailyVariation,
  getSalt,
  localDayNumber,
  semitonesToPitch,
  type DayVariation,
} from '../../../../frontend/src/audio/dailyVariation.js';

// Shape mirrors MenuSounds' "enter" blip; kept local so this spec never
// needs MenuSounds.js (navFocus.spec mocks its namespace process-wide).
const ENTER_BLIP = {
  steps: [
    [660, 0.04],
    [990, 0.04],
    [1320, 0.07],
  ] as [number, number][],
  type: 'square' as OscillatorType,
  gain: 0.6,
};

beforeEach(() => {
  store.data = {};
});

const SOUNDS = ['next', 'prev', 'enter'] as const;

test('localDayNumber counts local calendar days since epoch', () => {
  const noonUtc = new Date(Date.UTC(2000, 0, 2, 12, 0, 0));
  expect(localDayNumber(noonUtc, 0)).toBe(10958);
});

test('localDayNumber shifts with timezone offset to keep local midnight', () => {
  const duskUtc = new Date(Date.UTC(2026, 9, 19, 23, 30, 0));
  const nextDawn = new Date(Date.UTC(2026, 9, 20, 1, 30, 0));

  // getTimezoneOffset convention: a UTC+2.5 zone reports -150.
  const utcPlusHalf2 = -150;

  // 23:30 UTC is already past local midnight in a +2.5h zone.
  expect(localDayNumber(duskUtc, utcPlusHalf2)).toBe(localDayNumber(nextDawn, utcPlusHalf2));

  // Same instants in a UTC zone split across two local days.
  expect(localDayNumber(duskUtc, 0)).not.toBe(localDayNumber(nextDawn, 0));
});

test('deriveDailyVariation is deterministic for a salt + day pair', () => {
  const a = deriveDailyVariation('salt-1', 20000);
  const b = deriveDailyVariation('salt-1', 20000);

  expect(a).toEqual(b);
});

test('deriveDailyVariation changes when the day changes', () => {
  const a = deriveDailyVariation('salt-1', 20000);
  const b = deriveDailyVariation('salt-1', 20001);

  expect(a).not.toEqual(b);
});

test('deriveDailyVariation changes when the salt changes', () => {
  const a = deriveDailyVariation('salt-1', 20000);
  const b = deriveDailyVariation('salt-2', 20000);

  expect(a).not.toEqual(b);
});

test('deriveDailyVariation covers every sound with all factors in hard bounds', () => {
  const pitchMin = semitonesToPitch(DAY_MIN_SEMITONES);
  const pitchMax = semitonesToPitch(DAY_MAX_SEMITONES);

  for (let i = 0; i < 100; i++) {
    const variation: DayVariation = deriveDailyVariation(`salt-${i}`, 18000 + i * 37);

    for (const sound of SOUNDS) {
      const factor = variation[sound];

      expect(factor.pitch).toBeGreaterThanOrEqual(pitchMin);
      expect(factor.pitch).toBeLessThanOrEqual(pitchMax);
      expect(factor.duration).toBeGreaterThanOrEqual(DAY_DURATION_RANGE[0]);
      expect(factor.duration).toBeLessThanOrEqual(DAY_DURATION_RANGE[1]);
      expect(factor.gain).toBeGreaterThanOrEqual(DAY_GAIN_RANGE[0]);
      expect(factor.gain).toBeLessThanOrEqual(DAY_GAIN_RANGE[1]);
      expect(DAY_TIMBRES).toContain(factor.type!);
    }
  }
});

test('the day sits on one timbre and keys span grave to aigu across days', () => {
  const pitchedKeys = new Set<number>();
  const usedTimbres = new Set<string>();

  for (let i = 0; i < 200; i++) {
    const variation = deriveDailyVariation(`salt-${i}`, 18000 + i * 13);

    // Timbre is day-wide: identical across the three blips.
    for (const sound of SOUNDS.slice(1)) {
      expect(variation[sound].type).toBe(variation.next.type);
    }

    // Some days land low, some high: the whole attackable key range.
    pitchedKeys.add(variation.next.semitones!);
    usedTimbres.add(variation.next.type!);
  }

  // Octave wander can push keys past the day range; assert real spread.
  expect(pitchedKeys.size).toBeGreaterThanOrEqual(DAY_KEY_RANGE[1] - DAY_KEY_RANGE[0] + 1);
  expect(usedTimbres.size).toBeGreaterThanOrEqual(2);
});

test('all pitches stay on integer semitones so blips never drift out of tune', () => {
  for (let i = 0; i < 20; i++) {
    const variation = deriveDailyVariation(`salt-${i}`, 20000 + i);

    for (const sound of SOUNDS) {
      const semis = variation[sound].semitones!;

      expect(Number.isInteger(semis)).toBe(true);
      expect(12 * Math.log2(variation[sound].pitch)).toBeCloseTo(semis, 9);
    }
  }
});

test('different salts land on different days for at least one sound', () => {
  let differing = 0;

  for (let i = 0; i < 20; i++) {
    const a = deriveDailyVariation(`salt-a-${i}`, 20000);
    const b = deriveDailyVariation(`salt-b-${i}`, 20000);

    for (const sound of SOUNDS) {
      if (a[sound].pitch !== b[sound].pitch) {
        differing++;
        break;
      }
    }
  }

  expect(differing).toBeGreaterThan(0);
});

test('getSalt persists the generated salt and reuses it', () => {
  const first = getSalt();

  expect(first.length).toBeGreaterThan(0);
  expect(getSalt()).toBe(first);
  expect(store.data['riffernal:menu-sound-salt']).toBe(first);
});

test('applyDailyVariation recolors a blip uniformly without touching its shape', () => {
  const blip = ENTER_BLIP;
  const factor = { pitch: 0.98, duration: 1.08, gain: 1.1, type: 'triangle' as OscillatorType };

  const shifted = applyDailyVariation(blip, factor);

  expect(shifted.type).toBe('triangle');
  expect(shifted.gain).toBeCloseTo(blip.gain * 1.1, 10);

  for (let i = 0; i < blip.steps.length; i++) {
    expect(shifted.steps[i][0]).toBeCloseTo(blip.steps[i][0] * 0.98, 8);
    expect(shifted.steps[i][1]).toBeCloseTo(blip.steps[i][1] * 1.08, 10);
  }

  // Draws without a day timbre keep the blip's stock waveform.
  expect(applyDailyVariation(blip, { pitch: 1, duration: 1, gain: 1 }).type).toBe(blip.type);
});

test('applyDailyVariation keeps interval ratios intact (transposition only)', () => {
  const blip = ENTER_BLIP;
  const shifted = applyDailyVariation(blip, { pitch: 1.01, duration: 1, gain: 1 });

  expect(shifted.steps[1][0] / shifted.steps[0][0]).toBeCloseTo(
    blip.steps[1][0] / blip.steps[0][0],
    12,
  );
  expect(shifted.steps[2][0] / shifted.steps[1][0]).toBeCloseTo(
    blip.steps[2][0] / blip.steps[1][0],
    12,
  );
});

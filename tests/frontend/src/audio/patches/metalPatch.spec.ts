import { describe, expect, test } from 'bun:test';

import { type FakeAudioParam, FakeContext, type FakeParamEvent } from '../fakeContext.js';
import { metalPatch } from '../../../../../frontend/src/audio/patches/metalPatch.js';

// Times snap to a µs grid and values to 1e-9 so literal expectations compare
// cleanly with float arithmetic like 5 + 0.002.
function snap(events: FakeParamEvent[]): FakeParamEvent[] {
  return events.map((e) => ({
    ...e,
    time: Math.round(e.time * 1e6) / 1e6,
    value: e.value === undefined ? undefined : Math.round(e.value * 1e9) / 1e9,
  }));
}

function expectTime(actual: number, expected: number): void {
  expect(Math.abs(actual - expected)).toBeLessThan(1e-9);
}

function build(freq: number, startTime: number, duration?: number) {
  const ctx = new FakeContext();
  const note = metalPatch.build(ctx as unknown as AudioContext, freq, startTime, 60, duration);
  const oscs = ctx.ofKind('oscillator');
  const param = ctx.enveloped('gain').gain as FakeAudioParam;
  return { ctx, note, oscs, param };
}

const LIVE_ENV = [
  { type: 'set', value: 0, time: 5 },
  { type: 'lin', value: 1, time: 5.002 },
  { type: 'exp', value: 0.6, time: 5.08 },
  { type: 'exp', value: 0.35, time: 5.4 },
] as FakeParamEvent[];

describe('metalPatch — live build (duration unknown)', () => {
  test('applies the whole envelope and leaves oscillators running', () => {
    const { note, oscs, param } = build(440, 5);

    expect(note.endTime).toBeUndefined();
    expect(snap(param.events as FakeParamEvent[])).toEqual(LIVE_ENV);
    for (const osc of oscs) {
      expect(osc.stops).toEqual([]);
      expect(osc.starts).toEqual([5]);
    }
  });

  test('release() cancels pending automation and re-anchors at the current gain', () => {
    const { note, oscs, param } = build(440, 5);

    note.release({} as AudioContext, 7);

    const events = param.events as FakeParamEvent[];
    expect(events.find((e) => e.type === 'cancel')?.time).toBe(7);
    expect(snap(events.filter((e) => e.type === 'set'))).toEqual([
      { type: 'set', value: 0, time: 5 },
      { type: 'set', value: 1, time: 7 },
    ]);
    expect(snap(events.filter((e) => e.type === 'exp')).at(-1)).toEqual({ type: 'exp', value: 0.001, time: 7.15 });
    for (const osc of oscs) {
      expect(osc.stops.length).toBe(1);
      expectTime(osc.stops[0], 7.2);
    }
  });
});

describe('metalPatch — scheduled release (duration known)', () => {
  test('short note: cut inside the settle phase, fade, stops, endTime', () => {
    const { note, oscs, param } = build(440, 5, 0.1);

    // Anchor computed the same way envelopeValueAt interpolates the ramp,
    // snapped to the same grid as the recorded event.
    const rawAnchor = 0.6 * (0.35 / 0.6) ** (0.02 / 0.32);
    const anchor = snap([{ type: 'set', value: rawAnchor, time: 5.1 }])[0].value;
    expect(snap(param.events as FakeParamEvent[])).toEqual([
      { type: 'set', value: 0, time: 5 },
      { type: 'lin', value: 1, time: 5.002 },
      { type: 'exp', value: 0.6, time: 5.08 },
      { type: 'set', value: anchor, time: 5.1 },
      { type: 'exp', value: 0.001, time: 5.25 },
    ]);
    expect(note.endTime).toBeCloseTo(5.45, 9);
    const end = note.endTime as number;
    for (const osc of oscs) expect(osc.stops).toEqual([end]);
  });

  test('no envelope arm survives past the release anchor to swell the gain back', () => {
    const { param } = build(440, 5, 0.1);

    const events = param.events as FakeParamEvent[];
    expect(events.filter((e) => e.time > 5.1 + 1e-9 && e.type !== 'exp')).toEqual([]);
    // The only exponentials are the attack settle and the fade itself —
    // the 0.35 @5.4 sustain ramp is gone.
    expect(events.filter((e) => e.type === 'exp').map((e) => e.value)).toEqual([0.6, 0.001]);
  });

  test('long note: full envelope plays, then fades from the sustain', () => {
    const { note, param } = build(440, 5, 2.0);

    expect(snap(param.events as FakeParamEvent[])).toEqual([
      ...LIVE_ENV,
      { type: 'set', value: 0.35, time: 7 },
      { type: 'exp', value: 0.001, time: 7.15 },
    ]);
    expect(note.endTime).toBeCloseTo(7.35, 9);
  });

  test('a steal after the scheduled end still cuts the voice', () => {
    const { note, oscs, param } = build(440, 5, 0.1);

    note.release({} as AudioContext, 5.05);

    expect(param.events.filter((e) => e.type === 'cancel').map((e) => e.time)).toEqual([5.05]);
    // The manual stop joins the scheduled one (the last call wins in the browser).
    for (const osc of oscs) {
      expect(osc.stops.length).toBe(2);
      expectTime(osc.stops[0], 5.45);
      expectTime(osc.stops[1], 5.25);
    }
  });
});

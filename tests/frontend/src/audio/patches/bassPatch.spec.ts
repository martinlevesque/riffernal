import { describe, expect, test } from 'bun:test';

import { type FakeAudioParam, FakeContext, type FakeParamEvent } from '../fakeContext.js';
import { bassPatch } from '../../../../../frontend/src/audio/patches/bassPatch.js';

function snap(events: FakeParamEvent[]): FakeParamEvent[] {
  return events.map((e) => ({
    ...e,
    time: Math.round(e.time * 1e6) / 1e6,
    value: e.value === undefined ? undefined : Math.round(e.value * 1e9) / 1e9,
  }));
}

// Expected literals computed inline must live on the same rounding grid as
// the recorded (snapped) events, since envelopeValueAt's float ops can land
// an ulp apart from hand-rolled expressions.
const n = (v: number): number => Math.round(v * 1e9) / 1e9;

function build(freq: number, startTime: number, duration?: number) {
  const ctx = new FakeContext();
  const note = bassPatch.build(ctx as unknown as AudioContext, freq, startTime, 34, duration);
  const oscs = ctx.ofKind('oscillator');
  const param = ctx.enveloped('gain').gain as FakeAudioParam;
  return { note, oscs, param };
}

const LIVE_ENV = [
  { type: 'set', value: 0, time: 5 },
  { type: 'lin', value: 0.9, time: 5.002 },
  { type: 'exp', value: 0.6, time: 5.08 },
  { type: 'exp', value: 0.35, time: 5.4 },
] as FakeParamEvent[];

describe('bassPatch — live build (duration unknown)', () => {
  test('applies the whole envelope, no endTime, no scheduled stops', () => {
    const { note, oscs, param } = build(110, 5);

    expect(note.endTime).toBeUndefined();
    expect(snap(param.events as FakeParamEvent[])).toEqual(LIVE_ENV);
    for (const osc of oscs) expect(osc.stops).toEqual([]);
  });

  test('release() cuts like before', () => {
    const { note, oscs, param } = build(110, 5);

    note.release({} as AudioContext, 6);

    const events = param.events as FakeParamEvent[];
    expect(events.find((e) => e.type === 'cancel')?.time).toBe(6);
    expect(snap(events.filter((e) => e.type === 'set')).at(-1)).toEqual({ type: 'set', value: 1, time: 6 });
    expect(snap(events.filter((e) => e.type === 'exp')).at(-1)).toEqual({ type: 'exp', value: 0.001, time: 6.15 });
    for (const osc of oscs) expect(osc.stops[0]).toBeCloseTo(6.2, 9);
  });
});

describe('bassPatch — scheduled release (duration known)', () => {
  test('short note fades starting mid-settle; endTime matches the osc stops', () => {
    const { note, oscs, param } = build(110, 5, 0.05);

    // note ends inside the exponential 1 @0.002 → 0.6 @0.08 ramp; u computed
    // with the same arithmetic envelopeValueAt uses so floats match exactly
    const anchor = 0.9 * (0.6 / 0.9) ** ((0.05 - 0.002) / (0.08 - 0.002));
    expect(snap(param.events as FakeParamEvent[])).toEqual([
      { type: 'set', value: 0, time: 5 },
      { type: 'lin', value: 0.9, time: 5.002 },
      { type: 'set', value: n(anchor), time: 5.05 },
      { type: 'exp', value: 0.001, time: 5.2 },
    ]);
    expect(note.endTime).toBeCloseTo(5.4, 9);
    const end = note.endTime as number;
    for (const osc of oscs) expect(osc.stops).toEqual([end]);
  });

  test('long note keeps the sustain, then fades from it', () => {
    const { note, param } = build(110, 5, 3.0);

    expect(snap(param.events as FakeParamEvent[])).toEqual([
      ...LIVE_ENV,
      { type: 'set', value: 0.35, time: 8 },
      { type: 'exp', value: 0.001, time: 8.15 },
    ]);
    expect(note.endTime).toBeCloseTo(8.35, 9);
  });

  test('a steal after the scheduled end still cuts the voice early', () => {
    const { note, oscs, param } = build(110, 5, 0.05);

    note.release({} as AudioContext, 5.03);

    expect(param.events.filter((e) => e.type === 'cancel').map((e) => e.time)).toEqual([5.03]);
    for (const osc of oscs) expect(osc.stops.length).toBe(2);
  });
});

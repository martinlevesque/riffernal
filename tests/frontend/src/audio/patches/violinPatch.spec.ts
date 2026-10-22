import { describe, expect, test } from 'bun:test';

import { type FakeAudioParam, FakeContext, type FakeParamEvent } from '../fakeContext.js';
import { violinPatch } from '../../../../../frontend/src/audio/patches/violinPatch.js';

function snap(events: FakeParamEvent[]): FakeParamEvent[] {
  return events.map((e) => ({
    ...e,
    time: Math.round(e.time * 1e6) / 1e6,
    value: e.value === undefined ? undefined : Math.round(e.value * 1e9) / 1e9,
  }));
}

// Expected literals computed inline go through the snap grid so they compare
// cleanly against the recorded events.
const n = (v: number): number => Math.round(v * 1e9) / 1e9;

function build(freq: number, startTime: number, duration?: number) {
  const ctx = new FakeContext();
  const note = violinPatch.build(ctx as unknown as AudioContext, freq, startTime, 40, duration);
  const oscs = ctx.ofKind('oscillator').slice(0, 3); // last oscillator is the vibrato LFO
  const lfo = ctx.ofKind('oscillator').at(3)!;
  const param = ctx.enveloped('gain').gain as FakeAudioParam;
  return { note, oscs, lfo, param };
}

const LIVE_ENV = [
  { type: 'set', value: 0, time: 5 },
  { type: 'lin', value: 0.5, time: 5.005 },
  { type: 'lin', value: 0.85, time: 5.035 },
  { type: 'exp', value: 0.75, time: 5.15 },
] as FakeParamEvent[];

describe('violinPatch — live build (duration unknown)', () => {
  test('applies the bowed-string envelope, leaves the end open', () => {
    const { note, oscs, lfo, param } = build(440, 5);

    expect(note.endTime).toBeUndefined();
    expect(snap(param.events as FakeParamEvent[])).toEqual(LIVE_ENV);
    for (const osc of [...oscs, lfo]) expect(osc.stops).toEqual([]);
  });
});

describe('violinPatch — scheduled release (duration known)', () => {
  test('short note fades out of the attack transient', () => {
    const { note, oscs, lfo, param } = build(440, 5, 0.02);

    const anchor = 0.5 + (0.85 - 0.5) * ((0.02 - 0.005) / (0.035 - 0.005));
    expect(snap(param.events as FakeParamEvent[])).toEqual([
      { type: 'set', value: 0, time: 5 },
      { type: 'lin', value: 0.5, time: 5.005 },
      { type: 'set', value: n(anchor), time: 5.02 },
      { type: 'exp', value: 0.001, time: 5.27 },
    ]);
    expect(note.endTime).toBeCloseTo(5.57, 9);
    // endTime is set on the scheduled path — all four oscillators (incl. LFO) stop there
    const end = note.endTime as number;
    for (const osc of [...oscs, lfo]) expect(osc.stops).toEqual([end]);
  });

  test('note past the attack keeps the 0.75 sustain, then fades', () => {
    const { note, param } = build(440, 5, 1.5);

    expect(snap(param.events as FakeParamEvent[])).toEqual([
      ...LIVE_ENV,
      { type: 'set', value: 0.75, time: 6.5 },
      { type: 'exp', value: 0.001, time: 6.75 },
    ]);
    expect(note.endTime).toBeCloseTo(7.05, 9);
  });

  test('steal after a scheduled end cuts the voice early, LFO included', () => {
    const { note, oscs, lfo, param } = build(440, 5, 0.02);

    note.release({} as AudioContext, 5.01);

    expect(param.events.filter((e) => e.type === 'cancel').map((e) => e.time)).toEqual([5.01]);
    for (const osc of [...oscs, lfo]) expect(osc.stops.length).toBe(2);
  });
});

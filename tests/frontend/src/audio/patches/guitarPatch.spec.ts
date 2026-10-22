import { describe, expect, test } from 'bun:test';

import { type FakeAudioParam, FakeContext, type FakeParamEvent } from '../fakeContext.js';
import { getDistortionCurve } from '../../../../../frontend/src/audio/patches/shared.js';
import { guitarDistortionPatch } from '../../../../../frontend/src/audio/patches/guitarPatch.js';

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

function build(freq: number, startTime: number, duration?: number, cheap = false) {
  const ctx = new FakeContext();
  const patch = cheap ? guitarDistortionPatch.cheap! : guitarDistortionPatch;
  const note = patch.build(ctx as unknown as AudioContext, freq, startTime, 30, duration);
  const oscs = ctx.ofKind('oscillator');
  const param = ctx.enveloped('gain').gain as FakeAudioParam;
  const shaper = ctx.ofKind('waveshaper').at(0)!;
  return { note, oscs, param, shaper };
}

describe('guitarPatch — node shape (distortion variant)', () => {
  test('keeps the distortion curve and per-tier oversample the same as before', () => {
    const { shaper } = build(440, 0);

    expect(shaper.curve).toBe(getDistortionCurve(12));
    expect(shaper.oversample).toBe('2x');
  });

  test('the background variant keeps the curve, sheds the oversample', () => {
    const { shaper } = build(440, 0, undefined, true);

    expect(shaper.curve).toBe(getDistortionCurve(12));
    expect(shaper.oversample).toBe('none');
  });

  test('the background variant still schedules the self-release', () => {
    const { note, oscs } = build(440, 5, 0.03, true);

    expect(note.endTime).toBeCloseTo(5.38, 9);
    const end = note.endTime as number;
    for (const osc of oscs) expect(osc.stops).toEqual([end]);
  });
});

describe('guitarPatch — live build (duration unknown)', () => {
  test('applies the whole envelope, leaves the end open', () => {
    const { note, oscs, param } = build(440, 5);

    expect(note.endTime).toBeUndefined();
    expect(snap(param.events as FakeParamEvent[])).toEqual([
      { type: 'set', value: 0, time: 5 },
      { type: 'lin', value: 0.9, time: 5.002 },
      { type: 'exp', value: 0.6, time: 5.08 },
      { type: 'exp', value: 0.35, time: 5.4 },
    ]);
    for (const osc of oscs) expect(osc.stops).toEqual([]);
  });
});

describe('guitarPatch — scheduled release (duration known)', () => {
  test('short note fades from the interpolated attack, endDate set on all oscs', () => {
    const { note, oscs, param } = build(440, 5, 0.03);

    const anchor = 0.9 * (0.6 / 0.9) ** ((0.03 - 0.002) / (0.08 - 0.002));
    expect(snap(param.events as FakeParamEvent[])).toEqual([
      { type: 'set', value: 0, time: 5 },
      { type: 'lin', value: 0.9, time: 5.002 },
      { type: 'set', value: n(anchor), time: 5.03 },
      { type: 'exp', value: 0.001, time: 5.18 },
    ]);
    expect(note.endTime).toBeCloseTo(5.38, 9);
    const end = note.endTime as number;
    for (const osc of oscs) expect(osc.stops).toEqual([end]);
  });

  test('steal after a scheduled end cancels and cuts early', () => {
    const { note, oscs, param } = build(440, 5, 0.03);

    note.release({} as AudioContext, 5.02);

    expect(param.events.filter((e) => e.type === 'cancel').map((e) => e.time)).toEqual([5.02]);
    for (const osc of oscs) expect(osc.stops.length).toBe(2);
  });
});

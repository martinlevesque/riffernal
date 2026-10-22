import { describe, expect, test } from 'bun:test';

import { FakeAudioParam, type FakeParamEvent } from '../fakeContext.js';
import {
  applyEnvelope,
  applyEnvelopeWithRelease,
  type EnvelopePoint,
  envelopeValueAt,
} from '../../../../../frontend/src/audio/patches/shared.js';

const asParam = (p: FakeAudioParam): AudioParam => p as unknown as AudioParam;

const METAL_ENV: EnvelopePoint[] = [
  { at: 0, to: 0, type: 'set' },
  { at: 0.002, to: 1, type: 'lin' },
  { at: 0.08, to: 0.6, type: 'exp' },
  { at: 0.4, to: 0.35, type: 'exp' },
];

describe('envelopeValueAt', () => {
  test('evaluates the authored ramps piecewise', () => {
    expect(envelopeValueAt(METAL_ENV, 0)).toBe(0);
    expect(envelopeValueAt(METAL_ENV, 0.001)).toBeCloseTo(0.5, 9);
    expect(envelopeValueAt(METAL_ENV, 0.002)).toBe(1);
    // Exponential mid-ramp from 1 @0.002 to 0.6 @0.08
    expect(envelopeValueAt(METAL_ENV, 0.041)).toBeCloseTo(Math.sqrt(0.6), 9);
    expect(envelopeValueAt(METAL_ENV, 0.08)).toBe(0.6);
    expect(envelopeValueAt(METAL_ENV, 0.4)).toBeCloseTo(0.35, 9);
  });

  test('holds the sustain past the last point', () => {
    expect(envelopeValueAt(METAL_ENV, 1.4)).toBeCloseTo(0.35, 9);
  });

  test('honours set-jumps and holds between them', () => {
    const clap: EnvelopePoint[] = [
      { at: 0, to: 0.8, type: 'set' },
      { at: 0.004, to: 0, type: 'set' },
      { at: 0.008, to: 0.8, type: 'set' },
      { at: 0.012, to: 0, type: 'set' },
    ];

    expect(envelopeValueAt(clap, 0.002)).toBe(0.8);
    expect(envelopeValueAt(clap, 0.004)).toBe(0);
    expect(envelopeValueAt(clap, 0.006)).toBe(0);
    expect(envelopeValueAt(clap, 0.008)).toBe(0.8);
    expect(envelopeValueAt(clap, 0.01)).toBe(0.8);
    expect(envelopeValueAt(clap, 0.012)).toBe(0);
    expect(envelopeValueAt(clap, 0.05)).toBe(0);
  });
});

describe('applyEnvelope', () => {
  test('writes every point at t0 + at, in authored order', () => {
    const param = new FakeAudioParam();
    applyEnvelope(asParam(param), 10, METAL_ENV);

    expect(param.events).toEqual([
      { type: 'set', value: 0, time: 10 },
      { type: 'lin', value: 1, time: 10.002 },
      { type: 'exp', value: 0.6, time: 10.08 },
      { type: 'exp', value: 0.35, time: 10.4 },
    ]);
  });
});

describe('applyEnvelopeWithRelease', () => {
  test('cuts a short note inside the settle phase without leaving later bumps', () => {
    const param = new FakeAudioParam();
    applyEnvelopeWithRelease(asParam(param), 0, METAL_ENV, 0.1, 0.15);

    // Points past the release must never reach the param — otherwise the
    // swell to 0.35 @0.4 would fight the fade.
    expect(param.events).toEqual([
      { type: 'set', value: 0, time: 0 },
      { type: 'lin', value: 1, time: 0.002 },
      { type: 'exp', value: 0.6, time: 0.08 },
      { type: 'set', value: envelopeValueAt(METAL_ENV, 0.1), time: 0.1 },
      { type: 'exp', value: 0.001, time: 0.25 },
    ]);
  });

  test('fades from the sustain when the note outlives the envelope', () => {
    const param = new FakeAudioParam();
    applyEnvelopeWithRelease(asParam(param), 0, METAL_ENV, 1.0, 0.15);

    expect(param.events).toEqual([
      ...METAL_ENV.map((p): FakeParamEvent => ({ type: p.type, time: p.at, value: p.to })),
      { type: 'set', value: 0.35, time: 1.0 },
      { type: 'exp', value: 0.001, time: 1.15 },
    ]);
  });

  test('always anchors above zero so the exponential fade stays defined', () => {
    const param = new FakeAudioParam();
    applyEnvelopeWithRelease(asParam(param), 0, METAL_ENV, 0.0005, 0.15);

    const anchor = param.first('set', 0.0005)!;
    expect(anchor.value).toBeGreaterThan(0);
  });
});

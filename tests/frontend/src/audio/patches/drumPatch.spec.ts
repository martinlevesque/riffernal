import { describe, expect, test } from 'bun:test';

import { type FakeAudioParam, FakeContext, type FakeParamEvent } from '../fakeContext.js';
import { drumPatch } from '../../../../../frontend/src/audio/patches/drumPatch.js';

// Keep the drum patch on the high-end branch regardless of the runner's core
// count (device.ts caches its tier check at the first call in this process).
Object.defineProperty(globalThis.navigator, 'hardwareConcurrency', { value: 8, configurable: true });

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

// Expected literals computed inline go through the snap grid so they compare
// cleanly against the recorded events.
const n = (v: number): number => Math.round(v * 1e9) / 1e9;

function build(midi: number, startTime: number, duration?: number) {
  const ctx = new FakeContext();
  const note = drumPatch.build(ctx as unknown as AudioContext, 440, startTime, midi, duration);
  const oscs = ctx.ofKind('oscillator');
  const sources = ctx.ofKind('bufferSource');
  const envGains = ctx
    .ofKind('gain')
    .map((g) => ({
      node: g,
      param: g.gain as FakeAudioParam,
    }))
    .filter((g) => g.param.events.length > 0);
  return { ctx, note, oscs, sources, envGains };
}

describe('drumPatch — kick', () => {
  test('live: authored per-layer decays, natural stops', () => {
    const { note, oscs, envGains } = build(36, 5);

    expect(note.endTime).toBeUndefined();
    const [click, sub, harm] = envGains;
    expect(snap(click.param.events as FakeParamEvent[])).toEqual([
      { type: 'set', value: 0.7, time: 5 },
      { type: 'exp', value: 0.001, time: 5.03 },
    ]);
    expect(snap(sub.param.events as FakeParamEvent[])).toEqual([
      { type: 'set', value: 1.4, time: 5 },
      { type: 'lin', value: 1.0, time: 5.05 },
      { type: 'exp', value: 0.001, time: 5.45 },
    ]);
    expect(snap(harm.param.events as FakeParamEvent[])).toEqual([
      { type: 'set', value: 0.5, time: 5 },
      { type: 'exp', value: 0.001, time: 5.3 },
    ]);
    expect(oscs.map((o) => o.stops)).toEqual([[5.05], [5.5], [5.35]]);
  });

  test('scheduled: sub + harmonic cut at the note end, click left to decay, endTime 5.16', () => {
    const { note, oscs, envGains } = build(36, 5, 0.1);
    const [, sub, harm] = envGains;

    const subAnchor = 1.0 * (0.001 / 1.0) ** ((0.1 - 0.05) / (0.45 - 0.05));
    expect(snap(sub.param.events as FakeParamEvent[])).toEqual([
      { type: 'set', value: 1.4, time: 5 },
      { type: 'lin', value: 1.0, time: 5.05 },
      { type: 'set', value: n(subAnchor), time: 5.1 },
      { type: 'exp', value: 0.001, time: 5.15 },
    ]);
    const harmAnchor = 0.5 * (0.001 / 0.5) ** (0.1 / 0.3);
    expect(snap(harm.param.events as FakeParamEvent[])).toEqual([
      { type: 'set', value: 0.5, time: 5 },
      { type: 'set', value: n(harmAnchor), time: 5.1 },
      { type: 'exp', value: 0.001, time: 5.15 },
    ]);
    expect(note.endTime).toBeCloseTo(5.16, 9);
    // natural stop scheduled at build, then the cut re-stop — last call wins
    const end = note.endTime as number;
    expect(oscs.map((o) => o.stops)).toEqual([[5.05], [5.5, end], [5.35, end]]);
  });

  test('long note: nothing cut, envelope whole, endTime at the natural end', () => {
    const { note, oscs, envGains } = build(36, 5, 1.0);
    const [click, sub, harm] = envGains;

    expect(snap(click.param.events as FakeParamEvent[])).toEqual([
      { type: 'set', value: 0.7, time: 5 },
      { type: 'exp', value: 0.001, time: 5.03 },
    ]);
    expect(snap(sub.param.events as FakeParamEvent[])).toEqual([
      { type: 'set', value: 1.4, time: 5 },
      { type: 'lin', value: 1.0, time: 5.05 },
      { type: 'exp', value: 0.001, time: 5.45 },
    ]);
    expect(snap(harm.param.events as FakeParamEvent[])).toEqual([
      { type: 'set', value: 0.5, time: 5 },
      { type: 'exp', value: 0.001, time: 5.3 },
    ]);
    expect(note.endTime).toBeCloseTo(5.5, 9);
    expect(oscs.map((o) => o.stops)).toEqual([[5.05], [5.5], [5.35]]);
  });
});

describe('drumPatch — snare', () => {
  test('scheduled: noise + body cut early, ring left to its short natural decay', () => {
    const { note, oscs, sources, envGains } = build(38, 5, 0.1);
    const [, bodyGain, ringGain] = envGains;

    expect(note.endTime).toBeCloseTo(5.16, 9);
    // noise source: natural stop was scheduled first, then replaced by the cut
    expect(sources[0].stops.length).toBe(2);
    expectTime(sources[0].stops[0], 5.35);
    expectTime(sources[0].stops[1], 5.16);
    // ring envelope untouched (natural end 0.08 <= 0.1)
    expect(snap(ringGain.param.events as FakeParamEvent[]).at(-1)).toEqual({ type: 'exp', value: 0.001, time: 5.08 });
    // body fades at the note end and stops right there (its natural 0.15 stop is tighter)
    expect(snap(bodyGain.param.events as FakeParamEvent[]).at(-1)).toEqual({ type: 'exp', value: 0.001, time: 5.15 });
    const bodyOsc = oscs.at(-2)!;
    expectTime(bodyOsc.stops[bodyOsc.stops.length - 1], 5.15);
  });
});

describe('drumPatch — hi-hat', () => {
  test('closed hat shorter than its decay: gain cut + earlier source stop', () => {
    const { note, sources, envGains } = build(42, 5, 0.05);
    const gain = envGains[0].param;

    const anchor = 0.8 * (0.001 / 0.8) ** (0.05 / 0.08);
    expect(snap(gain.events as FakeParamEvent[])).toEqual([
      { type: 'set', value: 0.8, time: 5 },
      { type: 'set', value: n(anchor), time: 5.05 },
      { type: 'exp', value: 0.001, time: 5.1 },
    ]);
    expect(sources[0].stops.length).toBe(2);
    expectTime(sources[0].stops[1], 5.11);
    expect(note.endTime).toBeCloseTo(5.11, 9);
  });

  test('closed hat longer than its decay: authored decay, natural stop, endTime anyway', () => {
    const { note, sources, envGains } = build(42, 5, 0.5);
    const gain = envGains[0].param;

    expect(snap(gain.events as FakeParamEvent[])).toEqual([
      { type: 'set', value: 0.8, time: 5 },
      { type: 'exp', value: 0.001, time: 5.08 },
    ]);
    expect(sources[0].stops).toEqual([5.13]);
    expect(note.endTime).toBeCloseTo(5.13, 9);
  });

  test('open hat vs a short note: cut applies as well', () => {
    const { note, sources } = build(46, 5, 0.2);

    expect(note.endTime).toBeCloseTo(5.26, 9); // 0.2 + 0.05 fade + 0.01 tail
    expect(sources[0].stops.length).toBe(2);
    expectTime(sources[0].stops[1], 5.26);
  });
});

describe('drumPatch — tom', () => {
  test('scheduled: body cut at note end, click untouched, endTime = body cut', () => {
    const { note, oscs, envGains } = build(45, 5, 0.2);
    const [body, click] = envGains;

    const anchor = 0.9 * (0.001 / 0.9) ** (0.2 / 0.35);
    expect(snap(body.param.events as FakeParamEvent[])).toEqual([
      { type: 'set', value: 0.9, time: 5 },
      { type: 'set', value: n(anchor), time: 5.2 },
      { type: 'exp', value: 0.001, time: 5.25 },
    ]);
    expect(snap(click.param.events as FakeParamEvent[])).toEqual([
      { type: 'set', value: 0.5, time: 5 },
      { type: 'exp', value: 0.001, time: 5.04 },
    ]);
    expect(note.endTime).toBeCloseTo(5.26, 9);
    // body: natural stop scheduled at build then cut re-stop; click natural
    const end = note.endTime as number;
    expect(oscs.map((o) => o.stops)).toEqual([[5.4, end], [5.06]]);
  });
});

describe('drumPatch — cymbal', () => {
  test('live: authored wash decay, no endTime', () => {
    const { note, sources, envGains } = build(49, 5);
    const gain = envGains[0].param;

    expect(note.endTime).toBeUndefined();
    expect(snap(gain.events as FakeParamEvent[])).toEqual([
      { type: 'set', value: 0.7, time: 5 },
      { type: 'exp', value: 0.001, time: 6.3 },
    ]);
    expect(sources[0].stops).toEqual([6.55]);
  });

  test('scheduled: washy crash cut at the note end', () => {
    const { note, sources, envGains } = build(49, 5, 0.3);
    const gain = envGains[0].param;

    const anchor = 0.7 * (0.001 / 0.7) ** (0.3 / 1.3);
    expect(snap(gain.events as FakeParamEvent[])).toEqual([
      { type: 'set', value: 0.7, time: 5 },
      { type: 'set', value: n(anchor), time: 5.3 },
      { type: 'exp', value: 0.001, time: 5.35 },
    ]);
    expect(sources[0].stops.length).toBe(2);
    expectTime(sources[0].stops[1], 5.36);
    expect(note.endTime).toBeCloseTo(5.36, 9);
  });
});

describe('drumPatch — clap', () => {
  test('scheduled: rhythm stomped to the note end', () => {
    const { note, sources, envGains } = build(39, 5, 0.1);
    const gain = envGains[0].param;

    const events = gain.events as FakeParamEvent[];
    // All four hits inside the note survive; the 0.35 hit is dropped and the
    // tail fade starts at the anchor interpolated from the last hit.
    expect(snap(events.filter((e) => e.type === 'set' && e.time < 5.03)).map((e) => e.value)).toEqual([
      0.8, 0, 0.8, 0, 0.8, 0, 0.8, 0,
    ]);
    expect(events.filter((e) => e.type === 'set' && (e.time ?? 0) >= 5.03).map((e) => e.time)).toEqual([5.035, 5.1]);
    expect(snap(events.filter((e) => e.type === 'exp'))).toEqual([{ type: 'exp', value: 0.001, time: 5.15 }]);
    expectTime(sources[0].stops[1], 5.16);
    expect(note.endTime).toBeCloseTo(5.16, 9);
  });
});

describe('drumPatch — ride', () => {
  test('scheduled: wash cut at the note end, ping left to its natural decay', () => {
    const { note, oscs, sources, envGains } = build(51, 5, 0.5);
    const [wash, ping] = envGains;

    expect(snap(wash.param.events as FakeParamEvent[]).at(-1)).toEqual({ type: 'exp', value: 0.001, time: 5.55 });
    expect(snap(ping.param.events as FakeParamEvent[])).toEqual([
      { type: 'set', value: 0.2, time: 5 },
      { type: 'exp', value: 0.001, time: 5.15 },
    ]);
    expect(oscs.at(0)!.stops).toEqual([5.2]);
    expectTime(sources[0].stops[1], 5.56);
    expect(note.endTime).toBeCloseTo(5.56, 9);
  });
});

describe('drumPatch — perc (unmapped note)', () => {
  test('scheduled: sweeper cut + endTime on the osc stop', () => {
    const { note, oscs, envGains } = build(60, 5, 0.05);
    const gain = envGains[0];

    const anchor = 0.35 * (0.001 / 0.35) ** (0.05 / 0.1);
    expect(snap(gain.param.events as FakeParamEvent[])).toEqual([
      { type: 'set', value: 0.35, time: 5 },
      { type: 'set', value: n(anchor), time: 5.05 },
      { type: 'exp', value: 0.001, time: 5.1 },
    ]);
    expect(note.endTime).toBeCloseTo(5.11, 9);
    // natural stop scheduled at build then the cut re-stop
    expect(oscs[0].stops).toEqual([5.15, note.endTime as number]);
  });
});

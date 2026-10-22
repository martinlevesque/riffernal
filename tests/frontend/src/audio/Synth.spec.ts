import { beforeEach, describe, expect, test } from 'bun:test';

import { type FakeAudioParam, FakeContext, type FakeNode } from './fakeContext.js';
import { metalPatch } from '../../../../frontend/src/audio/patches/metalPatch.js';
import { Synth } from '../../../../frontend/src/audio/Synth.js';

// High-end tier regardless of the runner's core count, and a window that
// hands Synth the fake context (device.ts caches the check per process).
Object.defineProperty(globalThis.navigator, 'hardwareConcurrency', { value: 8, configurable: true });
Object.defineProperty(globalThis, 'window', { value: { AudioContext: FakeContext, innerWidth: 1280 }, configurable: true });

function newSynth(): Synth {
  const synth = new Synth();
  synth.init();
  return synth;
}

let synth: Synth;

beforeEach(() => {
  synth = newSynth();
});

const notes = (s: Synth): Map<string, unknown> => (s as unknown as { _activeNotes: Map<string, unknown> })._activeNotes;
const bgCount = (s: Synth): number => (s as unknown as { _bgCount: number })._bgCount;
const ctx = (s: Synth): FakeContext => {
  const c = (s as unknown as { _ctx: unknown })._ctx;
  return c as unknown as ExpectedCtx;
};

type ExpectedCtx = FakeContext;

describe('Synth — live notes (duration unknown)', () => {
  test('foreground note stays in the map with no endTime, no bg counting', () => {
    synth.noteOn('C4');

    expect(notes(synth).size).toBe(1);
    const entry = notes(synth).values().next().value as { note: { endTime?: number } };
    expect(entry.note.endTime).toBeUndefined();
    expect(bgCount(synth)).toBe(0);
  });

  test('an auto_ id counts as a background voice', () => {
    synth.noteOn('C4', metalPatch, 'auto_t10_c4');

    expect(bgCount(synth)).toBe(1);
  });

  test('a live note is never swept out, however long passes', () => {
    synth.noteOn('C4');

    ctx(synth).currentTime = 999;
    synth.noteOn('A4');

    expect(notes(synth).size).toBe(2);
  });

  test('releaseAll drops everything', () => {
    synth.noteOn('C4', metalPatch, 'auto_1_c4', undefined, 0.15);
    synth.noteOn('C4', metalPatch, 'auto_2_c4', undefined, 0.15);

    synth.releaseAll();

    expect(notes(synth).size).toBe(0);
    expect(bgCount(synth)).toBe(0);
  });
});

describe('Synth — self-scheduled voices (duration known)', () => {
  test('passes the duration to the patch so the voice ends itself', () => {
    ctx(synth).currentTime = 10;
    synth.noteOn('C4', metalPatch, 'auto_t10_c4', 60, 0.15);

    const gain = ctx(synth).enveloped('gain').gain as FakeAudioParam;
    // attack automation anchored at the build time
    expect(gain.events[0].time).toBe(10);
    const entry = notes(synth).get('auto_t10_c4') as { note: { endTime?: number } };
    // fade completes at 10 + 0.15 + 0.15, oscillators release 0.2 later
    expect(entry.note.endTime).toBeCloseTo(10.5, 9);
  });

  test('expired voices are swept off the map by the next noteOn', () => {
    ctx(synth).currentTime = 10;
    synth.noteOn('C4', metalPatch, 'auto_x', 60, 0.05); // ends at 10.4
    synth.noteOn('C4', metalPatch, 'auto_y', 60, 5);    // ends at 15.55

    ctx(synth).currentTime = 10.7; // only x is past cutoff 10.45
    synth.noteOn('C4', metalPatch, 'auto_z', 60, 0.05);

    expect(notes(synth).size).toBe(2);
    expect(notes(synth).has('auto_x')).toBe(false);
    expect(notes(synth).has('auto_y')).toBe(true);
    expect(notes(synth).has('auto_z')).toBe(true);
    expect(bgCount(synth)).toBe(2);
  });

  test('the sweep keeps _bgCount consistent to prevent steal-accounting drift', () => {
    synth.noteOn('C4', metalPatch, 'auto_1', 60, 0.1);
    expect(bgCount(synth)).toBe(1);

    ctx(synth).currentTime = 10;
    synth.noteOn('C4', metalPatch, 'auto_2', 60, 0.1);

    expect(bgCount(synth)).toBe(1);
  });

  test('the background cap still steals the oldest when full', () => {
    for (let i = 0; i < 26; i++) {
      synth.noteOn(`C${(i % 7) + 1}`, metalPatch, `auto_${i}_c4`, 60, 100);
    }

    expect(notes(synth).size).toBe(24);
    expect(bgCount(synth)).toBe(24);
    expect(notes(synth).has('auto_0_c4')).toBe(false);
    expect(notes(synth).has('auto_25_c4')).toBe(true);
  });
});

describe('Synth — same-key re-press behaviour', () => {
  test('re-pressing an auto voice releases the previous build, loop-safe', () => {
    synth.noteOn('C4', metalPatch, 'auto_t10_c4', 60, 0.15);

    synth.noteOn('C4', metalPatch, 'auto_t10_c4', 60, 0.15);

    expect(notes(synth).size).toBe(1);
    expect(bgCount(synth)).toBe(1);
  });
});

describe('Synth — volume plumbing', () => {
  test('setVolume writes the master gain', () => {
    synth.setVolume(0.7);

    const master = (synth as unknown as { _masterGain: { gain: FakeAudioParam } })._masterGain;
    expect(master.gain.value).toBe(0.7);
  });

  test('voice output is connected to the master gain', () => {
    synth.noteOn('C4');

    const master = (synth as unknown as { _masterGain: FakeNode })._masterGain;
    const voiceGain = ctx(synth).enveloped('gain');
    expect(voiceGain.connections).toContain(master);
  });
});

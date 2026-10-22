// Accompaniment engine units: chunk selection/length math, drift
// correction, and the streaming state machine (render queue, source
// scheduling, chain timing, eviction, pause/resume/seek re-syncs, degrade
// fallback) driven against a fake audio clock + FakeOfflineContext.

import { test, expect, describe } from 'bun:test';
import {
  AccompanimentEngine,
  selectChunkNotes,
  chunkBufferLengthSec,
  driftCorrectionRate,
  midiNoteToFrequency,
  type AccompanimentDeps,
  type AccompanimentNote,
  type OfflineContextLike,
} from '../../../../frontend/src/audio/Accompaniment.js';
import { guitarDistortionPatch } from '../../../../frontend/src/audio/patches/guitarPatch.js';
import { FakeContext, FakeOfflineContext } from './fakeContext.js';

const ANCHOR_CTX = 100;

const noteAt = (time: number, duration = 0.25, overrides: Partial<AccompanimentNote> = {}): AccompanimentNote => ({
  time,
  key: 'C3',
  duration,
  rawMidi: 48,
  program: 29,
  channel: 0,
  ...overrides,
});

const drain = async (steps = 16): Promise<void> => {
  for (let i = 0; i < steps; i++) await Promise.resolve();
};

interface TrackPeek {
  index: number;
  gain: any;
  enabled: boolean;
  chunks: Map<number, any>;
  bufferSecs: Map<number, number>;
  scheduled: Map<number, any>;
  queuedRenders: Set<number>;
}

const tracks = (e: AccompanimentEngine): TrackPeek[] => (e as unknown as { _tracks: TrackPeek[] })._tracks;
const track = (e: AccompanimentEngine, which = 0): TrackPeek => tracks(e)[which];

interface Harness {
  engine: AccompanimentEngine;
  host: FakeContext;
  offlines: FakeOfflineContext[];
  deps: AccompanimentDeps;
}

/** Notes for chunk 0 = t's 0, 1, 9.5; chunk 1 empty; chunk 2 = t' 20.4. */
function makeDeps(notes: AccompanimentNote[] | null = null, failRenders = false): Harness {
  const host = new FakeContext();
  const offlines: FakeOfflineContext[] = [];
  const bgNotes = notes ?? [noteAt(0.0), noteAt(1.0), noteAt(9.5, 3.0), noteAt(20.4)];
  const deps: AccompanimentDeps = {
    ctx: host as unknown as AudioContext,
    master: host.destination as unknown as AudioNode,
    patchFor: () => guitarDistortionPatch,
    tracks: [{ index: 1, enabled: true, notes: bgNotes }],
    offlineFactory: (sec, sr) => {
      const ctx = new FakeOfflineContext(Math.ceil(sec * sr), sr);
      if (failRenders) {
        ctx.startRendering = () => Promise.reject(new Error('offline boom'));
      }
      offlines.push(ctx);
      return ctx as unknown as OfflineContextLike;
    },
  };
  return { engine: new AccompanimentEngine(), host, offlines, deps };
}

// Pure helpers ----------------------------------------------------------------

describe('Accompaniment — chunk selection', () => {
  test('selects only notes starting inside the chunk window', () => {
    const notes = [noteAt(9.0, 5.0), noteAt(10.0), noteAt(15.0), noteAt(19.999)];
    expect(selectChunkNotes(notes, 10).map((n) => n.time)).toEqual([10.0, 15.0, 19.999]);
  });

  test('excludes crossers: earlier notes still sounding are not re-rendered', () => {
    const notes = [noteAt(9.5, 3.0), noteAt(10.2)];
    expect(selectChunkNotes(notes, 10).map((n) => n.time)).toEqual([10.2]);
  });

  test('clamps notes outliving the cap and returns a copy', () => {
    const long = noteAt(10.0, 30);
    const picked = selectChunkNotes([long], 10);
    expect(picked.length).toBe(1);
    expect(picked[0]).not.toBe(long);
    expect(picked[0].duration).toBe(17);
  });

  test('returns input objects untouched when durations fit', () => {
    const short = noteAt(10.0, 0.5);
    expect(selectChunkNotes([short], 10)[0]).toBe(short);
  });

  test('buffer length covers the last note end plus the release tail', () => {
    const picked = selectChunkNotes([noteAt(0.0, 0.5), noteAt(4.2, 2.0)], 0);
    expect(chunkBufferLengthSec(picked, 0)).toBeCloseTo(7.2, 9);
  });

  test('buffer length is capped at the max chunk size', () => {
    const picked = selectChunkNotes([noteAt(0.0, 30)], 0);
    expect(chunkBufferLengthSec(picked, 0)).toBe(18);
  });

  test('drift correction nudge is clamped to ±0.2% and silent under threshold', () => {
    expect(driftCorrectionRate(0.005, 10)).toBe(1);
    expect(driftCorrectionRate(0.015, 10)).toBeCloseTo(0.9985, 9);
    expect(driftCorrectionRate(0.05, 10)).toBe(0.998);
    expect(driftCorrectionRate(-0.05, 10)).toBe(1.002);
  });

  test('midi frequency mapping', () => {
    expect(midiNoteToFrequency(69)).toBe(440);
    expect(midiNoteToFrequency(49)).toBeCloseTo(138.59, 2);
  });
});

// Engine state machine ---------------------------------------------------------

describe('Accompaniment engine — streaming', () => {
  test('renders the initial window and schedules chunk 0 at the anchor mapping', async () => {
    const h = makeDeps();
    h.host.currentTime = ANCHOR_CTX;
    h.engine.attach(h.deps);
    h.engine.restartAt(0);

    expect(h.engine.running).toBe(true);
    expect(h.engine.handles({ track: 1, selected: false })).toBe(true);
    expect(h.engine.handles({ track: 1, selected: true })).toBe(false);

    for (let i = 0; i < 3; i++) {
      h.engine.tick(0);
      await drain();
    }

    // Two offline contexts: chunks 0 and 2 have notes; chunk 1 ([10, 20))
    // is an empty span renderer (no context, null marker). Notes built in
    // chunk 0: 3 notes × 2 saw oscillators each, 3 waveshapers.
    expect(h.offlines.length).toBe(2);
    expect(h.offlines[0].ofKind('oscillator').length).toBe(6);
    expect(h.offlines[1].ofKind('oscillator').length).toBe(2);

    const t = track(h.engine);
    expect(t.chunks.get(1)).toBe(null);
    expect(t.scheduled.get(0)).toBeTruthy();
    const src0 = t.scheduled.get(0);
    expect(src0.source.starts).toEqual([ANCHOR_CTX]);
    expect(src0.source.playbackRate.value).toBe(1);
    // Buffer chain: source -> per-track gain -> master destination.
    expect(t.gain.connections).toContain(h.host.destination);
    expect(src0.source.connections).toContain(t.gain);
  });

  test('schedules later chunks chained off the running source and skips empty spans', async () => {
    const h = makeDeps();
    h.host.currentTime = ANCHOR_CTX;
    h.engine.attach(h.deps);
    h.engine.restartAt(0);
    for (let i = 0; i < 3; i++) {
      h.engine.tick(0);
      await drain();
    }

    // At pos 0 only chunks 0 and 1 are schedulable (one boundary ahead);
    // chunk 1 is an empty span, so it never gets a source. Cross into it
    // and chunk 2 gets chained at song 20.
    const t0 = track(h.engine);
    expect(t0.scheduled.has(0)).toBe(true);
    expect(t0.scheduled.has(1)).toBe(false);

    h.engine.tick(10.5);
    await drain();
    h.engine.tick(11);
    await drain();
    h.engine.tick(11);
    await drain();

    expect(t0.chunks.get(1)).toBe(null);
    expect(t0.scheduled.has(1)).toBe(false);
    expect(t0.scheduled.has(2)).toBe(true);
    const src2 = t0.scheduled.get(2);
    expect(src2.source.starts[0]).toBe(ANCHOR_CTX + 20);
    // Future boundaries play the buffer from its start; the 20.4 note sits
    // 0.4s inside the audio itself.
    expect(src2.source.startOffsets[0]).toBe(0);
    // Chunk 0's source is untouched (its tail releases past the boundary).
    expect(t0.scheduled.get(0).source.starts).toEqual([ANCHOR_CTX]);
  });

  test('drift correction nudges the next chunk to ±0.2%', async () => {
    const h = makeDeps();
    h.host.currentTime = ANCHOR_CTX;
    h.engine.attach(h.deps);
    h.engine.restartAt(0);
    for (let i = 0; i < 3; i++) {
      h.engine.tick(0);
      await drain();
    }

    // Audio advanced 10.05 game-seconds while the game clock reads 11.0:
    // audio trails the game by 50ms — the next chunk speeds up to 1.002.
    h.host.currentTime = ANCHOR_CTX + 10.05;
    h.engine.tick(11.0);
    await drain();
    h.engine.tick(11.0);
    await drain();

    const src2 = track(h.engine).scheduled.get(2);
    expect(src2).toBeTruthy();
    expect(src2.source.playbackRate.value).toBe(1.002);
  });

  test('mid-chunk catch-up seeks schedule at now with a buffer offset', async () => {
    const h = makeDeps([noteAt(0.0), noteAt(12.0)]);
    h.host.currentTime = ANCHOR_CTX;
    h.engine.attach(h.deps);
    h.engine.restartAt(0);
    for (let i = 0; i < 3; i++) {
      h.engine.tick(0);
      await drain();
    }

    // Seek to 11.4 — inside chunk 1's buffered audio span [10, 13.25).
    h.host.currentTime = ANCHOR_CTX + 11.4;
    h.engine.restartAt(11.4);
    h.engine.tick(11.4);
    await drain();
    h.engine.tick(11.5);
    await drain();

    const t = track(h.engine);
    expect(t.scheduled.has(0)).toBe(false);
    const src1 = t.scheduled.get(1);
    expect(src1).toBeTruthy();
    // Chunk 1 spans song [10, ~13.25); seeking to 11.4 resumes 1.4s in.
    expect(src1.source.starts[0]).toBe(ANCHOR_CTX + 11.4);
    expect(src1.source.startOffsets[0]).toBeCloseTo(1.4, 9);
  });

  test('evicts played-out chunks once their buffered span passes', async () => {
    const h = makeDeps();
    h.host.currentTime = ANCHOR_CTX;
    h.engine.attach(h.deps);
    h.engine.restartAt(0);
    for (let i = 0; i < 3; i++) {
      h.engine.tick(0);
      await drain();
    }

    // Advance realistically (renders catch up per tick). Chunk 0's buffer
    // spans song [0, 13.5); once playback passes +the tail margin, both
    // the chunk and its stale scheduled entry are evicted.
    h.engine.tick(11);
    await drain();
    h.engine.tick(20.5);
    await drain();
    h.engine.tick(21);
    await drain();

    const t = track(h.engine);
    expect(t.chunks.has(0)).toBe(false);
    expect(t.chunks.get(1)).toBe(null); // empty markers are kept
    expect(t.scheduled.has(2)).toBe(true);
  });

  test('pause stops sources and re-anchoring plays again', async () => {
    const h = makeDeps();
    h.host.currentTime = ANCHOR_CTX;
    h.engine.attach(h.deps);
    h.engine.restartAt(0);
    for (let i = 0; i < 3; i++) {
      h.engine.tick(0);
      await drain();
    }

    const sourcesBefore = [...track(h.engine).scheduled.values()].map((s) => s.source);
    h.engine.pause();
    expect(h.engine.handles({ track: 1, selected: false })).toBe(false);
    expect(sourcesBefore.some((s) => s.stops.length > 0)).toBe(true);
    expect(track(h.engine).scheduled.size).toBe(0);

    h.host.currentTime = ANCHOR_CTX + 3;
    h.engine.restartAt(2);
    h.engine.tick(2);
    await drain();
    for (let i = 0; i < 2; i++) {
      h.engine.tick(2);
      await drain();
    }
    expect(h.engine.handles({ track: 1, selected: false })).toBe(true);
    expect(track(h.engine).scheduled.size).toBeGreaterThan(0);
  });

  test('track toggling ramps the per-track gain', () => {
    const h = makeDeps();
    h.host.currentTime = ANCHOR_CTX;
    h.engine.attach(h.deps);

    const g = track(h.engine).gain;
    h.engine.setTrackEnabled(1, false);
    expect(g.gain.first('set', ANCHOR_CTX)!.value).toBe(1);
    const down = g.gain.events.find((e: any) => e.type === 'lin');
    expect(down!.value).toBe(0);
    expect(down!.time).toBeCloseTo(ANCHOR_CTX + 0.15, 9);

    h.engine.setTrackEnabled(1, true);
    const ups = g.gain.events.filter((e: any) => e.type === 'lin');
    expect(ups[ups.length - 1].value).toBe(1);
  });

  test('a failed render degrades to the live-voice fallback', async () => {
    const h = makeDeps(null, true);
    h.host.currentTime = ANCHOR_CTX;
    h.engine.attach(h.deps);
    h.engine.restartAt(0);

    h.engine.tick(0);
    await drain();

    expect(h.engine.running).toBe(true);
    expect(h.engine.handles({ track: 1, selected: false })).toBe(false);
  });

  test('disabled tracks hold engine ownership but are not rendered', async () => {
    const h = makeDeps([noteAt(0)]);
    h.deps.tracks = [{ index: 1, enabled: false, notes: [noteAt(0)] }];
    h.host.currentTime = ANCHOR_CTX;
    h.engine.attach(h.deps);
    h.engine.restartAt(0);

    expect(h.engine.handles({ track: 1, selected: false })).toBe(true);
    for (let i = 0; i < 3; i++) {
      h.engine.tick(0);
      await drain();
    }

    expect(h.offlines.length).toBe(0);
  });
});

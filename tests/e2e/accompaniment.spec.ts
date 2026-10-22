// Accompaniment engine e2e: the streaming pre-render pipeline runs through
// a real browser (AudioContext + OfflineAudioContext). Game boot via
// bootGame keeps the tests engine-focused: no page errors across
// playthrough, seek, learn-mode freeze/resume, and mid-game track toggling.

import { test, expect, type Page } from '@playwright/test';
import {
  bootGame,
  expectPlayScreenActive,
  waitForResults,
  makeSong,
} from '../helpers/index.js';
import type { SongData } from '../helpers/song.js';

interface EngineState {
  running: boolean;
  paused: boolean;
  degraded: boolean;
  bgHandles: boolean;
  tracks: Array<{ index: number; enabled: boolean; chunkCount: number; scheduled: number; gain: number }>;
}

const EMPTY: EngineState = { running: false, paused: false, degraded: false, bgHandles: false, tracks: [] };

function playerNote(time: number, key: string, rawMidi: number): Record<string, unknown> {
  return { time, key, duration: 0.25, track: 0, channel: 0, program: 0, rawMidi };
}

function bgNote(time: number, duration = 0.25, rawMidi = 57): Record<string, unknown> {
  // A3 (rawMidi 57) over a distorted guitar program.
  return { time, key: 'A3', duration, track: 1, channel: 0, program: 29, rawMidi };
}

function makeAccompanimentSong(): SongData {
  const notes: Array<Record<string, unknown>> = [
    playerNote(1.0, 'C3', 48),
    playerNote(2.0, 'E3', 52),
  ];
  for (let t = 2.0; t <= 6.0; t += 0.1) {
    notes.push(bgNote(t, 0.2));
  }
  notes.push(bgNote(7.5, 0.5));
  notes.push(bgNote(8.0));

  return {
    ...makeSong([], 'Accompaniment E2E'),
    notes: notes as unknown as SongData['notes'],
    tracks: [
      { index: 0, name: 'Player', noteCount: 2 },
      { index: 1, name: 'Backing', noteCount: 2 },
    ],
    selectedTrackIndices: [0],
    backgroundTracks: [1],
  } as SongData;
}

async function engineState(page: Page): Promise<EngineState | null> {
  return page.evaluate(() => {
    const g = (window as any)._testGame;
    if (!g) return null;
    const e = g._accomp;
    return {
      running: e.running as boolean,
      paused: e._paused as boolean,
      degraded: e._degraded as boolean,
      bgHandles: e.handles({ track: 1, selected: false }) as boolean,
      tracks: e._tracks.map((t: any) => ({
        index: t.index as number,
        enabled: t.enabled as boolean,
        chunkCount: t.chunks.size as number,
        scheduled: t.scheduled.size as number,
        gain: t.gain.gain.value as number,
      })),
    };
  });
}

/** Poll an engine-state predicate until pass; returns the passing state. */
async function pollEngine(page: Page, predicate: (s: EngineState) => boolean, timeout = 10000): Promise<EngineState> {
  let last: EngineState = EMPTY;
  await expect(async () => {
    last = (await engineState(page)) ?? EMPTY;
    if (!predicate(last)) throw new Error('accompaniment state not ready');
  }).toPass({ timeout });
  return last;
}

function findBg(s: EngineState): EngineState['tracks'][number] {
  const bg = s.tracks.find((t) => t.index === 1);
  expect(bg).toBeTruthy();
  return bg!;
}

test.describe('Accompaniment engine', () => {
  test('streams pre-rendered buffers through a playthrough with a seek', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err: Error) => errors.push(err.message));

    await bootGame(page, makeAccompanimentSong());
    await expectPlayScreenActive(page);

    const engaged = await pollEngine(page, (s) =>
      s.running && !s.paused && !s.degraded && s.bgHandles
      && s.tracks.some((t) => t.index === 1 && t.scheduled > 0));
    const bg = findBg(engaged);
    expect(bg.enabled).toBe(true);
    expect(bg.gain).toBe(1);
    expect(bg.chunkCount).toBeGreaterThan(0);

    // Seek mid-song: the engine hard re-syncs (restartAt) and keeps
    // streaming without degrading.
    await page.evaluate(() => (window as any)._testGame.seekTo(3.0));
    const afterSeek = await pollEngine(page, (s) =>
      s.running && !s.paused && !s.degraded && s.bgHandles
      && s.tracks.some((t) => t.index === 1 && t.scheduled > 0));
    expect(findBg(afterSeek).scheduled).toBeGreaterThan(0);

    // Playback resolves past notes and flows to the results screen.
    await waitForResults(page);
    expect(errors).toEqual([]);
  });

  test('learn-mode freezes pause the stream and resolutions resume it', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err: Error) => errors.push(err.message));

    await bootGame(page, makeAccompanimentSong(), { learningMode: true });
    await expectPlayScreenActive(page);
    await pollEngine(page, (s) => s.running && s.bgHandles);

    // Game freezes at the first player note (song time 1.0); the stream
    // pauses (bgHandles false while paused).
    await pollEngine(page, (s) => s.paused && !s.bgHandles);

    // Resolving the note unfreezes playback; the stream plays again.
    await page.keyboard.press('KeyA');
    const resumed = await pollEngine(page, (s) => !s.paused && s.bgHandles);
    expect(resumed.degraded).toBe(false);

    // The second note (E3 at 2.0) freezes again; resolve it too — the song
    // then completes into the results screen.
    await pollEngine(page, (s) => s.paused && !s.bgHandles);
    await page.keyboard.press('KeyD');
    await waitForResults(page);
    expect(errors).toEqual([]);
  });

  test('mid-game track toggling ramps the per-track gain', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err: Error) => errors.push(err.message));

    await bootGame(page, makeAccompanimentSong());
    await expectPlayScreenActive(page);
    await pollEngine(page, (s) => s.running && s.bgHandles
      && s.tracks.some((t) => t.index === 1 && t.scheduled > 0));

    // The Tracks panel is only wired in the main.ts app flow; drive the
    // underlying Game API directly (what the panel toggle calls).
    await page.evaluate(() => (window as any)._testGame.setBackgroundTrack(1, false));
    await pollEngine(page, (s) => {
      const bg = s.tracks.find((t) => t.index === 1);
      return bg !== undefined && bg.gain <= 0.05;
    }, 5000);
    // Ownership stays with the engine even while muted.
    const muted = await engineState(page);
    expect(muted?.bgHandles).toBe(true);

    await page.evaluate(() => (window as any)._testGame.setBackgroundTrack(1, true));
    await pollEngine(page, (s) => {
      const bg = s.tracks.find((t) => t.index === 1);
      return bg !== undefined && bg.gain >= 0.95;
    }, 5000);

    expect(errors).toEqual([]);
  });
});

import { test, expect } from 'bun:test';
import { NoteGrade } from '../../../../frontend/src/game/scoring.ts';
import { NoteManager } from '../../../../frontend/src/game/NoteManager.ts';
import { NOTE_TO_LANE } from '../../../../frontend/src/utils/notes.ts';
import { makeSong } from '../../../helpers/song.js';

// NoteManager only reads the note fields these tests exercise; the SongData
// helper lacks TrackInfo extras that Song declares.
const load = (nm: NoteManager, notes: Array<{ time: number; key: string; duration: number }>): void => {
  nm.loadSong(makeSong(notes) as any);
};

const H = 800;

test('early press records a negative offset', () => {
  const nm = new NoteManager();
  load(nm, [
    { time: 2.0, key: 'C3', duration: 0.25 },
    { time: 5.0, key: 'E3', duration: 0.25 },
  ]);
  nm.update(1.9, H);
  const hit = nm.checkHit(1.9, NOTE_TO_LANE.get('C3')!);
  expect(hit).not.toBeNull();
  expect(hit!.result).toBe(NoteGrade.GOOD);
  // Pressed at 1.9s for a note at 2.0s = -100ms (early)
  expect(hit!.offsetMs).toBeLessThan(0);
});

test('on-time press records a zero offset', () => {
  const nm = new NoteManager();
  load(nm, [{ time: 2.0, key: 'C3', duration: 0.25 }]);
  nm.update(2.0, H);
  const hit = nm.checkHit(2.0, NOTE_TO_LANE.get('C3')!);
  expect(hit).not.toBeNull();
  expect(hit!.result).toBe(NoteGrade.PERFECT);
  expect(hit!.offsetMs).toBe(0);
});

test('recovered failing note does not double-record its offset', () => {
  const nm = new NoteManager();
  load(nm, [
    { time: 2.0, key: 'C3', duration: 1.0 },
    { time: 5.0, key: 'E3', duration: 0.25 },
  ]);
  const laneC = NOTE_TO_LANE.get('C3')!;
  const laneE = NOTE_TO_LANE.get('E3')!;

  nm.update(1.9, H);
  nm.checkHit(1.9, laneC);        // fresh hit, offset -100ms
  nm.checkRelease(2.05, laneC);   // drop early -> failing
  const recovered = nm.checkHit(2.2, laneC);
  expect(recovered).not.toBeNull();

  nm.update(4.95, H);
  nm.checkHit(5.0, laneE);        // fresh hit, offset 0ms

  // Only the two fresh hits count: (100 + 0) / 2 = 50
  expect(nm.scoring.getAverageOffsetMs()).toBe(50);
  expect(nm.scoring.getOffsetDirection()).toBe('early');
});

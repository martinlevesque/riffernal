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

test('resetFromTime clears gameplay state at/after the seek time; preserves played earlier notes', () => {
  const nm = new NoteManager();
  load(nm, [
    { time: 1.0, key: 'C3', duration: 0.25 },
    { time: 2.0, key: 'E3', duration: 0.25 },
    { time: 3.0, key: 'G3', duration: 0.25 },
  ]);
  nm.update(1.0, H);
  nm.checkHit(1.0, NOTE_TO_LANE.get('C3')!);
  nm.update(2.0, H);
  nm.checkHit(2.0, NOTE_TO_LANE.get('E3')!);
  nm.resetFromTime(2.0);

  expect(nm.notes[0].hit).toBe(true);
  expect(nm.notes[0].resolved).toBe(true);
  expect(nm.notes[1].hit).toBe(false);
  expect(nm.notes[1].resolved).toBe(false);
  expect(nm.notes[2].resolved).toBe(false);
  expect(nm.notes[2].activated).toBe(false);
  expect(nm.activeNotes).toHaveLength(0);
  expect(nm.isComplete()).toBe(false);
});

test('resetFromTime marks skipped earlier notes resolved so learning mode does not freeze on them', () => {
  const nm = new NoteManager();
  load(nm, [
    { time: 0.5, key: 'C3', duration: 0.25 },
    { time: 2.0, key: 'E3', duration: 0.25 },
    { time: 3.5, key: 'G3', duration: 0.25 },
  ]);
  nm.resetFromTime(2.0);

  expect(nm.notes[0].resolved).toBe(true);
  expect(nm.notes[0].hit).toBe(false);
  expect(nm.notes[0].activated).toBe(true);
  expect(nm.notes[1].resolved).toBe(false);
  expect(nm.notes[1].activated).toBe(false);
  expect(nm.notes[2].resolved).toBe(false);
  expect(nm.notes.filter(n => n.resolved)).toHaveLength(1);
  expect(nm.findNextUnplayedTime(0)).toBe(2.0);
});

test('findNearestNote returns closest note by time, restricted by staff', () => {
  const nm = new NoteManager();
  load(nm, [
    { time: 1.0, key: 'C3', duration: 0.25 },
    { time: 2.0, key: 'C5', duration: 0.25 },
    { time: 3.0, key: 'E3', duration: 0.25 },
  ]);
  expect(nm.findNearestNote(1.8)!.time).toBe(2.0);
  expect(nm.findNearestNote(2.2)!.time).toBe(2.0);
  expect(nm.findNearestNote(2.2, 'treble')!.time).toBe(2.0);
  expect(nm.findNearestNote(2.2, 'bass')!.time).toBe(3.0);
});

test('getLoopEffectiveEnd extends the wrap point to cover the last in-loop note tail', () => {
  const nm = new NoteManager();
  load(nm, [
    { time: 2.0, key: 'C3', duration: 1.0 },
    { time: 4.0, key: 'E3', duration: 0.25 },
  ]);
  expect(nm.getLoopEffectiveEnd(2.5)).toBeCloseTo(3.0, 5);
});

test('update with a loop end cutoff suppresses notes past the loop end during the tail-out', () => {
  const nm = new NoteManager();
  load(nm, [
    { time: 2.0, key: 'C3', duration: 1.0 },
    { time: 2.7, key: 'E3', duration: 0.25 },
    { time: 2.9, key: 'G3', duration: 0.25 },
  ]);
  nm.update(2.8, H, 2.5);

  expect(nm.notes[0].missed).toBe(true);
  expect(nm.notes[1].activated).toBe(false);
  expect(nm.notes[1].resolved).toBe(false);
  expect(nm.notes[1].autoPlayed).toBe(false);
  expect(nm.notes[2].activated).toBe(false);
  expect(nm.notes[2].resolved).toBe(false);
});

test('getEarliestWaitTime never freezes on a note past the loop end cutoff', () => {
  const nm = new NoteManager();
  load(nm, [
    { time: 2.0, key: 'C3', duration: 0.25 },
    { time: 2.6, key: 'E3', duration: 0.25 },
  ]);
  nm.learningMode = true;
  nm.update(1.5, H);
  nm.update(2.0, H);

  // Anchor freezes on the in-loop note at 2.0; commit it via the lane press.
  expect(nm.getEarliestWaitTime(2.0)).toBe(2.0);
  nm.checkLearningHit(2.0, NOTE_TO_LANE.get('C3')!);
  // Next unresolved note (2.6) is past the loop end 2.5: no freeze, so the
  // wrap can rewind once the in-loop tail drains.
  expect(nm.getEarliestWaitTime(3.0, 2.5)).toBe(null);
});

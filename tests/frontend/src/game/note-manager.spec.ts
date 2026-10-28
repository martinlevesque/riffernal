import { test, expect } from 'bun:test';
import { NoteGrade } from '../../../../frontend/src/game/scoring.ts';
import { NoteManager, type SongNote } from '../../../../frontend/src/game/NoteManager.ts';
import { NOTE_TO_LANE, PracticeHand } from '../../../../frontend/src/utils/notes.ts';
import { makeSong } from '../../../helpers/song.js';

// NoteManager only reads the note fields these tests exercise; the SongData
// helper lacks TrackInfo extras that Song declares.
const load = (nm: NoteManager, notes: Array<{ time: number; key: string; duration: number }>): void => {
  nm.loadSong(makeSong(notes) as any);
};

const H = 800;

// -- hit timing ---------------------------------------------------------------

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

// -- loop boundary: getLoopEffectiveEnd ---------------------------------------

test('getLoopEffectiveEnd returns the loop end with no notes up to it', () => {
  const nm = new NoteManager();
  load(nm, [{ time: 10.0, key: 'C3', duration: 0.5 }]);
  expect(nm.getLoopEffectiveEnd(5)).toBe(5);
});

test('getLoopEffectiveEnd follows a note ending past the loop end', () => {
  const nm = new NoteManager();
  load(nm, [
    { time: 2.0, key: 'C3', duration: 0.5 },
    { time: 4.0, key: 'E3', duration: 2.0 },
    { time: 8.0, key: 'G3', duration: 0.5 },
  ]);
  expect(nm.getLoopEffectiveEnd(5.5)).toBe(6.0);
  expect(nm.getLoopEffectiveEnd(3.0)).toBe(3.0);
});

test('getLoopEffectiveEnd follows a long note past the loop end', () => {
  const nm = new NoteManager();
  load(nm, [
    { time: 2.0, key: 'C3', duration: 10.0 },
    { time: 12.0, key: 'E3', duration: 0.25 },
  ]);
  expect(nm.getLoopEffectiveEnd(4.0)).toBe(12.0);
});

test('getLoopEffectiveEnd returns the end for an empty song', () => {
  const nm = new NoteManager();
  load(nm, []);
  expect(nm.getLoopEffectiveEnd(3)).toBe(3);
});

// -- loop boundary: findLoopTrimEnd -------------------------------------------

test('findLoopTrimEnd returns the previous note start as the new loop end', () => {
  const nm = new NoteManager();
  load(nm, [
    { time: 1.0, key: 'C3', duration: 0.25 },
    { time: 2.0, key: 'E3', duration: 0.25 },
    { time: 3.0, key: 'G3', duration: 0.25 },
  ]);
  expect(nm.findLoopTrimEnd(1.0, 3.0)).toBe(2.0);
  // An end between notes snaps to the previous note start.
  expect(nm.findLoopTrimEnd(0.0, 2.5)).toBe(1.0);
});

test('findLoopTrimEnd counts a chord (same-time notes) as one note', () => {
  const nm = new NoteManager();
  load(nm, [
    { time: 1.0, key: 'C3', duration: 0.25 },
    { time: 2.0, key: 'E3', duration: 0.25 },
    { time: 3.0, key: 'G3', duration: 0.25 },
    { time: 3.0, key: 'A3', duration: 0.25 },
  ]);
  expect(nm.findLoopTrimEnd(1.0, 3.0)).toBe(2.0);
});

test('findLoopTrimEnd counts resolved notes', () => {
  const nm = new NoteManager();
  load(nm, [
    { time: 1.0, key: 'C3', duration: 0.25 },
    { time: 2.0, key: 'E3', duration: 0.25 },
    { time: 3.0, key: 'G3', duration: 0.25 },
  ]);
  // First two notes were learned out before the loop was extended:
  // trimming must still undo the extension.
  nm.notes[0].resolved = true;
  nm.notes[1].resolved = true;
  expect(nm.findLoopTrimEnd(1.0, 3.0)).toBe(2.0);
});

test('findLoopTrimEnd ignores notes outside the loop span', () => {
  const nm = new NoteManager();
  load(nm, [
    { time: 0.5, key: 'C3', duration: 0.25 },
    { time: 1.0, key: 'E3', duration: 0.25 },
    { time: 2.0, key: 'G3', duration: 0.25 },
    { time: 3.0, key: 'A3', duration: 0.25 },
  ]);
  expect(nm.findLoopTrimEnd(1.0, 3.0)).toBe(2.0);
});

test('findLoopTrimEnd returns null when the trim would hit the start or leave a single covered note', () => {
  const nm = new NoteManager();
  load(nm, [
    { time: 1.0, key: 'C3', duration: 0.25 },
    { time: 2.0, key: 'E3', duration: 0.25 },
    { time: 3.0, key: 'G3', duration: 0.25 },
  ]);
  // Loop [1, 2] covers notes 1 and 2: the previous covered note is at
  // startTime, and a one-note loop ([start, start]) is not a legal
  // loop — so trimming must not move the end below the second note.
  expect(nm.findLoopTrimEnd(1.0, 2.0)).toBeNull();
  // Loop [1, 1.5] covers only its start note — nothing to remove.
  expect(nm.findLoopTrimEnd(1.0, 1.5)).toBeNull();
});

test('findLoopTrimEnd shrinks one note per trim until a two-note loop cannot shrink further', () => {
  const nm = new NoteManager();
  load(nm, [
    { time: 1.0, key: 'C3', duration: 0.25 },
    { time: 2.0, key: 'E3', duration: 0.25 },
    { time: 3.0, key: 'G3', duration: 0.25 },
    { time: 4.0, key: 'A3', duration: 0.25 },
  ]);
  const seen = [4.0];
  let endTime = nm.findLoopTrimEnd(1.0, 4.0);

  while (endTime !== null) {
    seen.push(endTime);
    endTime = nm.findLoopTrimEnd(1.0, endTime);
  }

  expect(seen).toEqual([4.0, 3.0, 2.0]);
});

test('findLoopTrimEnd skips auto-played notes from the other practice hand', () => {
  const nm = new NoteManager();
  load(nm, [
    { time: 1.0, key: 'C2', duration: 0.25 },
    { time: 2.0, key: 'E2', duration: 0.25 },
    { time: 3.0, key: 'C5', duration: 0.25 },
  ]);
  nm.learningMode = true;
  nm.practiceHand = PracticeHand.Left;
  // C5 belongs to the right hand, so it is auto-played and never a
  // trim candidate: the end snaps past it, not onto it.
  expect(nm.findLoopTrimEnd(0.5, 3.0)).toBe(1.0);
});

// -- loop boundary: findNextUnplayedTime / findNextPlayerNoteTime -------------

test('findNextUnplayedTime returns the next unresolved player note', () => {
  const nm = new NoteManager();
  load(nm, [
    { time: 1.0, key: 'C3', duration: 0.25 },
    { time: 4.0, key: 'E3', duration: 0.25 },
    { time: 6.0, key: 'G3', duration: 0.25 },
  ]);
  expect(nm.findNextUnplayedTime(2.0)).toBe(4.0);
  expect(nm.findNextUnplayedTime(4.0)).toBe(6.0);
  expect(nm.findNextUnplayedTime(6.0)).toBeNull();
});

test('findNextUnplayedTime skips resolved notes', () => {
  const nm = new NoteManager();
  load(nm, [
    { time: 1.0, key: 'C3', duration: 0.25 },
    { time: 4.0, key: 'E3', duration: 0.25 },
    { time: 6.0, key: 'G3', duration: 0.25 },
  ]);
  nm.update(4.0, H);
  nm.checkHit(4.0, NOTE_TO_LANE.get('E3')!);
  expect(nm.findNextUnplayedTime(2.0)).toBe(6.0);
});

test('findNextPlayerNoteTime counts resolved notes', () => {
  // Loops [0-3] and [10-15]; the note at 8 sits between them and was
  // already played. Extending the first loop must still land on it.
  const nm = new NoteManager();
  load(nm, [
    { time: 5.0, key: 'C3', duration: 0.25 },
    { time: 6.0, key: 'E3', duration: 0.25 },
    { time: 8.0, key: 'G3', duration: 0.25 },
    { time: 11.0, key: 'A3', duration: 0.25 },
  ]);
  nm.update(8.0, H);
  nm.checkHit(8.0, NOTE_TO_LANE.get('G3')!);
  expect(nm.findNextPlayerNoteTime(7.0)).toBe(8.0);
  expect(nm.findNextPlayerNoteTime(8.0)).toBe(11.0);
});

test('findNextPlayerNoteTime never returns a note at or past the cap', () => {
  const nm = new NoteManager();
  load(nm, [
    { time: 1.0, key: 'C3', duration: 0.25 },
    { time: 6.0, key: 'G3', duration: 0.25 },
  ]);
  expect(nm.findNextPlayerNoteTime(2.0)).toBe(6.0);
  // Cap is the next loop's start (5.0), exclusive.
  expect(nm.findNextPlayerNoteTime(2.0, 5.0)).toBeNull();
});

test('findNextPlayerNoteTime still finds notes before the cap', () => {
  const nm = new NoteManager();
  load(nm, [
    { time: 1.0, key: 'C3', duration: 0.25 },
    { time: 4.0, key: 'E3', duration: 0.25 },
    { time: 6.0, key: 'G3', duration: 0.25 },
  ]);
  expect(nm.findNextPlayerNoteTime(2.0, 5.0)).toBe(4.0);
});

test('findNextPlayerNoteTime skips auto-played notes from the other practice hand', () => {
  const nm = new NoteManager();
  load(nm, [
    { time: 1.0, key: 'C3', duration: 0.25 },
    { time: 4.0, key: 'C5', duration: 0.25 },
    { time: 6.0, key: 'E3', duration: 0.25 },
  ]);
  nm.learningMode = true;
  nm.practiceHand = PracticeHand.Left;
  expect(nm.findNextPlayerNoteTime(2.0)).toBe(6.0);
});

// -- loop boundary: findLoopBoundaryNotes --------------------------------------

test('findLoopBoundaryNotes returns the new last note on trim', () => {
  const nm = new NoteManager();
  load(nm, [
    { time: 1.0, key: 'C3', duration: 0.25 },
    { time: 2.0, key: 'E3', duration: 0.25 },
    { time: 3.0, key: 'G3', duration: 0.25 },
  ]);
  // Trim [1, 3] to [1, 2]: the loop now ends on the note at 2.
  const notes = nm.findLoopBoundaryNotes(3.0, 2.0, null);
  expect(notes.map((n) => n.key)).toEqual(['E3']);
});

test('findLoopBoundaryNotes returns every note of the trimmed-to chord', () => {
  const nm = new NoteManager();
  load(nm, [
    { time: 1.0, key: 'C3', duration: 0.25 },
    { time: 2.0, key: 'E3', duration: 0.25 },
    { time: 2.0, key: 'G3', duration: 0.25 },
    { time: 3.0, key: 'A3', duration: 0.25 },
  ]);
  const notes = nm.findLoopBoundaryNotes(3.0, 2.0, null);
  expect(notes.map((n) => n.key).sort()).toEqual(['E3', 'G3']);
});

test('findLoopBoundaryNotes includes a coinciding background note in the trimmed chord', () => {
  const nm = new NoteManager();
  load(nm, [
    { time: 1.0, key: 'C3', duration: 0.25 },
    { time: 2.0, key: 'E3', duration: 0.25 },
    { time: 2.0, key: 'A2', duration: 0.25 },
    { time: 3.0, key: 'G3', duration: 0.25 },
  ]);
  // A2 rides along with the player note at the boundary — the preview
  // sounds the full chord, like gameplay would.
  nm.notes[2].selected = false;
  const notes = nm.findLoopBoundaryNotes(3.0, 2.0, null);
  expect(notes.map((n) => n.key).sort()).toEqual(['A2', 'E3']);
});

test('findLoopBoundaryNotes returns the newly added chord on extend', () => {
  const nm = new NoteManager();
  load(nm, [
    { time: 1.0, key: 'C3', duration: 0.25 },
    { time: 4.0, key: 'E3', duration: 0.25 },
    { time: 4.0, key: 'A2', duration: 0.25 },
  ]);
  // Extend [0, 1] to [0, 4]: the added moment is the full chord at 4.
  nm.notes[2].selected = false;
  const notes = nm.findLoopBoundaryNotes(1.0, 4.0, null);
  expect(notes.map((n) => n.key).sort()).toEqual(['A2', 'E3']);
});

test('findLoopBoundaryNotes is silent when an extend only closed the gap to the next loop', () => {
  const nm = new NoteManager();
  load(nm, [
    { time: 1.0, key: 'C3', duration: 0.25 },
    { time: 5.0, key: 'E3', duration: 0.25 },
  ]);
  // The end moved to the next loop's start (5): the note at 5 belongs to
  // the next loop, so nothing new was added to play.
  expect(nm.findLoopBoundaryNotes(1.0, 5.0, 5.0)).toEqual([]);
});

test('findLoopBoundaryNotes skips auto-played notes from the other practice hand on extend', () => {
  const nm = new NoteManager();
  load(nm, [
    { time: 1.0, key: 'C3', duration: 0.25 },
    { time: 4.0, key: 'C5', duration: 0.25 },
    { time: 6.0, key: 'E3', duration: 0.25 },
  ]);
  nm.learningMode = true;
  nm.practiceHand = PracticeHand.Left;
  // Extending lands on the left-hand note at 6, skipping the auto-played C5.
  const notes = nm.findLoopBoundaryNotes(1.0, 6.0, null);
  expect(notes.map((n) => n.key)).toEqual(['E3']);
});

test('findLoopBoundaryNotes counts resolved notes on extend', () => {
  const nm = new NoteManager();
  load(nm, [
    { time: 1.0, key: 'C3', duration: 0.25 },
    { time: 4.0, key: 'E3', duration: 0.25 },
  ]);
  // The added note was already learned — extending must still sound it.
  nm.notes[1].resolved = true;
  const notes = nm.findLoopBoundaryNotes(1.0, 4.0, null);
  expect(notes.map((n) => n.key)).toEqual(['E3']);
});

// -- auto-play schedule-ahead --------------------------------------------------
// Background voices are handed to the synth slightly ahead of their audible
// time (on the audio clock) so dense multi-track sections never burst voice
// creation into a late frame. State transitions still happen at due time.

const loadWithBg = (
  nm: NoteManager,
  notes: Array<{ time: number; key: string; duration: number; track: number }>,
  background: number[],
): void => {
  const song = makeSong(notes) as any;
  song.tracks = [
    { index: 0, name: 'Player', noteCount: 0 },
    { index: 1, name: 'Bg', noteCount: 0 },
  ];
  song.selectedTrackIndices = [0];
  song.backgroundTracks = background;
  nm.loadSong(song);
};

test('auto-play note is handed to the synth ahead of its due time, exactly once', () => {
  const nm = new NoteManager();
  loadWithBg(nm, [
    { time: 1.0, key: 'C3', duration: 0.25, track: 0 },
    { time: 3.0, key: 'A2', duration: 0.25, track: 1 },
  ], [1]);
  const scheduled: SongNote[] = [];
  let firedOn = 0;
  nm.onAutoPlaySchedule = (n) => scheduled.push(n);
  nm.onAutoPlayOn = () => { firedOn++; };

  nm.update(2.7, H); // 0.3s ahead: outside the schedule window
  expect(scheduled).toHaveLength(0);

  nm.update(2.85, H); // 0.15s ahead: within the schedule window
  expect(scheduled).toHaveLength(1);
  expect(scheduled[0].key).toBe('A2');
  expect(scheduled[0].audioScheduled).toBe(true);
  // State transition has not happened yet — the note is not due.
  expect(nm.notes[1].autoPlayed).toBe(false);

  nm.update(2.95, H); // already scheduled — no rebuild
  expect(scheduled).toHaveLength(1);

  nm.update(3.0, H); // due now: state transition fires once
  expect(firedOn).toBe(1);
  expect(nm.notes[1].autoPlayed).toBe(true);
  expect(nm.notes[1].resolved).toBe(true);
  expect(scheduled).toHaveLength(1);
});

test('no schedule-ahead while learn-mode freeze holds the clock', () => {
  const nm = new NoteManager();
  loadWithBg(nm, [
    { time: 1.0, key: 'C3', duration: 0.25, track: 0 }, // left hand: the practiced hand
    { time: 1.1, key: 'A2', duration: 0.25, track: 1 }, // background track
  ], [1]);
  nm.learningMode = true;
  nm.practiceHand = PracticeHand.Left;
  const scheduled: SongNote[] = [];
  nm.onAutoPlaySchedule = (n) => scheduled.push(n);

  nm.getEarliestWaitTime(1.0); // pins the wait at the player note (1.0)
  nm.update(1.0, H); // frozen: the 1.1 background note must not schedule early
  expect(scheduled).toHaveLength(0);

  nm.checkLearningHit(1.0, NOTE_TO_LANE.get('C3')!); // wait resolves
  nm.update(1.02, H); // clock resumed: background note schedules now
  expect(scheduled).toHaveLength(1);
});

test('resetFromTime clears audioScheduled so a seek replays background notes', () => {
  const nm = new NoteManager();
  loadWithBg(nm, [
    { time: 1.0, key: 'C3', duration: 0.25, track: 0 },
    { time: 3.0, key: 'A2', duration: 0.25, track: 1 },
  ], [1]);
  const scheduled: SongNote[] = [];
  nm.onAutoPlaySchedule = (n) => scheduled.push(n);

  nm.update(2.9, H);
  expect(scheduled).toHaveLength(1);
  expect(nm.notes[1].audioScheduled).toBe(true);

  nm.resetFromTime(1.5);
  expect(nm.notes[1].audioScheduled).toBe(false);

  nm.update(2.85, H);
  expect(scheduled).toHaveLength(2);
});

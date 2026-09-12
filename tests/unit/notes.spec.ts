import { test, expect } from 'bun:test';
import { NOTE_NAMES, getPianoKeyLayout, getVisibleRange, snapRangeToWhiteKeys } from '../../frontend/src/utils/notes.ts';

test('snapRangeToWhiteKeys expands black-key boundaries to their white neighbors', () => {
  expect(snapRangeToWhiteKeys({ minNoteIdx: 16, maxNoteIdx: 73 })).toEqual({ minNoteIdx: 15, maxNoteIdx: 74 });
});

test('snapRangeToWhiteKeys leaves white-key boundaries unchanged', () => {
  expect(snapRangeToWhiteKeys({ minNoteIdx: 15, maxNoteIdx: 74 })).toEqual({ minNoteIdx: 15, maxNoteIdx: 74 });
});

test('snapRangeToWhiteKeys clamps at the piano extremes', () => {
  expect(snapRangeToWhiteKeys({ minNoteIdx: 1, maxNoteIdx: 87 })).toEqual({ minNoteIdx: 0, maxNoteIdx: 87 });
});

test('snapRangeToWhiteKeys expands a single black key on both sides', () => {
  const range = snapRangeToWhiteKeys({ minNoteIdx: 16, maxNoteIdx: 16 });
  expect(NOTE_NAMES[range.minNoteIdx]).toBe('C2');
  expect(NOTE_NAMES[range.maxNoteIdx]).toBe('D2');
});

test('getVisibleRange snaps black-key extremes to white keys', () => {
  const range = getVisibleRange(['C#2', 'E4', 'A#6'])!;
  expect(NOTE_NAMES[range.minNoteIdx]).toBe('C2');
  expect(NOTE_NAMES[range.maxNoteIdx]).toBe('B6');
});

test('getVisibleRange returns an exact range for a single white note', () => {
  expect(getVisibleRange(['E4'])).toEqual({ minNoteIdx: 43, maxNoteIdx: 43 });
});

test('every note within a snapped range lays out fully on screen', () => {
  const width = 960;
  for (const noteNames of [['C#2', 'A#6'], ['A#0', 'G#7'], ['F#3'], ['A0', 'C8']]) {
    const range = getVisibleRange(noteNames)!;
    for (let lane = range.minNoteIdx; lane <= range.maxNoteIdx; lane++) {
      const { x, width: w } = getPianoKeyLayout(NOTE_NAMES[lane], width, range);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x + w).toBeLessThanOrEqual(width);
    }
  }
});

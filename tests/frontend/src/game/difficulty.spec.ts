import { test, expect } from 'bun:test';
import {
  DIFFICULTY_LEVELS,
  DEFAULT_DIFFICULTY,
  estimateSongDifficulty,
  filterPlayableNotes,
  isDifficulty,
} from '../../../../frontend/src/game/difficulty.ts';

const sparse = [0, 4, 8, 12].map((time) => ({ time, key: 'C4', duration: 1 }));

const dense = Array.from({ length: 40 }, (_, i) => ({
  time: i * 0.05,
  key: 'C4',
  duration: 0.05,
}));

test('estimateSongDifficulty buckets sparse, medium, and dense songs', () => {
  expect(estimateSongDifficulty(sparse, null, false)).toBe('easy');
  expect(estimateSongDifficulty(dense, null, false)).toBe('hard');
});

test('estimateSongDifficulty falls back to the default for unusable notes', () => {
  expect(estimateSongDifficulty([], null, false)).toBe(DEFAULT_DIFFICULTY);
  expect(estimateSongDifficulty([{ time: NaN }], null, false)).toBe(DEFAULT_DIFFICULTY);
});

test('filterPlayableNotes keeps everything without track info', () => {
  expect(filterPlayableNotes(sparse, [0], false)).toEqual(sparse);
  expect(filterPlayableNotes(sparse, null, false)).toEqual(sparse);
});

test('filterPlayableNotes keeps everything on an empty selection', () => {
  expect(filterPlayableNotes(sparse, [], true)).toEqual(sparse);
});

test('filterPlayableNotes keeps only the selected tracks', () => {
  const notes = [
    ...sparse.map((n) => ({ ...n, track: 0 })),
    ...dense.map((n) => ({ ...n, track: 1 })),
  ];

  expect(filterPlayableNotes(notes, [0], true)).toEqual(notes.filter((n) => n.track === 0));
  expect(filterPlayableNotes(notes, [1], true)).toEqual(notes.filter((n) => n.track === 1));
});

test('filterPlayableNotes defaults an untracked note to track 0', () => {
  const untracked = { time: 0, key: 'C4', duration: 1 };
  expect(filterPlayableNotes([untracked], [0], true)).toEqual([untracked]);
  expect(filterPlayableNotes([untracked], [1], true)).toEqual([]);
});

test('estimateSongDifficulty ignores background tracks with track info', () => {
  const notes = [
    ...sparse.map((n) => ({ ...n, track: 0 })),
    ...dense.map((n) => ({ ...n, track: 1 })),
  ];

  expect(estimateSongDifficulty(notes, [0], true)).toBe('easy');
  expect(estimateSongDifficulty(notes, [1], true)).toBe('hard');
  expect(estimateSongDifficulty(notes, [], true)).toBe('hard');
});

test('estimateSongDifficulty discounts repeated chord shapes', () => {
  // Two 3-note triads per second: chord members add fractional weight, so
  // pop/rock triad songs do not rate medium on raw note count alone.
  const triads = Array.from({ length: 40 }, (_, i) => [
    { time: i * 0.5, key: 'C4', duration: 0.4 },
    { time: i * 0.5, key: 'E4', duration: 0.4 },
    { time: i * 0.5, key: 'G4', duration: 0.4 },
  ]).flat();

  expect(estimateSongDifficulty(triads, null, false)).toBe('easy');
});

test('difficulty constants list the three playable levels', () => {
  expect([...DIFFICULTY_LEVELS]).toEqual(['easy', 'medium', 'hard']);
  expect(isDifficulty('medium')).toBe(true);
  expect(isDifficulty('insane')).toBe(false);
});

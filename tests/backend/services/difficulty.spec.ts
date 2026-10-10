import { test, expect } from "bun:test";
import {
  DEFAULT_DIFFICULTY,
  DIFFICULTY_LEVELS,
  estimateSongDifficulty,
  estimateDifficulty,
  filterPlayableNotes,
  isDifficulty,
  type NoteTiming,
} from "../../../backend/services/difficulty.ts";

/** One note every `spacing` seconds, singles, lasting as long as they ring. */
function stream(count: number, spacing: number): NoteTiming[] {
  return Array.from({ length: count }, (_, i) => ({
    time: i * spacing,
    duration: Math.min(spacing, 0.5),
  }));
}

/** `size` simultaneous notes at every step. */
function chords(count: number, spacing: number, size: number): NoteTiming[] {
  const steps = Array.from({ length: count }, (_, i) => {
    const time = i * spacing;
    return Array.from({ length: size }, () => ({
      time,
      duration: Math.min(spacing, 0.5),
    }));
  });
  return steps.flat();
}

test("levels are exactly the three playable buckets and the default is medium", () => {
  expect([...DIFFICULTY_LEVELS]).toEqual(["easy", "medium", "hard"]);
  expect(DEFAULT_DIFFICULTY).toBe("medium");
  for (const level of DIFFICULTY_LEVELS) {
    expect(isDifficulty(level)).toBe(true);
  }
  expect(isDifficulty("auto")).toBe(false);
  expect(isDifficulty("insane")).toBe(false);
  expect(isDifficulty(3)).toBe(false);
});

test("estimateDifficulty ignores unusable notes and falls back to the default", () => {
  expect(estimateDifficulty([])).toBe(DEFAULT_DIFFICULTY);
  expect(estimateDifficulty([{ time: NaN }, { time: Infinity }])).toBe(DEFAULT_DIFFICULTY);
  expect(estimateDifficulty(["not a note" as unknown as NoteTiming])).toBe(DEFAULT_DIFFICULTY);
  expect(estimateDifficulty([{ time: 0, duration: 0.2 }])).toBe("easy");
});

test("sparse songs are easy and dense single-note streams are hard", () => {
  // 4 singles over ~13 s: well under the easy threshold.
  expect(estimateDifficulty(stream(4, 4))).toBe("easy");

  // One note every 0.1 s for 3 s ≈ 10-11 effective presses/s.
  expect(estimateDifficulty(stream(30, 0.1))).toBe("hard");
});

test("a steady stream lands medium between the two thresholds", () => {
  // 16ths at 100 BPM ≈ 6.7 singles/s: real work, not a stream wall.
  expect(estimateDifficulty(stream(27, 0.15))).toBe("medium");
});

test("short songs measure against the 1 s span floor", () => {
  // 3 singles inside 0.2 s: the span floor keeps the rate honest (3/s).
  expect(estimateDifficulty([
    { time: 0, duration: 0.05 },
    { time: 0.1, duration: 0.05 },
    { time: 0.2, duration: 0.05 },
  ])).toBe("easy");
});

test("isolated fills do not lift an otherwise sparse song", () => {
  // Six notes as one burst plus two lone notes across ~60 s: the mean keeps
  // the peak in check.
  const notes: NoteTiming[] = [
    { time: 0, duration: 0.2 },
    { time: 0.1, duration: 0.2 },
    { time: 0.2, duration: 0.2 },
    { time: 0.3, duration: 0.2 },
    { time: 0.4, duration: 0.2 },
    { time: 0.5, duration: 0.2 },
    { time: 60, duration: 1 },
    { time: 62, duration: 1 },
  ];
  expect(estimateDifficulty(notes)).toBe("easy");
});

test("repeated chord shapes are discounted, so triad-pop stays easy", () => {
  // Two 3-note triads per second for 20 s: raw count is 120 notes but the
  // shape repeats, so extra chord members weigh less than full presses.
  expect(estimateDifficulty(chords(40, 0.5, 3))).toBe("easy");
});

test("chord walls disqualify themselves from the easy bucket", () => {
  // Eight simultaneous notes every 16th at 120 BPM: positions 4/s but chords
  // of 8, far past the hard line even discounted.
  expect(estimateDifficulty(chords(64, 0.25, 8))).toBe("hard");
});

test("chordjacks that rely on members alone stay mid-scale", () => {
  // Two simultaneous notes every 0.25 s: 4 positions/s ≈ 6 weighted/s.
  expect(estimateDifficulty(chords(16, 0.25, 2))).toBe("medium");
});

test("filterPlayableNotes mirrors the game: no track info or empty selection means everything plays", () => {
  const notes = stream(3, 1).map((n) => ({ ...n, track: 1 }));

  expect(filterPlayableNotes(notes, null, false)).toEqual(notes);
  expect(filterPlayableNotes(notes, [], true)).toEqual(notes);
});

test("filterPlayableNotes keeps only the selected tracks and defaults untracked notes to track 0", () => {
  const left = stream(2, 1).map((n) => ({ ...n, track: 0 }));
  const right = stream(2, 1).map((n) => ({ ...n, track: 1 }));
  const untracked = { time: 5, duration: 1 };

  expect(filterPlayableNotes([...left, ...right, untracked], [1], true)).toEqual(right);

  const onlyUntracked = [untracked];
  expect(filterPlayableNotes(onlyUntracked, [0], true)).toEqual(onlyUntracked);
  expect(filterPlayableNotes(onlyUntracked, [3], true)).toEqual([]);
});

test("estimateSongDifficulty rates on the selection, not the file", () => {
  // Same file: selecting the busy accompaniment is harder than the melody.
  const melody = stream(4, 1).map((n) => ({ ...n, track: 0 }));
  const busyActor = stream(30, 0.1).map((n) => ({ ...n, track: 1 }));
  const notes = [...melody, ...busyActor];

  expect(estimateSongDifficulty(notes, [0], true)).toBe("easy");
  expect(estimateSongDifficulty(notes, [1], true)).toBe("hard");
  // An empty selection plays everything: the dense line wins the blend.
  expect(estimateSongDifficulty(notes, [], true)).toBe("hard");
});

test("estimateSongDifficulty tolerates malformed track blobs", () => {
  // hasTrackInfo=false route with garbage selection is just "everything".
  expect(estimateSongDifficulty(stream(3, 2), [0], false)).toBe("easy");
});

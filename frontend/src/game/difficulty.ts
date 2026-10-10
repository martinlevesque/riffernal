export const DIFFICULTY_LEVELS = ["easy", "medium", "hard"] as const;

export type Difficulty = (typeof DIFFICULTY_LEVELS)[number];

export const DEFAULT_DIFFICULTY: Difficulty = "medium";

export function isDifficulty(value: unknown): value is Difficulty {
  return typeof value === "string" && (DIFFICULTY_LEVELS as readonly string[]).includes(value);
}

/** Minimal note shape needed by the estimator (time/duration in seconds). */
export interface NoteTiming {
  time: number;
  duration?: number;
  track?: number;
}

/** Must stay in sync with backend/services/difficulty.ts — the backend is
 *  authoritative, this mirror only prefills the import picker. */
const EASY_MAX_NPS = 5;
const HARD_MIN_NPS = 9;
/** Half-open [t, t+1) peak window — mirrors the backend. */
const PEAK_WINDOW_SECONDS = 1;
const PEAK_WEIGHT = 0.5;
const CHORD_EXTRA_WEIGHT = 0.5;

/** Which uploaded notes the player actually plays, mirroring
 *  NoteManager.loadSong: without track info everything is playable; an
 *  empty selection also means everything; otherwise only the selected
 *  tracks (missing track defaults to 0). Background tracks are audio-only
 *  and must not inflate the difficulty. */
export function filterPlayableNotes(
  notes: readonly NoteTiming[],
  selectedTrackIndices: readonly number[] | null,
  hasTrackInfo: boolean,
): NoteTiming[] {
  if (!hasTrackInfo || !selectedTrackIndices || selectedTrackIndices.length === 0) {
    return [...notes];
  }

  const selected = new Set(selectedTrackIndices);
  return notes.filter((note) => selected.has(note.track ?? 0));
}

/** Mirrored copy of the backend difficulty estimator: filters to the
 *  playable notes first, then blends whole-song notes-per-second with the
 *  densest 1s burst and buckets the result. */
export function estimateSongDifficulty(
  notes: readonly NoteTiming[],
  selectedTrackIndices: readonly number[] | null,
  hasTrackInfo: boolean,
): Difficulty {
  return estimateDifficulty(filterPlayableNotes(notes, selectedTrackIndices, hasTrackInfo));
}

function estimateDifficulty(notes: readonly NoteTiming[]): Difficulty {
  const onsets = notes
    .map((note) => note?.time)
    .filter((time) => typeof time === "number" && Number.isFinite(time))
    .sort((a, b) => a - b);

  if (onsets.length === 0) {
    return DEFAULT_DIFFICULTY;
  }

  const lastEnd = notes.reduce((latest, note) => {
    const end =
      typeof note?.duration === "number" && Number.isFinite(note.duration)
        ? note.time + note.duration
        : note.time;
    return Number.isFinite(end) && end > latest ? end : latest;
  }, onsets[0]);

  const span = Math.max(lastEnd - onsets[0], PEAK_WINDOW_SECONDS);
  const weights = clusterWeights(onsets);
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  const meanNps = totalWeight / span;
  const peakNps = peakOnsetsPerSecond(onsets, weights);
  const pressure = PEAK_WEIGHT * peakNps + (1 - PEAK_WEIGHT) * meanNps;

  if (pressure < EASY_MAX_NPS) {
    return "easy";
  }

  return pressure > HARD_MIN_NPS ? "hard" : "medium";
}

function clusterWeights(sortedOnsets: number[]): number[] {
  const weights: number[] = [];
  let prevTime = NaN;

  for (let i = 0; i < sortedOnsets.length; i++) {
    weights.push(sortedOnsets[i] === prevTime ? CHORD_EXTRA_WEIGHT : 1);
    prevTime = sortedOnsets[i];
  }

  return weights;
}

function peakOnsetsPerSecond(sortedOnsets: number[], weights: number[]): number {
  const prefix = [0];

  for (let i = 0; i < weights.length; i++) {
    prefix.push(prefix[i] + weights[i]);
  }

  let peak = 0;
  let end = 0;

  for (let i = 0; i < sortedOnsets.length; i++) {
    const windowEnd = sortedOnsets[i] + PEAK_WINDOW_SECONDS;

    while (end < sortedOnsets.length && sortedOnsets[end] < windowEnd) {
      end++;
    }

    const count = prefix[end] - prefix[i];

    if (count > peak) {
      peak = count;
    }
  }

  return peak;
}

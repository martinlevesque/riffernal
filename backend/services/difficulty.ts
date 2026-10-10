export const DIFFICULTY_LEVELS = ["easy", "medium", "hard"] as const;

/** API sentinel for "estimate instead of picking a level"; modeled here so
 *  the controller policy and the model resolution share one definition. */
export const AUTO_DIFFICULTY = "auto";

export type Difficulty = (typeof DIFFICULTY_LEVELS)[number];

export const DEFAULT_DIFFICULTY: Difficulty = "medium";

export function isDifficulty(value: unknown): value is Difficulty {
  return typeof value === "string" && (DIFFICULTY_LEVELS as readonly string[]).includes(value);
}

/** Minimal note shape needed by the estimator; matches the JSON notes
 *  blob (time/duration in seconds). */
export interface NoteTiming {
  time: number;
  duration?: number;
  track?: number;
}

/** Which of the uploaded notes the player actually plays, mirroring
 *  NoteManager.loadSong: without track info everything is playable;
 *  an empty selection also means everything; otherwise only the selected
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

/** Estimate the difficulty from the notes the player will actually play:
 *  see {@link filterPlayableNotes} for how the playable subset is picked
 *  from `selectedTrackIndices`. */
export function estimateSongDifficulty(
  notes: readonly NoteTiming[],
  selectedTrackIndices: readonly number[] | null,
  hasTrackInfo: boolean,
): Difficulty {
  return estimateDifficulty(filterPlayableNotes(notes, selectedTrackIndices, hasTrackInfo));
}

/** Pressure thresholds on the blended weighted-density metric: below
 *  EASY_MAX_NPS is easy, above HARD_MIN_NPS is hard, between is medium.
 *  Calibrated so steady chord-heavy pop/rock (repeated triads at a
 *  moderate position rate ≈ 4 effective presses per second) stays easy,
 *  melodic 8th-note lines land medium, and real run/stream density rates
 *  hard; tunable knobs. */
const EASY_MAX_NPS = 5;
const HARD_MIN_NPS = 9;

/** Sliding peak window in seconds, half-open [t, t+1) so an exactly
 *  metronomic stream loses nothing: the boundary note anchors its own
 *  window. Peaking only at onsets is exact — a maximum-density window can
 *  always be shifted to start at some note without losing notes. */
const PEAK_WINDOW_SECONDS = 1;

/** Blend of whole-song density and the densest 1s burst: mean captures
 *  stamina, peak captures the hardest section; neither alone is reliable
 *  (a single-burst song rates hard on peak but easy on mean, and
 *  vice versa for constant dense songs). */
const PEAK_WEIGHT = 0.5;

/** A chord costs its key anchors, not one full press per member: repeated
 *  familiar chord shapes (power chords, triads) are far easier than the
 *  raw note count suggests, so each simultaneous note past the first only
 *  adds this fraction. */
const CHORD_EXTRA_WEIGHT = 0.5;

/** Estimate a song's difficulty from its notes: pressure = blend of the
 *  weighted notes-per-second across the playable span and the peak
 *  weighted notes-per-second in a 1s window, bucketed into the three
 *  levels. Real-second density already encodes tempo, so BPM is not a
 *  separate input. Falls back to {@link DEFAULT_DIFFICULTY} when there
 *  are no usable notes. */
export function estimateDifficulty(notes: readonly NoteTiming[]): Difficulty {
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

/** Weight per onset: the first note at an onset time is a full press,
 *  simultaneous chord members get CHORD_EXTRA_WEIGHT each. */
function clusterWeights(sortedOnsets: number[]): number[] {
  const weights: number[] = [];
  let prevTime = NaN;

  for (let i = 0; i < sortedOnsets.length; i++) {
    weights.push(sortedOnsets[i] === prevTime ? CHORD_EXTRA_WEIGHT : 1);
    prevTime = sortedOnsets[i];
  }

  return weights;
}

/** Classic two-pointer sweep of a 1s window anchored at each onset,
 *  summing cluster weights; O(n) after the caller sorts, `end` only ever
 *  moves forward. */
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

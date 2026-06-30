// Note grading (PERFECT/GREAT/GOOD), score calculation, timing
// windows, and combo/accuracy tracking.

export enum NoteGrade {
  PERFECT = "PERFECT",
  GREAT = "GREAT",
  GOOD = "GOOD",
}

export const TIMING: Record<NoteGrade, number> = {
  [NoteGrade.PERFECT]: 0.045, // seconds
  [NoteGrade.GREAT]: 0.08,
  [NoteGrade.GOOD]: 0.13,
};

// Extra seconds allowed before the GOOD window for early hits (scores with penalty)
export const EARLY_HIT_WINDOW = 0.1;

// Multiplier applied to score for early-buffer hits (0.5 = 50% of GOOD score)
export const EARLY_PENALTY_RATIO = 0.5;

export const TAP_NOTE_THRESHOLD = 0.4; // seconds — notes shorter than this are instant taps

// ms — in LEARN mode, chord notes (same-time) must all be pressed within this real-time window
export const LEARNING_CHORD_WINDOW = 200;

// Score deducted for pressing a key that doesn't match any active note
export const WRONG_PRESS_PENALTY = 50;

// Minimum hold ratio for a failing note to emit a satisfying particle burst at its end
export const SUCCESS_PARTICLE_HOLD_RATIO = 0.75;

export const SCORE_VALUES: Record<NoteGrade | "MISS", number> = {
  [NoteGrade.PERFECT]: 300,
  [NoteGrade.GREAT]: 200,
  [NoteGrade.GOOD]: 100,
  MISS: 0,
};

export const ACCURACY_WEIGHTS: Record<NoteGrade, number> = {
  [NoteGrade.PERFECT]: 100,
  [NoteGrade.GREAT]: 90,
  [NoteGrade.GOOD]: 70,
};

export const COMBO_DIVISOR = 10;

export const COMBO_BONUS_PER_STEP = 10;

export const GRADE_THRESHOLDS = {
  S: 93,
  A: 80,
  B: 65,
  C: 45,
} as const;

export function gradeLabel(grade: NoteGrade): string {
  if (grade === NoteGrade.GOOD) return "Good!";
  return grade.charAt(0) + grade.slice(1).toLowerCase();
}

export function gradeFromDiff(diff: number): NoteGrade {
  if (diff <= TIMING.PERFECT) return NoteGrade.PERFECT;
  if (diff <= TIMING.GREAT) return NoteGrade.GREAT;
  return NoteGrade.GOOD;
}

export function comboBonus(combo: number): number {
  return Math.floor(combo / COMBO_DIVISOR) * COMBO_BONUS_PER_STEP;
}

/** Returns a 0..1 boost factor that ramps up logarithmically with combo,
 *  reaching 1.0 at combo 80. Used for visual scaling (flame, particles).
 *
 *  Formula: log₈₁(1 + combo), clamped to [0, 1].
 *  Logarithmic shape means early combos (0→20) produce dramatic visual
 *  gains, while high combos (60→80) add subtlety — feels natural in play.
 *
 *  combo:  0 → 0.00, 10 → 0.53, 20 → 0.72, 40 → 0.86, 80+ → 1.00 */
export function comboBoost(combo: number): number {
  return Math.min(1, Math.log(1 + combo) / Math.log(81));
}

export function accuracyWeight(grade: NoteGrade): number {
  return ACCURACY_WEIGHTS[grade];
}

export function letterGrade(accuracy: number): Grade {
  if (accuracy >= GRADE_THRESHOLDS.S) return { grade: "S", class: "grade-s" };
  if (accuracy >= GRADE_THRESHOLDS.A) return { grade: "A", class: "grade-a" };
  if (accuracy >= GRADE_THRESHOLDS.B) return { grade: "B", class: "grade-b" };
  if (accuracy >= GRADE_THRESHOLDS.C) return { grade: "C", class: "grade-c" };
  return { grade: "D", class: "grade-d" };
}

export interface Grade {
  grade: string;
  class: string;
}

export class Scoring {
  score = 0;
  combo = 0;
  maxCombo = 0;
  perfects = 0;
  greats = 0;
  goods = 0;
  misses = 0;
  wrongNotes = 0;
  failures = 0;
  failureWeight = 0;
  totalNotes = 0;
  /** When false, scoring mutations are skipped (loop/practice mode). Notes
   *  still resolve and play feedback, but the score does not change. */
  enabled = true;

  reset(totalNotes: number): void {
    this.score = 0;
    this.resetCombo();
    this.maxCombo = 0;
    this.perfects = 0;
    this.greats = 0;
    this.goods = 0;
    this.misses = 0;
    this.wrongNotes = 0;
    this.failures = 0;
    this.failureWeight = 0;
    this.totalNotes = totalNotes;
    this.enabled = true;
  }

  resetCombo(): void {
    this.combo = 0;
  }

  recordNotePress(): void {
    this.combo++;
    if (this.enabled) {
      if (this.combo > this.maxCombo) this.maxCombo = this.combo;
      this.score += comboBonus(this.combo);
    }
  }

  recordWrongPress(): void {
    this.resetCombo();
    if (!this.enabled) return;
    this.wrongNotes++;
    this.score = Math.max(0, this.score - WRONG_PRESS_PENALTY);
  }

  finalizeNote(
    grade: NoteGrade | null,
    heldRatio: number,
    earlyMultiplier = 1,
  ): number {
    if (grade === null || heldRatio <= 0) {
      this.resetCombo();
      if (this.enabled) {
        this.misses++;
      }
      return 0;
    }

    const baseScore = SCORE_VALUES[grade];
    const earnedScore = Math.round(baseScore * heldRatio * earlyMultiplier);
    if (this.enabled) {
      this.score += earnedScore;

      if (heldRatio >= 1) {
        if (grade === NoteGrade.PERFECT) this.perfects++;
        else if (grade === NoteGrade.GREAT) this.greats++;
        else this.goods++;
      } else {
        this.failures++;
        this.failureWeight += heldRatio * earlyMultiplier * accuracyWeight(grade);
      }
    }

    return earnedScore;
  }

  getAccuracy(): number {
    const total =
      this.perfects + this.greats + this.goods + this.misses + this.failures + this.wrongNotes;
    if (total === 0) return 100;
    const weighted =
      this.perfects * accuracyWeight(NoteGrade.PERFECT) +
      this.greats * accuracyWeight(NoteGrade.GREAT) +
      this.goods * accuracyWeight(NoteGrade.GOOD) +
      this.failureWeight;
    return Math.round((weighted / total) * 10) / 10;
  }

  getGrade(): Grade {
    return letterGrade(this.getAccuracy());
  }
}

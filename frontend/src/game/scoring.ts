export enum NoteGrade {
  PERFECT = 'PERFECT',
  GREAT = 'GREAT',
  GOOD = 'GOOD',
}

export const TIMING: Record<NoteGrade, number> = {
  [NoteGrade.PERFECT]: 0.030,
  [NoteGrade.GREAT]: 0.060,
  [NoteGrade.GOOD]: 0.100,
};

export const TAP_NOTE_THRESHOLD = 0.4;

export const SCORE_VALUES: Record<NoteGrade | 'MISS', number> = {
  [NoteGrade.PERFECT]: 300,
  [NoteGrade.GREAT]: 200,
  [NoteGrade.GOOD]: 100,
  MISS: 0,
};

export const ACCURACY_WEIGHTS: Record<NoteGrade, number> = {
  [NoteGrade.PERFECT]: 100,
  [NoteGrade.GREAT]: 80,
  [NoteGrade.GOOD]: 50,
};

export const COMBO_DIVISOR = 10;

export const COMBO_BONUS_PER_STEP = 10;

export const GRADE_THRESHOLDS = {
  S: 95,
  A: 85,
  B: 70,
  C: 50,
} as const;

export function gradeLabel(grade: NoteGrade): string {
  if (grade === NoteGrade.GOOD) return 'Good!';
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

export function holdPenalty(grade: NoteGrade, holdRatio: number): number {
  return Math.round(SCORE_VALUES[grade] * (1 - holdRatio));
}

export function accuracyWeight(grade: NoteGrade): number {
  return ACCURACY_WEIGHTS[grade];
}

export function letterGrade(accuracy: number): Grade {
  if (accuracy >= GRADE_THRESHOLDS.S) return { grade: 'S', class: 'grade-s' };
  if (accuracy >= GRADE_THRESHOLDS.A) return { grade: 'A', class: 'grade-a' };
  if (accuracy >= GRADE_THRESHOLDS.B) return { grade: 'B', class: 'grade-b' };
  if (accuracy >= GRADE_THRESHOLDS.C) return { grade: 'C', class: 'grade-c' };
  return { grade: 'D', class: 'grade-d' };
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
  failures = 0;
  failureWeight = 0;
  totalNotes = 0;

  reset(totalNotes: number): void {
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.perfects = 0;
    this.greats = 0;
    this.goods = 0;
    this.misses = 0;
    this.failures = 0;
    this.failureWeight = 0;
    this.totalNotes = totalNotes;
  }

  registerHit(diff: number): { grade: NoteGrade } {
    const grade = gradeFromDiff(diff);
    if (grade === NoteGrade.PERFECT) this.perfects++;
    else if (grade === NoteGrade.GREAT) this.greats++;
    else this.goods++;
    this.score += SCORE_VALUES[grade];
    this.combo++;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    this.score += comboBonus(this.combo);
    return { grade };
  }

  registerRelease(grade: NoteGrade, holdRatio: number): { penalty: number; earnedScore: number } {
    const baseScore = SCORE_VALUES[grade];
    const penalty = holdPenalty(grade, holdRatio);
    this.score -= penalty;
    if (grade === NoteGrade.PERFECT) this.perfects--;
    else if (grade === NoteGrade.GREAT) this.greats--;
    else this.goods--;
    this.failureWeight += holdRatio * accuracyWeight(grade);
    this.failures++;
    return { penalty, earnedScore: baseScore - penalty };
  }

  registerMiss(): void {
    this.combo = 0;
    this.misses++;
  }

  getAccuracy(): number {
    const total = this.perfects + this.greats + this.goods + this.misses + this.failures;
    if (total === 0) return 100;
    const weighted = this.perfects * accuracyWeight(NoteGrade.PERFECT)
      + this.greats * accuracyWeight(NoteGrade.GREAT)
      + this.goods * accuracyWeight(NoteGrade.GOOD)
      + this.failureWeight;
    return Math.round((weighted / total) * 10) / 10;
  }

  getGrade(): Grade {
    return letterGrade(this.getAccuracy());
  }
}

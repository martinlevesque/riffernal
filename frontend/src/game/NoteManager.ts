import { NOTE_NAMES, NOTE_COLORS } from '../utils/notes.js';
import type { Song, Note } from '../utils/MidiParser.js';

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

export const SCROLL_SPEED = 400;

export const HIT_ZONE_Y_RATIO = 0.82;

export function gradeLabel(grade: NoteGrade): string {
  if (grade === NoteGrade.GOOD) return 'Good!';
  return grade.charAt(0) + grade.slice(1).toLowerCase();
}

export interface SongNote extends Note {
  hit: boolean;
  missed: boolean;
  lane: number;
  holding: boolean;
  pressStartTime: number;
  failing: boolean;
  grade: NoteGrade | null;
  earnedScore: number;
  resolved: boolean;
}

export interface ActiveNoteRender {
  lane: number;
  y: number;
  height: number;
  color: string;
  alpha: number;
  duration: number;
  key: string;
  holding: boolean;
  failing: boolean;
}

export interface HitResult {
  note: SongNote;
  result: NoteGrade;
}

export interface ReleaseResult {
  note: SongNote;
  penalty: number;
  holdRatio: number;
  grade: NoteGrade;
}

export interface ResolveResult {
  note: SongNote;
  score: number;
  grade: NoteGrade | null;
}

export interface Grade {
  grade: string;
  class: string;
}

export class NoteManager {
  notes: SongNote[] = [];
  activeNotes: SongNote[] = [];
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
  onMiss: ((note: SongNote) => void) | null = null;
  onResolve: ((result: ResolveResult) => void) | null = null;

  loadSong(songData: Song): void {
    this.notes = songData.notes.map((n: Note) => ({
      ...n,
      hit: false,
      missed: false,
      lane: NOTE_NAMES.indexOf(n.key),
      holding: false,
      pressStartTime: 0,
      failing: false,
      grade: null,
      earnedScore: 0,
      resolved: false,
    })).sort((a, b) => a.time - b.time);
    this.totalNotes = this.notes.length;
    this.activeNotes = [];
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.perfects = 0;
    this.greats = 0;
    this.goods = 0;
    this.misses = 0;
    this.failures = 0;
    this.failureWeight = 0;
  }

  update(currentTime: number, height: number): void {
    const hitZoneY = height * HIT_ZONE_Y_RATIO;
    const lookAhead = hitZoneY / SCROLL_SPEED;

    for (const note of this.notes) {
      if (note.resolved) continue;

      if (note.holding) {
        if (currentTime >= note.time + note.duration) {
          note.hit = true;
          note.holding = false;
          note.resolved = true;
          if (this.onResolve) this.onResolve({ note, score: note.earnedScore, grade: note.grade });
        }
        continue;
      }

      if (note.failing) {
        if (currentTime >= note.time + note.duration) {
          note.resolved = true;
          if (this.onResolve) this.onResolve({ note, score: note.earnedScore, grade: note.grade });
        }
        continue;
      }

      const timeDiff = note.time - currentTime;

      if (timeDiff < -TIMING.GOOD) {
        note.missed = true;
        note.failing = true;
        note.resolved = true;
        note.earnedScore = 0;
        this.combo = 0;
        this.misses++;
        if (this.onMiss) this.onMiss(note);
        if (this.onResolve) this.onResolve({ note, score: 0, grade: null });
        continue;
      }

      if (timeDiff <= lookAhead && !this.activeNotes.includes(note)) {
        this.activeNotes.push(note);
      }
    }

    this.activeNotes = this.activeNotes.filter(n => {
      if ((n.hit || n.missed) && !n.failing) return false;
      const timeDiff = n.time - currentTime;
      const noteHeight = Math.max(12, n.duration * SCROLL_SPEED);
      const y = hitZoneY - timeDiff * SCROLL_SPEED - noteHeight;
      return y < height + 50;
    });
  }

  checkHit(currentTime: number, lane: number): HitResult | null {
    let bestNote: SongNote | null = null;
    let bestDiff = Infinity;

    for (const note of this.activeNotes) {
      if (note.hit || note.missed || note.holding || note.failing) continue;
      if (note.lane !== lane) continue;
      const diff = Math.abs(note.time - currentTime);
      if (diff < bestDiff && diff <= TIMING.GOOD) {
        bestDiff = diff;
        bestNote = note;
      }
    }

    if (!bestNote) return null;

    let result: NoteGrade;

    if (bestDiff <= TIMING.PERFECT) {
      result = NoteGrade.PERFECT;
      this.perfects++;
      this.score += SCORE_VALUES[NoteGrade.PERFECT];
    } else if (bestDiff <= TIMING.GREAT) {
      result = NoteGrade.GREAT;
      this.greats++;
      this.score += SCORE_VALUES[NoteGrade.GREAT];
    } else {
      result = NoteGrade.GOOD;
      this.goods++;
      this.score += SCORE_VALUES[NoteGrade.GOOD];
    }

    bestNote.grade = result;
    bestNote.earnedScore = SCORE_VALUES[result];

    if (bestNote.duration <= TAP_NOTE_THRESHOLD) {
      bestNote.hit = true;
      bestNote.resolved = true;
      if (this.onResolve) this.onResolve({ note: bestNote, score: bestNote.earnedScore, grade: result });
    } else {
      bestNote.holding = true;
      bestNote.pressStartTime = currentTime;
    }

    this.combo++;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;

    const comboMultiplier = Math.floor(this.combo / 10);
    this.score += comboMultiplier * 10;

    return { note: bestNote, result };
  }

  checkRelease(currentTime: number, lane: number): ReleaseResult | null {
    let holdingNote: SongNote | null = null;
    for (const note of this.activeNotes) {
      if (note.holding && note.lane === lane) {
        holdingNote = note;
        break;
      }
    }

    if (!holdingNote) return null;

    const heldDuration = currentTime - holdingNote.pressStartTime;
    const holdRatio = Math.min(1, Math.max(0, heldDuration / holdingNote.duration));

    if (holdRatio >= 1) {
      holdingNote.hit = true;
      holdingNote.holding = false;
      holdingNote.resolved = true;
      if (this.onResolve) this.onResolve({ note: holdingNote, score: holdingNote.earnedScore, grade: holdingNote.grade });
      return null;
    }

    const baseScore = SCORE_VALUES[holdingNote.grade!];
    const penalty = Math.round(baseScore * (1 - holdRatio));
    this.score -= penalty;
    holdingNote.earnedScore = baseScore - penalty;

    if (holdingNote.grade === NoteGrade.PERFECT) this.perfects--;
    else if (holdingNote.grade === NoteGrade.GREAT) this.greats--;
    else this.goods--;

    const weight = holdingNote.grade === NoteGrade.PERFECT ? 100 : holdingNote.grade === NoteGrade.GREAT ? 80 : 50;
    this.failureWeight += holdRatio * weight;

    holdingNote.failing = true;
    holdingNote.holding = false;
    this.failures++;

    return { note: holdingNote, penalty, holdRatio, grade: holdingNote.grade! };
  }

  getAccuracy(): number {
    const total = this.perfects + this.greats + this.goods + this.misses + this.failures;
    if (total === 0) return 100;
    const weighted = this.perfects * 100 + this.greats * 80 + this.goods * 50 + this.failureWeight;
    return Math.round((weighted / total) * 10) / 10;
  }

  getSongDuration(): number {
    if (this.notes.length === 0) return 0;
    const last = this.notes[this.notes.length - 1];
    return last.time + last.duration;
  }

  isComplete(): boolean {
    return this.notes.length > 0 && this.notes.every(n => n.resolved);
  }

  getGrade(): Grade {
    const acc = this.getAccuracy();
    if (acc >= 95) return { grade: 'S', class: 'grade-s' };
    if (acc >= 85) return { grade: 'A', class: 'grade-a' };
    if (acc >= 70) return { grade: 'B', class: 'grade-b' };
    if (acc >= 50) return { grade: 'C', class: 'grade-c' };
    return { grade: 'D', class: 'grade-d' };
  }

  getActiveNotes(currentTime: number, height: number): ActiveNoteRender[] {
    const hitZoneY = height * HIT_ZONE_Y_RATIO;
    const results: ActiveNoteRender[] = [];

    for (const note of this.activeNotes) {
      if ((note.hit || note.missed) && !note.failing) continue;
      const color = NOTE_COLORS[note.key] || '#ffffff';

      if (note.holding) {
        const remaining = Math.max(12, (note.time + note.duration - currentTime) * SCROLL_SPEED);
        const y = hitZoneY - remaining;
        results.push({
          lane: note.lane,
          y,
          height: remaining,
          color,
          alpha: 1,
          duration: note.duration,
          key: note.key,
          holding: true,
          failing: false,
        });
      } else {
        const timeDiff = note.time - currentTime;
        const noteHeight = Math.max(12, note.duration * SCROLL_SPEED);
        const y = hitZoneY - timeDiff * SCROLL_SPEED - noteHeight;
        const alpha = y + noteHeight < 0 ? 0 : 1;
        results.push({
          lane: note.lane,
          y,
          height: noteHeight,
          color,
          alpha,
          duration: note.duration,
          key: note.key,
          holding: false,
          failing: note.failing,
        });
      }
    }

    return results;
  }
}

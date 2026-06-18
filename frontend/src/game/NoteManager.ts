import { NOTE_NAMES, NOTE_COLORS } from '../utils/notes.js';
import type { Song, Note } from '../utils/MidiParser.js';
import { Scoring, TIMING, TAP_NOTE_THRESHOLD, SCORE_VALUES } from './scoring.js';
import type { NoteGrade } from './scoring.js';

export const SCROLL_SPEED = 400;

export const HIT_ZONE_Y_RATIO = 0.82;

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

export class NoteManager {
  scoring = new Scoring();
  notes: SongNote[] = [];
  activeNotes: SongNote[] = [];
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
    this.scoring.reset(this.notes.length);
    this.activeNotes = [];
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
        this.scoring.registerMiss();
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

    const { grade: result } = this.scoring.registerHit(bestDiff);

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

    const { penalty, earnedScore } = this.scoring.registerRelease(holdingNote.grade!, holdRatio);
    holdingNote.earnedScore = earnedScore;

    holdingNote.failing = true;
    holdingNote.holding = false;

    return { note: holdingNote, penalty, holdRatio, grade: holdingNote.grade! };
  }

  getSongDuration(): number {
    if (this.notes.length === 0) return 0;
    const last = this.notes[this.notes.length - 1];
    return last.time + last.duration;
  }

  isComplete(): boolean {
    return this.notes.length > 0 && this.notes.every(n => n.resolved);
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

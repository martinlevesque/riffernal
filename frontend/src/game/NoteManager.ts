import { NOTE_TO_LANE, handForKey, handColor, HandSide } from '../utils/notes.js';
import type { Song, Note } from '../utils/MidiParser.js';
import { Scoring, TIMING, TAP_NOTE_THRESHOLD, EARLY_HIT_WINDOW, EARLY_PENALTY_RATIO, gradeFromDiff, NoteGrade } from './scoring.js';

export const SCROLL_SPEED = 400;

export const HIT_ZONE_Y_RATIO = 0.82;

export const SIMULTANEOUS_WINDOW = 0.15;
export const CHORD_GROUP_WINDOW = 0.1;

export interface LearningHitOutcome {
  results: HitResult[];
  wrong: boolean;
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
  activated: boolean;
  accumulatedHeldDuration: number;
  earlyMultiplier: number;
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
  waiting: boolean;
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
  trebleNotes: SongNote[] = [];
  bassNotes: SongNote[] = [];
  onMiss: ((note: SongNote) => void) | null = null;
  onResolve: ((result: ResolveResult) => void) | null = null;
  private _nextNoteIndex = 0;
  private _resolvedCount = 0;
  private _learningAnchor: number | null = null;
  private _learningChordLanes = new Set<number>();
  private _learningChordPresses = new Map<number, number>();
  private _learningChordDeadline = 0;

  loadSong(songData: Song): void {
    this.notes = songData.notes.map((n: Note) => ({
      ...n,
      hit: false,
      missed: false,
      lane: NOTE_TO_LANE.get(n.key) ?? -1,
      holding: false,
      pressStartTime: 0,
      failing: false,
      grade: null,
      earnedScore: 0,
      resolved: false,
      activated: false,
      accumulatedHeldDuration: 0,
      earlyMultiplier: 1,
    })).sort((a, b) => a.time - b.time);
    this.scoring.reset(this.notes.length);
    this.activeNotes = [];
    this._nextNoteIndex = 0;
    this._resolvedCount = 0;
    this._learningAnchor = null;
    this._learningChordLanes.clear();
    this._learningChordPresses.clear();
    this._learningChordDeadline = 0;
    this.trebleNotes = [];
    this.bassNotes = [];
    for (const note of this.notes) {
      if (handForKey(note.key) === HandSide.Left) {
        this.bassNotes.push(note);
      } else {
        this.trebleNotes.push(note);
      }
    }
  }

  update(currentTime: number, height: number): void {
    const hitZoneY = height * HIT_ZONE_Y_RATIO;
    const lookAhead = hitZoneY / SCROLL_SPEED;

    while (this._nextNoteIndex < this.notes.length && this.notes[this._nextNoteIndex].resolved) {
      this._nextNoteIndex++;
    }

    for (let i = this._nextNoteIndex; i < this.notes.length; i++) {
      const note = this.notes[i];
      if (note.resolved) {
        continue;
      }

      if (note.holding) {
        if (currentTime >= note.time + note.duration) {
          const noteEnd = note.time + note.duration;
          const finalSegment = noteEnd - note.pressStartTime;
          note.accumulatedHeldDuration += Math.max(0, finalSegment);
          note.accumulatedHeldDuration = Math.min(note.accumulatedHeldDuration, note.duration);
          const cumulativeRatio = note.accumulatedHeldDuration / note.duration;
          note.hit = true;
          note.holding = false;
          note.resolved = true;
          this._resolvedCount++;
          note.earnedScore = this.scoring.finalizeNote(note.grade!, cumulativeRatio, note.earlyMultiplier);
          if (this.onResolve) this.onResolve({ note, score: note.earnedScore, grade: note.grade! });
        }
        continue;
      }

      if (note.failing) {
        if (currentTime >= note.time + note.duration) {
          note.resolved = true;
          this._resolvedCount++;
          if (note.accumulatedHeldDuration > 0 && note.grade !== null) {
            const cumulativeRatio = note.accumulatedHeldDuration / note.duration;
            note.earnedScore = this.scoring.finalizeNote(note.grade, cumulativeRatio, note.earlyMultiplier);
            if (this.onResolve) this.onResolve({ note, score: note.earnedScore, grade: note.grade });
          } else {
            this.scoring.finalizeNote(null, 0);
            if (this.onResolve) this.onResolve({ note, score: 0, grade: null });
          }
        }
        continue;
      }

      const timeDiff = note.time - currentTime;

      if (timeDiff < -TIMING.GOOD) {
        note.missed = true;
        note.failing = true;
        if (this.onMiss) this.onMiss(note);
        continue;
      }

      if (timeDiff <= lookAhead && !note.activated) {
        note.activated = true;
        this.activeNotes.push(note);
      }
    }

    let writeIdx = 0;
    for (let i = 0; i < this.activeNotes.length; i++) {
      const n = this.activeNotes[i];
      if ((n.hit || n.missed) && !n.failing) continue;
      const noteHeight = Math.max(12, n.duration * SCROLL_SPEED);
      const y = hitZoneY - (n.time - currentTime) * SCROLL_SPEED - noteHeight;
      if (y >= height + 50) continue;
      this.activeNotes[writeIdx++] = n;
    }
    this.activeNotes.length = writeIdx;
  }

  checkHit(currentTime: number, lane: number): HitResult | null {
    const result = this._tryRecoverFailingNote(currentTime, lane) ?? this._tryNormalHit(currentTime, lane);
    if (result === null) {
      this.scoring.recordWrongPress();
    }
    return result;
  }

  private _beginHold(note: SongNote, currentTime: number): void {
    note.holding = true;
    note.pressStartTime = currentTime;
  }

  private _resolveTapNote(note: SongNote, grade: NoteGrade, ratio: number): void {
    const clampedRatio = Math.max(0, Math.min(1, ratio));
    note.hit = true;
    note.holding = false;
    note.resolved = true;
    this._resolvedCount++;
    note.earnedScore = this.scoring.finalizeNote(grade, clampedRatio, note.earlyMultiplier);
    if (this.onResolve) this.onResolve({ note, score: note.earnedScore, grade });
  }

  private _tryRecoverFailingNote(currentTime: number, lane: number): HitResult | null {
    for (const note of this.activeNotes) {
      if (!note.failing || note.holding || note.resolved || note.lane !== lane) continue;

      const noteEnd = note.time + note.duration;
      if (currentTime >= noteEnd) continue;

      // Don't recover an old failing note if a fresher un-hit note in the same
      // lane is within the timing window — let _tryNormalHit handle the new note.
      // Fixes consecutive same-note sequences (e.g. C3 C3) where re-pressing the
      // key for the second note would otherwise recover the first note instead.
      const hasFreshNote = this.activeNotes.some(
        (n) =>
          n !== note &&
          n.lane === lane &&
          !n.hit &&
          !n.missed &&
          !n.holding &&
          !n.failing &&
          !n.resolved &&
          Math.abs(n.time - currentTime) <= TIMING.GOOD + EARLY_HIT_WINDOW,
      );
      if (hasFreshNote) continue;

      const isRepress = note.accumulatedHeldDuration > 0;
      const grade = isRepress ? note.grade! : NoteGrade.GOOD;

      if (!isRepress) {
        this.scoring.recordNotePress();
        note.grade = grade;
      }

      note.failing = false;
      note.missed = false;
      this._beginHold(note, currentTime);

      if (note.duration <= TAP_NOTE_THRESHOLD) {
        this._resolveTapNote(note, grade, (noteEnd - currentTime) / note.duration);
      }

      return { note, result: grade };
    }
    return null;
  }

  private _tryNormalHit(currentTime: number, lane: number): HitResult | null {
    let bestNote: SongNote | null = null;
    let bestDiff = Infinity;
    let isEarlyHit = false;

    for (const note of this.activeNotes) {
      if (note.hit || note.missed || note.holding || note.failing) continue;
      if (note.lane !== lane) continue;
      const diff = Math.abs(note.time - currentTime);
      const isEarly = currentTime < note.time;
      const maxWindow = isEarly ? (TIMING.GOOD + EARLY_HIT_WINDOW) : TIMING.GOOD;
      if (diff < bestDiff && diff <= maxWindow) {
        bestDiff = diff;
        bestNote = note;
        isEarlyHit = isEarly && diff > TIMING.GOOD;
      }
    }

    if (!bestNote) return null;

    const grade = isEarlyHit ? NoteGrade.GOOD : gradeFromDiff(bestDiff);
    if (isEarlyHit) bestNote.earlyMultiplier = EARLY_PENALTY_RATIO;

    this.scoring.recordNotePress();
    bestNote.grade = grade;

    if (bestNote.duration <= TAP_NOTE_THRESHOLD) {
      this._resolveTapNote(bestNote, grade, 1);
    } else {
      this._beginHold(bestNote, currentTime);
    }

    return { note: bestNote, result: grade };
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

    const segmentDuration = currentTime - holdingNote.pressStartTime;
    holdingNote.accumulatedHeldDuration += Math.max(0, segmentDuration);
    const cumulativeRatio = Math.min(1, Math.max(0, holdingNote.accumulatedHeldDuration / holdingNote.duration));

    if (cumulativeRatio >= 1) {
      holdingNote.hit = true;
      holdingNote.holding = false;
      holdingNote.resolved = true;
      this._resolvedCount++;
      holdingNote.earnedScore = this.scoring.finalizeNote(holdingNote.grade!, cumulativeRatio, holdingNote.earlyMultiplier);
      if (this.onResolve) this.onResolve({ note: holdingNote, score: holdingNote.earnedScore, grade: holdingNote.grade! });
      return null;
    }

    holdingNote.failing = true;
    holdingNote.holding = false;

    return { note: holdingNote, penalty: 0, holdRatio: cumulativeRatio, grade: holdingNote.grade! };
  }

  private _expireStaleChordPresses(realTime: number): void {
    if (realTime > this._learningChordDeadline && this._learningChordPresses.size > 0) {
      this._learningChordPresses.clear();
    }
  }

  getEarliestWaitTime(rawTime: number, realTime?: number): number | null {
    if (this._learningAnchor !== null) {
      if (realTime !== undefined) this._expireStaleChordPresses(realTime);

      let allEngaged = true;
      for (let i = this._nextNoteIndex; i < this.notes.length; i++) {
        const note = this.notes[i];
        if (note.time > this._learningAnchor + CHORD_GROUP_WINDOW) break;
        if (note.resolved || note.holding || note.failing || note.hit) continue;
        allEngaged = false;
        break;
      }
      if (allEngaged) {
        this._learningAnchor = null;
        this._learningChordLanes.clear();
        this._learningChordPresses.clear();
      } else {
        return this._learningAnchor;
      }
    }

    for (let i = this._nextNoteIndex; i < this.notes.length; i++) {
      const note = this.notes[i];
      if (note.resolved || note.holding || note.failing || note.hit) continue;
      if (note.time <= rawTime) {
        this._learningAnchor = note.time;
        this._learningChordLanes.clear();
        this._learningChordPresses.clear();
        this._learningChordDeadline = 0;
        for (let j = i; j < this.notes.length; j++) {
          const n = this.notes[j];
          if (n.time > this._learningAnchor + CHORD_GROUP_WINDOW) break;
          if (n.resolved || n.holding || n.failing || n.hit) continue;
          this._learningChordLanes.add(n.lane);
        }
        return note.time;
      }
      return null;
    }
    return null;
  }

  checkLearningHit(currentTime: number, lane: number, realTime: number): LearningHitOutcome {
    if (this._learningAnchor === null || !this._learningChordLanes.has(lane)) {
      const result = this.checkHit(currentTime, lane);
      return { results: result ? [result] : [], wrong: result === null };
    }

    this._expireStaleChordPresses(realTime);

    if (this._learningChordPresses.size === 0) {
      this._learningChordDeadline = realTime + SIMULTANEOUS_WINDOW * 1000;
    }
    this._learningChordPresses.set(lane, realTime);

    if (this._learningChordPresses.size < this._learningChordLanes.size) {
      return { results: [], wrong: false };
    }

    const results: HitResult[] = [];
    for (const pressedLane of this._learningChordPresses.keys()) {
      const r = this.checkHit(currentTime, pressedLane);
      if (r) results.push(r);
    }
    this._learningChordPresses.clear();
    this._learningChordDeadline = 0;
    return { results, wrong: false };
  }

  getSongDuration(): number {
    if (this.notes.length === 0) return 0;
    const last = this.notes[this.notes.length - 1];
    return last.time + last.duration;
  }

  isComplete(): boolean {
    return this._resolvedCount >= this.notes.length && this.notes.length > 0;
  }

  getActiveNotes(currentTime: number, height: number, learningMode = false): ActiveNoteRender[] {
    const hitZoneY = height * HIT_ZONE_Y_RATIO;
    const results: ActiveNoteRender[] = [];

    for (const note of this.activeNotes) {
      if ((note.hit || note.missed) && !note.failing) continue;
      const color = handColor(note.key);

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
          waiting: false,
        });
      } else {
        const timeDiff = note.time - currentTime;
        const noteHeight = Math.max(12, note.duration * SCROLL_SPEED);
        const y = hitZoneY - timeDiff * SCROLL_SPEED - noteHeight;
        const alpha = y + noteHeight < 0 ? 0 : 1;
        const waiting = learningMode && timeDiff <= 0;
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
          waiting,
        });
      }
    }

    return results;
  }
}

// Manages note state, timing, hit detection, and learning mode.
// Tracks active notes, handles press/release events, and resolves
// notes based on timing windows and scoring rules.

import { NOTE_TO_LANE, handForKey, handColor, HandSide, PracticeHand } from '../utils/notes.js';
import type { Song, Note } from '../utils/MidiParser.js';
import type { Renderer } from './rendering/Renderer.js';
import { Scoring, TIMING, TAP_NOTE_THRESHOLD, EARLY_HIT_WINDOW, EARLY_PENALTY_RATIO, LEARNING_CHORD_WINDOW, gradeFromDiff, NoteGrade } from './scoring.js';

export const SCROLL_SPEED = 400;

export const HIT_ZONE_Y_RATIO = 0.82;

/** Safety margin for the time-window pre-filter in `findNearestNoteByClick`.
 *  1.5× ensures notes slightly beyond the exact pixel radius are still
 *  considered, accounting for stem/flag overshoot and rounding. */
const CLICK_TIME_WINDOW_RATIO = 1.5;

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
  autoPlayed: boolean;
  track: number;
  hand: HandSide;
  selected: boolean;
  channel: number;
  rawMidi: number;
  program: number;
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
  selected: boolean;
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
  onAutoPlayOn: ((note: SongNote) => void) | null = null;
  learningMode = false;
  practiceHand: PracticeHand = PracticeHand.Both;
  private _nextNoteIndex = 0;
  private _selectedNoteCount = 0;
  private _selectedResolvedCount = 0;
  private _learningAnchor: number | null = null;
  private _learningChordLanes = new Set<number>();
  private _learningChordPresses = new Set<number>();
  private _learningChordFirstPressRealTime = 0;
  private _laneHand = new Map<number, HandSide>();
  backgroundTracks = new Set<number>();
  private _notePool: ActiveNoteRender[] = [];

  loadSong(songData: Song): void {
    const selectedIndices = songData.selectedTrackIndices ?? [];
    const trackHands = songData.trackHands ?? {};
    const hasTrackInfo = songData.tracks && songData.tracks.length > 0;

    this.backgroundTracks = new Set(songData.backgroundTracks ?? []);

    this.notes = songData.notes.map((n: Note) => {
      const track = n.track ?? 0;
      const hand = trackHands[track] ?? handForKey(n.key);
      const selected = hasTrackInfo
        ? selectedIndices.length === 0 || selectedIndices.includes(track)
        : true;
      return {
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
        autoPlayed: false,
        track,
        hand,
        selected,
        channel: n.channel ?? 0,
        rawMidi: n.rawMidi ?? 0,
        program: n.program ?? -1,
      };
    }).sort((a, b) => a.time - b.time);
    this.activeNotes = [];
    this._nextNoteIndex = 0;
    this._selectedNoteCount = this.notes.filter((n) => n.selected).length;
    this._selectedResolvedCount = 0;
    this.scoring.reset(this._selectedNoteCount);
    this.resetLearningState();
    this.trebleNotes = [];
    this.bassNotes = [];
    this._laneHand.clear();
    for (const note of this.notes) {
      if (!note.selected) continue;
      if (note.hand === HandSide.Left) {
        this.bassNotes.push(note);
      } else {
        this.trebleNotes.push(note);
      }
      if (!this._laneHand.has(note.lane)) {
        this._laneHand.set(note.lane, note.hand);
      }
    }
  }

  private _isAutoPlayNote(note: SongNote): boolean {
    if (!note.selected) return this.backgroundTracks.has(note.track);
    if (!this.learningMode || this.practiceHand === PracticeHand.Both) return false;
    const hand = note.hand;
    if (this.practiceHand === PracticeHand.Left) return hand === HandSide.Right;
    return hand === HandSide.Left;
  }

  /** Mark a note as resolved and keep the selected-resolved counter in sync.
   *  Safe to call when already resolved (no-op). */
  private _markResolved(note: SongNote): void {
    if (note.resolved) return;
    note.resolved = true;
    if (note.selected) this._selectedResolvedCount++;
  }

  resetLearningState(): void {
    this._learningAnchor = null;
    this._learningChordLanes.clear();
    this._learningChordPresses.clear();
    this._learningChordFirstPressRealTime = 0;
  }

  setBackgroundTrack(trackIndex: number, enabled: boolean): void {
    if (enabled) {
      this.backgroundTracks.add(trackIndex);
    } else {
      this.backgroundTracks.delete(trackIndex);
    }
  }

  /** Reset gameplay state for all notes at or after `time` so a seek/loop
   *  rewind can replay them. Notes strictly before `time` that were not yet
   *  played are marked as resolved (skipped) so learning mode does not freeze
   *  waiting on them after a forward seek. Already-played earlier notes
   *  preserve their hit/grade state. Scoring is preserved cumulatively. */
  resetFromTime(time: number): void {
    for (const note of this.notes) {
      if (note.time < time) {
        // Notes before the seek target are skipped: mark them as resolved so
        // learning mode does not freeze waiting on them. Preserve any earned
        // hit/grade state for notes that were actually played before the seek.
        if (!note.resolved) {
          note.resolved = true;
          note.activated = true;
          note.missed = false;
        }
        continue;
      }
      note.hit = false;
      note.missed = false;
      note.holding = false;
      note.pressStartTime = 0;
      note.failing = false;
      note.grade = null;
      note.earnedScore = 0;
      note.resolved = false;
      note.activated = false;
      note.accumulatedHeldDuration = 0;
      note.earlyMultiplier = 1;
      note.autoPlayed = false;
    }
    this.activeNotes = [];
    let firstUnresolved = 0;
    while (firstUnresolved < this.notes.length && this.notes[firstUnresolved].resolved) {
      firstUnresolved++;
    }
    this._nextNoteIndex = firstUnresolved;
    this._selectedResolvedCount = this.notes.reduce(
      (acc, n) => acc + (n.selected && n.resolved ? 1 : 0), 0,
    );
    this.resetLearningState();
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

      const timeDiff = note.time - currentTime;

      // Notes far in the future can't be activated, missed, or auto-played.
      // Since notes are sorted by time, all subsequent notes are even further
      // ahead, so we can stop scanning.
      if (timeDiff > lookAhead + 1) {
        break;
      }

      if (this._isAutoPlayNote(note) && !note.autoPlayed) {
        if (timeDiff <= 0) {
          note.autoPlayed = true;
          if (this.onAutoPlayOn) this.onAutoPlayOn(note);
          if (note.duration <= TAP_NOTE_THRESHOLD) {
            note.hit = true;
            note.holding = false;
            this._markResolved(note);
          } else {
            note.holding = true;
            note.pressStartTime = note.time;
          }
          continue;
        }
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
          this._markResolved(note);
          if (!note.autoPlayed) {
            note.earnedScore = this.scoring.finalizeNote(note.grade!, cumulativeRatio, note.earlyMultiplier);
            if (this.onResolve) this.onResolve({ note, score: note.earnedScore, grade: note.grade! });
          }
        }
        continue;
      }

      if (note.failing) {
        if (currentTime >= note.time + note.duration) {
          this._markResolved(note);
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

      if (timeDiff < -TIMING.GOOD) {
        if (note.selected) {
          note.missed = true;
          note.failing = true;
          if (this.onMiss) this.onMiss(note);
        } else {
          this._markResolved(note);
        }
        continue;
      }

      if (timeDiff <= lookAhead && !note.activated) {
        note.activated = true;
        if (note.selected) {
          this.activeNotes.push(note);
        }
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
    if (result === null && !this.hasUnresolvedNoteInLane(lane, currentTime)) {
      this.scoring.recordWrongPress();
    }
    return result;
  }

  /** Returns true if there is an unresolved note in the given lane within
   *  the hittable window of `currentTime`. Pressing a key for a note beyond
   *  that is a wrong key press. */
  hasUnresolvedNoteInLane(lane: number, currentTime: number): boolean {
    return this.activeNotes.some(
      (n) => n.lane === lane && !n.resolved && Math.abs(n.time - currentTime) <= TIMING.GOOD,
    );
  }

  private _beginHold(note: SongNote, currentTime: number): void {
    note.holding = true;
    note.pressStartTime = currentTime;
  }

  private _resolveTapNote(note: SongNote, grade: NoteGrade, ratio: number): void {
    const clampedRatio = Math.max(0, Math.min(1, ratio));
    note.hit = true;
    note.holding = false;
    this._markResolved(note);
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
          !this._isAutoPlayNote(n) &&
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
      if (this._isAutoPlayNote(note)) continue;
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
        if (note.autoPlayed) return null;
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
      this._markResolved(holdingNote);
      holdingNote.earnedScore = this.scoring.finalizeNote(holdingNote.grade!, cumulativeRatio, holdingNote.earlyMultiplier);
      if (this.onResolve) this.onResolve({ note: holdingNote, score: holdingNote.earnedScore, grade: holdingNote.grade! });
      return null;
    }

    holdingNote.failing = true;
    holdingNote.holding = false;

    return { note: holdingNote, penalty: 0, holdRatio: cumulativeRatio, grade: holdingNote.grade! };
  }

  getEarliestWaitTime(rawTime: number): number | null {
    if (this._learningAnchor !== null) {
      let allEngaged = true;
      for (let i = this._nextNoteIndex; i < this.notes.length; i++) {
        const note = this.notes[i];
        if (note.time > this._learningAnchor) break;
        if (!note.selected || this._isAutoPlayNote(note)) continue;
        if (note.resolved || note.holding || note.failing || note.hit) continue;
        allEngaged = false;
        break;
      }
      if (allEngaged) {
        this._learningAnchor = null;
        this._learningChordLanes.clear();
        this._learningChordPresses.clear();
        this._learningChordFirstPressRealTime = 0;
      } else {
        return this._learningAnchor;
      }
    }

    for (let i = this._nextNoteIndex; i < this.notes.length; i++) {
      const note = this.notes[i];
      if (note.resolved || note.holding || note.failing || note.hit) continue;
      if (!note.selected || this._isAutoPlayNote(note)) continue;
      if (note.time <= rawTime) {
        this._learningAnchor = note.time;
        this._learningChordLanes.clear();
        this._learningChordPresses.clear();
        this._learningChordFirstPressRealTime = 0;
        for (let j = i; j < this.notes.length; j++) {
          const n = this.notes[j];
          if (n.time > this._learningAnchor) break;
          if (n.resolved || n.holding || n.failing || n.hit) continue;
          if (this._isAutoPlayNote(n)) continue;
          this._learningChordLanes.add(n.lane);
        }
        return note.time;
      }
      return null;
    }
    return null;
  }

  checkLearningHit(currentTime: number, lane: number, realTime: number = performance.now()): LearningHitOutcome {
    const recoverResult = this._tryRecoverFailingNote(currentTime, lane);
    if (recoverResult) {
      return { results: [recoverResult], wrong: false };
    }

    const hasPlayableNote = this.activeNotes.some(
      (n) => n.lane === lane && !n.hit && !n.missed && !n.holding && !n.failing && !n.resolved && !this._isAutoPlayNote(n) && Math.abs(n.time - currentTime) <= TIMING.GOOD,
    );

    if (!hasPlayableNote) {
      // Silently ignore if:
      //   - the lane belongs to an auto-play note (non-practiced hand) — pressing
      //     it is not a mistake, the game handles those automatically
      //   - there is a note in this lane currently in the active window (e.g. a
      //     duplicate press before update() runs) AND no anchor is set
      //     (when an anchor IS set we know exactly which lane is expected, so
      //     "recently hit" should not mask a wrong-key press)
      // Only penalise when the lane truly has no note at all.
      const isAutoPlayLane = this.notes.some(
        (n) => n.lane === lane && this._isAutoPlayNote(n),
      );

      if (isAutoPlayLane) {
        return { results: [], wrong: false };
      }

      // When no anchor is set, also forgive duplicate presses of a recently-hit
      // note (MIDI hardware can fire two Note On events for the same key).
      if (this._learningAnchor === null) {
        const hasAnyNearNote =
          this.activeNotes.some(
            (n) => n.lane === lane && Math.abs(n.time - currentTime) <= TIMING.GOOD,
          ) ||
          this.notes.some(
            (n) => n.lane === lane && n.hit && currentTime - n.time <= TIMING.GOOD + EARLY_HIT_WINDOW,
          );

        if (hasAnyNearNote) {
          return { results: [], wrong: false };
        }
      }

      this.scoring.recordWrongPress();
      return { results: [], wrong: true };
    }
    if (this._learningAnchor === null) {
      // Unreachable: hasPlayableNote already confirmed a note exists within
      // TIMING.GOOD, so _tryNormalHit will always find it.
      const result = this._tryNormalHit(currentTime, lane);
      return { results: result ? [result] : [], wrong: false };
    }
    if (!this._learningChordLanes.has(lane)) {
      return { results: [], wrong: false };
    }

    if (this._learningChordPresses.size > 0 && realTime - this._learningChordFirstPressRealTime > LEARNING_CHORD_WINDOW) {
      this._learningChordPresses.clear();
    }

    if (this._learningChordPresses.size === 0) {
      this._learningChordFirstPressRealTime = realTime;
    }

    this._learningChordPresses.add(lane);

    if (this._learningChordPresses.size < this._learningChordLanes.size) {
      return { results: [], wrong: false };
    }

    const results: HitResult[] = [];
    for (const pressedLane of this._learningChordPresses) {
      const r = this.checkHit(currentTime, pressedLane);
      if (r) results.push(r);
    }
    this._learningChordPresses.clear();
    this._learningAnchor = null;
    this._learningChordLanes.clear();
    return { results, wrong: false };
  }

  getSongDuration(): number {
    if (this.notes.length === 0) return 0;
    const last = this.notes[this.notes.length - 1];
    return last.time + last.duration;
  }

  /** Find the start time of the next selected, unresolved note after `time`.
   *  Returns null when no more notes remain. */
  findNextUnplayedTime(time: number): number | null {
    for (const note of this.notes) {
      if (note.time <= time) continue;
      if (note.resolved) continue;
      if (!note.selected) continue;
      if (this._isAutoPlayNote(note)) continue;
      return note.time;
    }
    return null;
  }

  /** Returns the latest `time + duration` among notes whose start time is
   *  at or before `end`, so a loop wrapping at `end` lets the last note
   *  in the loop finish playing before rewinding. Returns `end` if no
   *  matching note is found. */
  getLoopEffectiveEnd(end: number): number {
    let effective = end;
    for (const note of this.notes) {
      if (note.time > end) break;
      const noteEnd = note.time + note.duration;
      if (noteEnd > effective) effective = noteEnd;
    }
    return effective;
  }

  /** Find the SongNote whose time is closest to `time`. When `staff` is given
   *  ('treble' | 'bass'), restrict the search to that hand. Returns null if
   *  no notes exist in the consideration set. */
  findNearestNote(time: number, staff?: 'treble' | 'bass'): SongNote | null {
    const pool = staff === 'treble' ? this.trebleNotes : staff === 'bass' ? this.bassNotes : this.notes;
    if (pool.length === 0) {
      return staff ? this.findNearestNote(time) : null;
    }
    let lo = 0;
    let hi = pool.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (pool[mid].time < time) lo = mid + 1;
      else hi = mid;
    }
    let candidate = pool[Math.min(lo, pool.length - 1)];
    if (lo > 0) {
      const prev = pool[lo - 1];
      if (Math.abs(prev.time - time) <= Math.abs(candidate.time - time)) candidate = prev;
    }
    return candidate;
  }

  /** Find the note closest to a click position in pixel space.
   *  Uses the renderer's coordinate mapping to compute 2D distance.
   *  Returns null if no note is within `maxRadius` pixels. */
  findNearestNoteByClick(
    clickX: number,
    clickY: number,
    renderer: Renderer,
    maxRadius = 30,
  ): SongNote | null {
    const ve = renderer.sheetViewEnd;
    const vs = renderer.sheetViewStart;
    if (ve <= vs) return null;

    const clickTime = vs + ((clickX - renderer.sheetBarX) / renderer.sheetBarW) * (ve - vs);
    const timeWindow = (maxRadius / renderer.sheetBarW) * (ve - vs) * CLICK_TIME_WINDOW_RATIO;

    let bestNote: SongNote | null = null;
    let bestDist = maxRadius * maxRadius;

    const checkNote = (note: SongNote): void => {
      if (note.time < clickTime - timeWindow || note.time > clickTime + timeWindow) return;
      const pos = renderer.notePixelPosition(note);
      if (!pos) return;
      const dx = pos.x - clickX;
      const dy = pos.y - clickY;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        bestNote = note;
      }
    };

    for (const note of this.trebleNotes) checkNote(note);
    for (const note of this.bassNotes) checkNote(note);

    return bestNote;
  }

  /** Find the active note for a lane closest to currentTime (for patch lookup). */
  findActiveNoteForLane(currentTime: number, lane: number): SongNote | null {
    let best: SongNote | null = null;
    let bestDiff = Infinity;
    for (const note of this.activeNotes) {
      if (note.lane !== lane) continue;
      if (note.autoPlayed) continue;
      const diff = Math.abs(note.time - currentTime);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = note;
      }
    }
    return best;
  }

  isComplete(): boolean {
    return this._selectedResolvedCount >= this._selectedNoteCount && this._selectedNoteCount > 0;
  }

  getActiveNotes(currentTime: number, height: number, learningMode = false): ActiveNoteRender[] {
    const hitZoneY = height * HIT_ZONE_Y_RATIO;
    let writeIdx = 0;

    for (const note of this.activeNotes) {
      if ((note.hit || note.missed) && !note.failing) continue;
      const color = handColor(note.key);

      if (writeIdx >= this._notePool.length) {
        this._notePool.push({ lane: 0, y: 0, height: 0, color: '', alpha: 0, duration: 0, key: '', holding: false, failing: false, waiting: false, selected: false });
      }
      const r = this._notePool[writeIdx];

      if (note.holding) {
        const remaining = Math.max(12, (note.time + note.duration - currentTime) * SCROLL_SPEED);
        const y = hitZoneY - remaining;
        r.lane = note.lane;
        r.y = y;
        r.height = remaining;
        r.color = color;
        r.alpha = 1;
        r.duration = note.duration;
        r.key = note.key;
        r.holding = true;
        r.failing = false;
        r.waiting = false;
        r.selected = note.selected;
      } else {
        const timeDiff = note.time - currentTime;
        const noteHeight = Math.max(12, note.duration * SCROLL_SPEED);
        const y = hitZoneY - timeDiff * SCROLL_SPEED - noteHeight;
        r.lane = note.lane;
        r.y = y;
        r.height = noteHeight;
        r.color = color;
        r.alpha = y + noteHeight < 0 ? 0 : 1;
        r.duration = note.duration;
        r.key = note.key;
        r.holding = false;
        r.failing = note.failing;
        r.waiting = learningMode && timeDiff <= 0;
        r.selected = note.selected;
      }
      writeIdx++;
    }

    this._notePool.length = writeIdx;
    return this._notePool;
  }
}

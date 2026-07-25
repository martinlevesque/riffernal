// Game orchestrates the main loop, rendering, input, and scoring.
// Supports PLAY mode (full scoring) and LEARN mode (freezes at notes,
// optional one-hand practice with auto-played accompaniment).

import { Renderer } from './rendering/Renderer.js';
import { LoopDefinitionState } from './Loop.js';
export { LoopDefinitionState };
import { NoteManager, SCROLL_SPEED, HIT_ZONE_Y_RATIO } from './NoteManager.js';
import type { HitResult, SongNote } from './NoteManager.js';
import { NoteGrade, gradeLabel, TAP_NOTE_THRESHOLD, SUCCESS_PARTICLE_HOLD_RATIO, comboBoost } from './scoring.js';
import type { Scoring } from './scoring.js';
import { NOTE_TO_LANE, handColor, getPianoKeyLayout, PracticeHand, GM_DRUM_CHANNEL } from '../utils/notes.js';
import { formatTime } from '../utils/helpers.js';
import { hasMeaningfulScore } from './scoring.js';
import type { VisibleRange } from '../utils/notes.js';
import type { Synth } from '../audio/Synth.js';
import type { Patch } from '../audio/patches/Patch.js';
import { guitarCleanPatch, guitarOverdrivenPatch, guitarDistortionPatch } from '../audio/patches/guitarPatch.js';
import { bassPatch } from '../audio/patches/bassPatch.js';
import { violinPatch } from '../audio/patches/violinPatch.js';
import { drumPatch } from '../audio/patches/drumPatch.js';
import type { KeyboardInput } from '../input/KeyboardInput.js';
import type { MidiInput } from '../input/MidiInput.js';
import type { ScoreDisplay } from '../ui/ScoreDisplay.js';
import type { Song } from '../utils/MidiParser.js';
import { LoopController } from './LoopController.js';
import { ResultsScreen } from './rendering/ResultsScreen.js';
import { themeManager } from '../themes/ThemeManager.js';

export enum GameState {
  Menu = 'menu',
  Playing = 'playing',
  Results = 'results',
}

function getFeedbackColors(): Record<NoteGrade | 'MISS', string> {
  const c = themeManager.css;
  return {
    [NoteGrade.PERFECT]: c.accentYellow,
    [NoteGrade.GREAT]: c.accentGreen,
    [NoteGrade.GOOD]: c.accentBlue,
    MISS: c.accentRed,
  };
}

const COUNTDOWN_SECONDS = 1.5;
const RESULTS_DELAY_SECONDS = 1;
/** Pre-roll buffer applied at game start and between chained loops, so
 *  the player has a moment to prepare before notes activate. Matches the
 *  fresh-game countdown for visual consistency. */
const LOOP_TRANSITION_SECONDS = COUNTDOWN_SECONDS;

export class Game {
  canvas: HTMLCanvasElement;
  renderer: Renderer;
  noteManager: NoteManager;
  private synth: Synth;
  private keyboardInput: KeyboardInput;
  private midiInput: MidiInput;
  state: GameState = GameState.Menu;
  private currentSong: Song | null = null;
  get song(): Song | null { return this.currentSong; }
  currentTime = 0;
  private refGameTime = 0;
  private refRealTime = 0;
  private animationId: number | null = null;
  private pressedLanes = new Map<number, number>();
  scrollOffset = 0;
  speedMultiplier = 1.0;
  scoreDisplay: ScoreDisplay | null = null;
  learningMode = false;
  loopPlay = false;
  practiceHand: PracticeHand = PracticeHand.Both;
  private _usedLearningMode = false;
  get usedLearningMode(): boolean { return this._usedLearningMode; }
  songBpm = 120;
  showUsedKeys = false;
  octaveAgnostic = false;
  usedNoteRange: VisibleRange | null = null;
  /** When true, the web app's synth is silent on live key presses; the
   *  scored/visual note still plays so a plugged-in MIDI keyboard remains
   *  the audible source. Persisted per user-song. */
  mainTrackMuted = false;

  private _paused = false;
  get paused(): boolean { return this._paused; }

  onResults: ((scoring: Scoring, song: Song) => void) | null = null;
  /** Fired (debounced externally) when the user changes the in-game Tracks
   *  panel state for the current song, so main.ts can persist it. */
  onTrackPreferencesChange: ((song: Song) => void) | null = null;

  readonly loop = new LoopController();
  private resultsScreen = new ResultsScreen();

  private playScreen: HTMLElement;
  private menuScreen: HTMLElement;
  private resizeHandle: HTMLElement;
  private timeDisplayEl: HTMLElement;
  private _onResize: () => void;
  private _resizeRaf = false;
  private _boundLoop: () => void;
  private _lastFrameTime = 0;
  private _completionTime: number | null = null;
  private _lastSheetBottom = -1;
  private _frameCount = 0;

  constructor(canvas: HTMLCanvasElement, synth: Synth, keyboardInput: KeyboardInput, midiInput: MidiInput) {
    this.canvas = canvas;
    this.renderer = new Renderer(canvas);
    this.noteManager = new NoteManager();
    this.synth = synth;
    this.keyboardInput = keyboardInput;
    this.midiInput = midiInput;

    this.playScreen = document.getElementById('play-screen')!;
    this.menuScreen = document.getElementById('menu-screen')!;
    this.resizeHandle = document.getElementById('sheet-resize-handle')!;
    this.timeDisplayEl = document.getElementById('time-display')!;

    this._onResize = () => {
      if (!this._resizeRaf) {
        this._resizeRaf = true;
        requestAnimationFrame(() => {
          this.renderer.resize();
          this._resizeRaf = false;
        });
      }
    };
    window.addEventListener('resize', this._onResize);

    this._boundLoop = (): void => {
      if (this._paused) return;

      const now = performance.now() / 1000;
      const delta = this._lastFrameTime ? now - this._lastFrameTime : 1 / 60;
      this._lastFrameTime = now;
      this._frameCount++;

      this._updateFrameTime(now, delta);
      this._checkLoopWrap();

      this.scrollOffset += SCROLL_SPEED * delta * this.speedMultiplier;

      this.renderer.clear();
      this.renderer.beginFrame(performance.now());
      this.renderer.drawHighway(this.scrollOffset, this.pressedLanes, this.usedNoteRange);

      if (this.state === GameState.Playing) {
        this._renderPlayingFrame();
      }

      if (this.renderer.sheetBottom !== this._lastSheetBottom) {
        this._lastSheetBottom = this.renderer.sheetBottom;
        this.resizeHandle.style.top = `${this.renderer.sheetBottom}px`;
      }

      this.renderer.drawParticles();
      this.renderer.drawPiano(this.pressedLanes, this.usedNoteRange);
      this.renderer.drawHitZone(this.pressedLanes, this.usedNoteRange);

      if (this.state !== GameState.Menu) {
        this.animationId = requestAnimationFrame(this._boundLoop);
      }
    };
  }

  // -- Loop forwarding ------------------------------------------------------

  /** Current (playing) loop's start, or null when the chain is idle. */
  get loopStart(): number | null { return this.loop.start; }
  /** Current loop's end, or null when the chain is idle. */
  get loopEnd(): number | null { return this.loop.end; }
  /** True when the chain is engaged (≥1 enabled loop, currentIndex set). */
  get loopActive(): boolean { return this.loop.active; }
  get loopDefinitionState(): LoopDefinitionState { return this.loop.definitionState; }
  set loopDefinitionState(v: LoopDefinitionState) { this.loop.definitionState = v; }

  beginLoopDefine(): void { this.loop.beginDefine(); }
  setLoopBoundary(time: number): LoopDefinitionState {
    return this.loop.setBoundary(time);
  }
  /** Abort the in-progress define draft. */
  cancelLoopDraft(): void { this.loop.cancelDraft(); }
  /** Disengage the chain (e.g. when switching to PLAY mode). Saved loops
   *  are kept; only the active playback position is cleared. */
  deactivateLoop(): void { this.loop.disengage(); this.loopPlay = false; this._applyScoringEnabled(); }
  /** Fully reset loop state — used by `start()` on a fresh game. */
  clearLoop(): void { this.loop.clear(); this.loopPlay = false; this._applyScoringEnabled(); }

  /** Engage the chain from the first enabled loop and seek to it with the
   *  countdown buffer. Returns true when engaged (≥1 enabled loop). Called
   *  by main.ts after `start()` for a fresh game; `retry()` does NOT call
   *  this so it can preserve the user's engaged/disengaged state. */
  engageChain(): boolean {
    if (!this.loop.engage()) return false;
    const first = this.loop.current;
    if (first && this.state === GameState.Playing) {
      this._seekWithBuffer(first.startTime, COUNTDOWN_SECONDS);
    }
    this._applyScoringEnabled();
    return true;
  }

  /** Load saved loops for the current song into the controller (no
   *  chain engagement or seek). Call before `start()` so `start()` can
   *  engage the chain with the countdown buffer. Also disengages any
   *  stale chain state from a previous song. */
  loadLoops(loops: Array<{ id: number; startTime: number; endTime: number; enabled: boolean }>): void {
    this.loop.setLoops(loops);
    this.loop.disengage();
    this.loop.cancelDraft();
  }

  /** Add a saved loop (already persisted) to the controller's local set.
   *  If the chain is engaged the new loop participates in the next chain
   *  recompute. If the chain is idle and the new loop is enabled, engage. */
  addSavedLoop(loop: { id: number; startTime: number; endTime: number; enabled: boolean }): void {
    this.loop.addLoop(loop);
    if (!this.loop.active && this.loop.chain.length > 0) {
      this.loop.engage();
      const first = this.loop.current;
      if (first && this.state === GameState.Playing) {
        this._seekWithBuffer(first.startTime, LOOP_TRANSITION_SECONDS);
      }
      this._applyScoringEnabled();
    }
  }

  /** Update a saved loop's enabled flag. Handles chain transitions:
   *  - Chain becomes empty → disengage, resume normal play.
   *  - Chain was empty, now non-empty → engage from the first loop.
   *  - The currently-playing loop was disabled (or currentIndex is now
   *    out of bounds after recompute) → re-engage from the first loop.
   *  - Otherwise (toggle a non-current loop) the current loop keeps
   *    playing unchanged. */
  setLoopEnabled(loopId: number, enabled: boolean): void {
    const wasCurrent = this.loop.current?.id === loopId;
    this.loop.setEnabled(loopId, enabled);
    const chainLen = this.loop.chain.length;
    if (chainLen === 0) {
      if (this.loop.active) {
        this.loop.disengage();
        this.loopPlay = false;
      }
      this._applyScoringEnabled();
      return;
    }
    // Re-engage when: chain was empty, OR the current loop was the one
    // toggled off, OR currentIndex is now out of bounds.
    const outOfBounds = this.loop.currentIndex !== null && this.loop.currentIndex >= chainLen;
    const needReengage = this.loop.currentIndex === null || (enabled === false && wasCurrent) || outOfBounds;
    if (needReengage && this.state === GameState.Playing) {
      this.loop.engage();
      const first = this.loop.current;
      if (first) this._seekWithBuffer(first.startTime, LOOP_TRANSITION_SECONDS);
      this._applyScoringEnabled();
    }
  }

  /** Delete a saved loop. Adjusts the chain: if the current loop was
   *  removed, advance to the next (or disengage if the chain is empty). */
  deleteSavedLoop(loopId: number): void {
    const wasCurrent = this.loop.current?.id === loopId;
    this.loop.remove(loopId);
    const chainLen = this.loop.chain.length;
    if (chainLen === 0) {
      this.loop.disengage();
      this.loopPlay = false;
      this._applyScoringEnabled();
      return;
    }
    if (wasCurrent && this.state === GameState.Playing) {
      // The current loop was removed. Clamp currentIndex to the new
      // chain length (lands on the loop that shifted into its slot, or
      // the last loop if the deleted one was at the end) and seek there.
      this.loop.currentIndex = Math.min(this.loop.currentIndex ?? 0, chainLen - 1);
      const current = this.loop.current;
      if (current) this._seekWithBuffer(current.startTime, LOOP_TRANSITION_SECONDS);
      this._applyScoringEnabled();
    }
  }

  // -- Frame time & loop wrap -----------------------------------------------

  private _updateFrameTime(now: number, _delta: number): void {
    const rawTime = this.refGameTime + (now - this.refRealTime) * this.speedMultiplier;

    let frameTime = rawTime;
    if (this.learningMode && !this.loopPlay && this.state === GameState.Playing) {
      const loopEndCutoff = this.loop.active ? this.loop.end : null;
      const waitTime = this.noteManager.getEarliestWaitTime(rawTime, loopEndCutoff);
      if (waitTime !== null) frameTime = Math.min(rawTime, waitTime);
      if (frameTime < rawTime) {
        // Frozen at a waiting note: re-anchor so rawTime doesn't race ahead
        // while the player takes their time. Otherwise, on release the game
        // time would snap forward by the full wait duration, causing the
        // next notes to fail instantly and failing notes to scroll too fast.
        this.refGameTime = frameTime;
        this.refRealTime = now;
      }
    }
    this.currentTime = frameTime;
  }

  private _checkLoopWrap(): void {
    // Cache the chain once: the per-frame read checks below would each
    // recompute it (filter + sort) via the `chain`/`current`/`active`
    // getters. `advance()` recomputes it too, but only runs when a wrap
    // actually fires (~once at the boundary, not every frame).
    const chain = this.loop.chain;
    const idx = this.loop.currentIndex;
    if (chain.length === 0 || idx === null || idx >= chain.length) return;
    const current = chain[idx];
    const effectiveEnd = this.noteManager.getLoopEffectiveEnd(current.endTime);
    if (!(this.currentTime >= effectiveEnd)) return;

    // Advance to the next loop in the chain (wraps to 0 at the end). Apply
    // a pre-roll buffer only when transitioning to a DIFFERENT loop (the
    // chain moves to a new region the player hasn't just rehearsed); a
    // single loop wrapping back to itself restarts immediately, matching
    // the prior single-loop practice UX.
    const prevIndex = this.loop.currentIndex;
    this.noteManager.scoring.resetCombo();
    const next = this.loop.advance();
    if (!next) return;
    const sameLoop = prevIndex !== null && this.loop.currentIndex === prevIndex;
    if (sameLoop) {
      this.seekTo(next.startTime);
    } else {
      this._seekWithBuffer(next.startTime, LOOP_TRANSITION_SECONDS);
    }
  }

  /** Seek to `time` with a pre-roll `buffer` (seconds) so the player has a
   *  visual lead-in before notes activate. Delegates to `seekTo` for the
   *  shared clamp/reset logic, then backs up the time anchors by `buffer`. */
  private _seekWithBuffer(time: number, buffer: number): void {
    this.seekTo(time);
    this.refGameTime = this.currentTime - buffer;
    this.currentTime = this.refGameTime;
  }

  // -- Playing frame rendering ----------------------------------------------

  private _renderPlayingFrame(): void {
    const loopEndCutoff = this.loop.active ? this.loop.end : null;
    this.noteManager.update(this.currentTime, this.renderer.height, loopEndCutoff);

    this.renderer.drawSheetMusic(
      this.noteManager.trebleNotes,
      this.noteManager.bassNotes,
      this.currentTime,
      this.noteManager.getSongDuration(),
      this.loop.snapshot(),
      undefined,
      this.songBpm,
    );

    const activeNotes = this.noteManager.getActiveNotes(this.currentTime, this.renderer.height, this.learningMode);
    const combo = this.noteManager.scoring.combo;
    for (const note of activeNotes) {
      this.renderer.drawNote(note.lane, note.y, note.height, note.selected ? note.color : themeManager.canvas.backingNote, note.alpha, this.renderer.sheetBottom, combo, note.key, note.holding, note.failing, note.waiting, this.usedNoteRange);
    }

    this.renderer.drawGrind(this.currentTime, this.usedNoteRange);

    this.scoreDisplay?.update(this.noteManager.scoring);
    if (this._frameCount % 6 === 0) {
      this.timeDisplayEl.textContent = `${formatTime(this.currentTime)} / ${formatTime(this.noteManager.getSongDuration())}`;
    }
    this._checkCompletion();
  }

  private _checkCompletion(): void {
    if (!this.noteManager.isComplete()) {
      this._completionTime = null;
      return;
    }
    if (this._completionTime === null) {
      this._completionTime = this.currentTime;
    } else if (this.currentTime - this._completionTime >= RESULTS_DELAY_SECONDS) {
      this._showResults();
    }
  }

  // -- Song lifecycle -------------------------------------------------------

  start(song: Song): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    this.currentSong = song;
    this.noteManager.loadSong(song);
    this.songBpm = song.bpm;
    this.refGameTime = -COUNTDOWN_SECONDS;
    this.refRealTime = performance.now() / 1000;
    this.state = GameState.Playing;
    this.pressedLanes.clear();
    this._completionTime = null;
    this._paused = false;
    this._usedLearningMode = false;
    this.renderer.clearGrind();
    this._computeUsedNoteRange(song);

    this.menuScreen.classList.remove('active');
    this.resultsScreen.hide();
    this.playScreen.classList.add('active');

    // Reset chain/draft state but keep saved loops (loaded by main.ts
    // via loadLoops before start()). clearLoop() would wipe them.
    this.loop.disengage();
    this.loop.cancelDraft();
    this.loopPlay = false;
    this._applyScoringEnabled();
    this._setupInputHandlers();
    this._setupNoteCallbacks();

    this._lastFrameTime = 0;
    this._boundLoop();
  }

  /** Pause the game loop. Used by main.ts to freeze the game while the
   *  pre-game info popup is visible. */
  pause(): void {
    this._paused = true;
  }

  private _computeUsedNoteRange(song: Song): void {
    if (!this.showUsedKeys) {
      this.usedNoteRange = null;
      return;
    }
    let min = Infinity;
    let max = -1;
    for (const note of song.notes) {
      const idx = NOTE_TO_LANE.get(note.key);
      if (idx === undefined) continue;
      if (idx < min) min = idx;
      if (idx > max) max = idx;
    }
    this.usedNoteRange = max === -1 ? null : { minNoteIdx: min, maxNoteIdx: max };
  }

  setShowUsedKeys(enabled: boolean): void {
    this.showUsedKeys = enabled;
    if (this.currentSong) {
      this._computeUsedNoteRange(this.currentSong);
    }
  }

  private _setupInputHandlers(): void {
    this.keyboardInput.onNoteOn = (note, keyCode, velocity) => this._handleNoteOn(note, keyCode, velocity);
    this.keyboardInput.onNoteOff = (note, keyCode) => this._handleNoteOff(note, keyCode);
    this.midiInput.onNoteOn = (note, id, velocity) => this._handleNoteOn(note, id, velocity);
    this.midiInput.onNoteOff = (note, id) => this._handleNoteOff(note, id);

    this.keyboardInput.start();
    this.synth.init();
    this.synth.resume();
  }

  private _setupNoteCallbacks(): void {
    this.noteManager.onMiss = (note) => this._playNoteOnce(note);
    this.noteManager.onAutoPlayOn = (note) => this._playNoteOnce(note);

    this.noteManager.onResolve = (result) => {
      const grade = result.grade;
      if (grade === null) {
        this.scoreDisplay?.showFeedback('Miss', getFeedbackColors().MISS);
        return;
      }
      const label = gradeLabel(grade);
      const color = getFeedbackColors()[grade];
      this.scoreDisplay?.showFeedback(`+${result.score} ${label}`, color);

      const note = result.note;
      const holdRatio = note.duration > 0 ? note.accumulatedHeldDuration / note.duration : 0;
      const isTapNote = note.duration <= TAP_NOTE_THRESHOLD;

      if (holdRatio >= SUCCESS_PARTICLE_HOLD_RATIO || isTapNote) {
        const hitZoneY = this.renderer.height * HIT_ZONE_Y_RATIO;
        const keyLayout = getPianoKeyLayout(note.key, this.renderer.width, this.usedNoteRange);
        const noteColor = handColor(note.key);
        const combo = this.noteManager.scoring.combo;
        const count = 10 + Math.floor(comboBoost(combo) * 20);
        this.renderer.spawnParticles(
          keyLayout.x + keyLayout.width / 2,
          hitZoneY,
          noteColor,
          count,
        );
      }
    };
  }

  // -- Input handling -------------------------------------------------------

  private _handleNoteOn(noteName: string, _id: string, velocity: number): void {
    const lane = NOTE_TO_LANE.get(noteName);
    if (lane === undefined) return;

    this.pressedLanes.set(lane, velocity);
    const activeNote = this.noteManager.findActiveNoteForLane(this.currentTime, lane);
    if (!this.mainTrackMuted) {
      const patch = activeNote
        ? this._patchForNote(activeNote.program, activeNote.channel)
        : this.synth.getPatch();
      this.synth.noteOn(noteName, patch, undefined, activeNote?.rawMidi);
    }

    if (this.state === GameState.Playing) {
      const results = this._resolveHit(lane);
      this._spawnPerfectParticles(results);
      this._triggerGrind(results);
    }
  }

  private _resolveHit(lane: number): HitResult[] {
    if (this.learningMode) {
      const outcome = this.noteManager.checkLearningHit(this.currentTime, lane, performance.now(), this.octaveAgnostic);
      if (outcome.wrong) this.scoreDisplay?.showFeedback('Wrong', getFeedbackColors().MISS);
      return outcome.results;
    }
    const r = this.noteManager.checkHit(this.currentTime, lane, this.octaveAgnostic);
    if (r === null && !this.noteManager.hasUnresolvedNoteInLane(lane, this.currentTime, this.octaveAgnostic)) {
      this.scoreDisplay?.showFeedback('Wrong', getFeedbackColors().MISS);
    }
    return r ? [r] : [];
  }

  private _spawnPerfectParticles(results: HitResult[]): void {
    const hitZoneY = this.renderer.height * HIT_ZONE_Y_RATIO;
    const combo = this.noteManager.scoring.combo;
    const comboBoostValue = comboBoost(combo);
    for (const result of results) {
      if (result.result === NoteGrade.PERFECT) {
        const noteColor = handColor(result.note.key);
        const keyLayout = getPianoKeyLayout(result.note.key, this.renderer.width, this.usedNoteRange);
        this.renderer.spawnParticles(
          keyLayout.x + keyLayout.width / 2,
          hitZoneY,
          noteColor,
          15 + Math.floor(comboBoostValue * 25),
        );
      }
    }
  }

  private _triggerGrind(results: HitResult[]): void {
    if (results.length === 0) return;
    for (const result of results) {
      const grindLane = result.note.lane;
      const color = handColor(result.note.key);
      this.renderer.triggerGrindFlash(grindLane, color);
      if (result.note.holding && result.note.duration > TAP_NOTE_THRESHOLD) {
        this.renderer.startGrindBeam(grindLane, color, result.note.time + result.note.duration);
      }
    }
  }

  private _handleNoteOff(noteName: string, _id: string): void {
    const lane = NOTE_TO_LANE.get(noteName);
    if (lane === undefined) return;

    this.pressedLanes.delete(lane);
    this.synth.noteOff(noteName);
    this.renderer.endGrindBeam(lane);

    if (this.state === GameState.Playing) {
      this.noteManager.checkRelease(this.currentTime, lane, this.octaveAgnostic);
    }
  }

  // -- Results & navigation -------------------------------------------------

  /** Returns true when the current score beats the stored best for this song.
   *  A score of 0 (no notes hit) is never considered a new best, so we don't
   *  present a meaningless "New Best!" for a run that scored nothing. */
  isNewBest(): boolean {
    const score = this.noteManager.scoring.score;

    return (
      !this._usedLearningMode &&
      this.currentSong != null &&
      hasMeaningfulScore(score) &&
      (this.currentSong.bestScore == null || score > this.currentSong.bestScore)
    );
  }

  private _showResults(): void {
    this.state = GameState.Results;
    this.playScreen.classList.remove('active');

    this.resultsScreen.show(this.noteManager.scoring, this._usedLearningMode, this.isNewBest());

    if (this.currentSong) {
      this.onResults?.(this.noteManager.scoring, this.currentSong);
    }

    this.keyboardInput.stop();
    this.midiInput.onNoteOn = null;
    this.midiInput.onNoteOff = null;
    this.synth.releaseAll();
  }

  retry(): void {
    if (!this.currentSong) return;
    // Preserve saved loops across a restart. start() disengages the chain
    // (but keeps saved loops). When in LEARN mode and ≥1 loop is enabled,
    // restart always goes back to the FIRST enabled loop (index 0) with
    // the pre-roll buffer — regardless of where playback was before. In
    // PLAY mode (or with zero enabled loops), the song restarts from the
    // beginning normally, since loops disable scoring and a competitive
    // PLAY run should not be looped. Callers (main.ts) call setMode()
    // before retry(), so learningMode reflects the intended post-retry
    // mode by the time we reach here.
    const savedLoops = this.loop.loops;
    this.start(this.currentSong);
    this.loop.setLoops(savedLoops);
    if (this.learningMode && this.loop.chain.length > 0) {
      this.loop.engage();
      const first = this.loop.current;
      if (first) this._seekWithBuffer(first.startTime, LOOP_TRANSITION_SECONDS);
      this._applyScoringEnabled();
    }
  }

  backToMenu(): void {
    this.state = GameState.Menu;
    this.resultsScreen.hide();
    this.playScreen.classList.remove('active');
    this.menuScreen.classList.add('active');
    this.keyboardInput.stop();
    this.synth.releaseAll();
    this.keyboardInput.onNoteOn = null;
    this.keyboardInput.onNoteOff = null;
    this.midiInput.onNoteOn = null;
    this.midiInput.onNoteOff = null;
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  private _applyScoringEnabled(): void {
    this.noteManager.scoring.enabled = !this.loop.active || !this.learningMode;
  }

  private _patchForNote(program: number, channel: number): Patch {
    if (channel === GM_DRUM_CHANNEL) return drumPatch;
    // GM Guitar programs: 25-31 (Steel, Jazz, Clean, Muted, Overdriven, Distortion, Harmonics)
    if (program >= 25 && program <= 28) return guitarCleanPatch;
    if (program === 29) return guitarOverdrivenPatch;
    if (program === 30) return guitarDistortionPatch;
    if (program === 31) return guitarCleanPatch;
    // GM Bass programs: 32-39 (Acoustic Bass through Synth Bass 2)
    if (program >= 32 && program <= 39) return bassPatch;
    // GM bowed strings: 40-44 (Violin, Viola, Cello, Contrabass, Tremolo Strings)
    // GM string ensembles: 48-51 (String Ensemble, Synth Strings)
    if ((program >= 40 && program <= 44) || (program >= 48 && program <= 51)) return violinPatch;
    return this.synth.getPatch();
  }

  private _playNoteOnce(note: SongNote): void {
    // Honour the main-track mute for foreground (selected) notes — these are
    // the "note songs" the player is meant to play, auto-played on miss in
    // PLAY mode. Background-accompaniment notes are governed by their own
    // per-track toggle and must keep playing.
    if (note.selected && this.mainTrackMuted) return;
    const realDuration = note.duration * 1000 / this.speedMultiplier;
    const id = `auto_${note.track}_${note.time}_${note.key}`;
    const patch = this._patchForNote(note.program, note.channel);
    this.synth.noteOn(note.key, patch, id, note.rawMidi);
    setTimeout(() => this.synth.noteOff(id), realDuration);
  }

  // -- Playback controls ----------------------------------------------------

  togglePause(): void {
    if (this._paused) {
      this._paused = false;
      this.refGameTime = this.currentTime;
      this.refRealTime = performance.now() / 1000;
      this._lastFrameTime = 0;
      this._boundLoop();
    } else {
      this._paused = true;
      if (this.animationId !== null) {
        cancelAnimationFrame(this.animationId);
        this.animationId = null;
      }
    }
  }

  setSpeed(multiplier: number): void {
    this.refGameTime = this.currentTime;
    this.refRealTime = performance.now() / 1000;
    this.speedMultiplier = Math.max(0.1, Math.min(2.0, multiplier));
  }

  /** Re-anchor playback at `time` (seconds) and reset note gameplay state
   *  from that point onward. Used by loop wrap and click-to-seek. */
  seekTo(time: number): void {
    const duration = this.noteManager.getSongDuration();
    const clamped = Math.max(0, Math.min(time, Math.max(0, duration - 0.01)));
    this.refGameTime = clamped;
    this.refRealTime = performance.now() / 1000;
    this.currentTime = clamped;
    this.scrollOffset = 0;
    this._completionTime = null;
    this.pressedLanes.clear();
    this.renderer.clearGrind();
    this.noteManager.resetFromTime(clamped);
  }

  seekToNextNote(): void {
    const nextTime = this.noteManager.findNextUnplayedTime(this.currentTime);
    if (nextTime !== null) {
      this.seekTo(Math.max(0, nextTime - 2));
    }
  }

  setLearningMode(enabled: boolean): void {
    this.learningMode = enabled;
    this.noteManager.learningMode = enabled;
    if (enabled) this._usedLearningMode = true;
    this.noteManager.resetLearningState();
    this.refGameTime = this.currentTime;
    this.refRealTime = performance.now() / 1000;
  }

  setPracticeHand(hand: PracticeHand): void {
    this.practiceHand = hand;
    this.noteManager.practiceHand = hand;
    this.noteManager.resetLearningState();
  }

  setBackgroundTrack(trackIndex: number, enabled: boolean): void {
    this.noteManager.setBackgroundTrack(trackIndex, enabled);
    if (this.currentSong) {
      if (enabled) {
        if (!this.currentSong.backgroundTracks) this.currentSong.backgroundTracks = [];
        if (!this.currentSong.backgroundTracks.includes(trackIndex)) {
          this.currentSong.backgroundTracks.push(trackIndex);
        }
      } else {
        if (this.currentSong.backgroundTracks) {
          this.currentSong.backgroundTracks = this.currentSong.backgroundTracks.filter((i) => i !== trackIndex);
        }
      }
      this._syncTrackPreferences();
      this.onTrackPreferencesChange?.(this.currentSong);
    }
  }

  /** Mute or unmute the main (live key-press) track. The scored/visual note
   *  still plays; only the app's synth output for live presses is silenced
   *  so a plugged-in MIDI keyboard remains audible. */
  setMainTrackMuted(muted: boolean): void {
    this.mainTrackMuted = muted;
    if (this.currentSong) {
      this._syncTrackPreferences();
      this.onTrackPreferencesChange?.(this.currentSong);
    }
  }

  /** Keep `currentSong.trackPreferences` mirroring the live mute state so a
   *  following `retry()` (which reuses `currentSong`) preserves the user's
   *  choices, and main.ts can persist the whole struct at once. */
  private _syncTrackPreferences(): void {
    if (!this.currentSong) return;
    this.currentSong.trackPreferences = {
      backgroundTracks: [...(this.currentSong.backgroundTracks ?? [])],
      mainTrackMuted: this.mainTrackMuted,
    };
  }
}

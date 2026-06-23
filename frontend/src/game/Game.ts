// Game orchestrates the main loop, rendering, input, and scoring.
// Supports PLAY mode (full scoring) and LEARN mode (freezes at notes,
// optional one-hand practice with auto-played accompaniment).

import { Renderer } from './Renderer.js';
import { LoopDefinitionState } from './Loop.js';
export { LoopDefinitionState };
import { NoteManager, SCROLL_SPEED, HIT_ZONE_Y_RATIO } from './NoteManager.js';
import type { HitResult, SongNote } from './NoteManager.js';
import { NoteGrade, gradeLabel, TAP_NOTE_THRESHOLD, SUCCESS_PARTICLE_HOLD_RATIO } from './scoring.js';
import { NOTE_TO_LANE, NOTE_COLORS, getPianoKeyLayout, PracticeHand } from '../utils/notes.js';
import type { Synth } from '../audio/Synth.js';
import type { KeyboardInput } from '../input/KeyboardInput.js';
import type { MidiInput } from '../input/MidiInput.js';
import type { ScoreDisplay } from '../ui/ScoreDisplay.js';
import type { Song } from '../utils/MidiParser.js';
import { LoopController } from './LoopController.js';
import { ResultsScreen } from './ResultsScreen.js';

export enum GameState {
  Menu = 'menu',
  Playing = 'playing',
  Results = 'results',
}

const FEEDBACK_COLORS: Record<NoteGrade | 'MISS', string> = {
  [NoteGrade.PERFECT]: '#ffdd22',
  [NoteGrade.GREAT]: '#22ff66',
  [NoteGrade.GOOD]: '#2288ff',
  MISS: '#ff2244',
};

const COUNTDOWN_SECONDS = 1.5;
const RESULTS_DELAY_SECONDS = 1;

export class Game {
  canvas: HTMLCanvasElement;
  renderer: Renderer;
  noteManager: NoteManager;
  private synth: Synth;
  private keyboardInput: KeyboardInput;
  private midiInput: MidiInput;
  state: GameState = GameState.Menu;
  private currentSong: Song | null = null;
  currentTime = 0;
  private refGameTime = 0;
  private refRealTime = 0;
  private animationId: number | null = null;
  private pressedLanes = new Set<number>();
  scrollOffset = 0;
  speedMultiplier = 1.0;
  scoreDisplay: ScoreDisplay | null = null;
  learningMode = false;
  practiceHand: PracticeHand = PracticeHand.Both;
  private _usedLearningMode = false;
  songBpm = 120;

  readonly loop = new LoopController();
  private resultsScreen = new ResultsScreen();

  private playScreen: HTMLElement;
  private menuScreen: HTMLElement;
  private resizeHandle: HTMLElement;
  private _onResize: () => void;
  private _boundLoop: () => void;
  private _lastFrameTime = 0;
  private _completionTime: number | null = null;

  constructor(canvas: HTMLCanvasElement, synth: Synth, keyboardInput: KeyboardInput, midiInput: MidiInput) {
    this.canvas = canvas;
    this.renderer = new Renderer(canvas);
    this.noteManager = new NoteManager();
    this.synth = synth;
    this.keyboardInput = keyboardInput;
    this.midiInput = midiInput;

    this.playScreen = document.getElementById('play-screen')!;
    this.resultsScreenEl = document.getElementById('results-screen')!;
    this.menuScreen = document.getElementById('menu-screen')!;
    this.resizeHandle = document.getElementById('sheet-resize-handle')!;

    this._onResize = () => this.renderer.resize();
    window.addEventListener('resize', this._onResize);

    this._boundLoop = (): void => {
      const now = performance.now() / 1000;
      const delta = this._lastFrameTime ? now - this._lastFrameTime : 1 / 60;
      this._lastFrameTime = now;

      this._updateFrameTime(now, delta);
      this._checkLoopWrap();

      this.scrollOffset += SCROLL_SPEED * delta * this.speedMultiplier;

      this.renderer.clear();
      this.renderer.drawHighway(this.scrollOffset);

      if (this.state === GameState.Playing) {
        this._renderPlayingFrame();
      }

      this.resizeHandle.style.top = `${this.renderer.sheetBottom}px`;

      this.renderer.drawParticles();
      this.renderer.drawPiano(this.pressedLanes);
      this.renderer.drawHitZone(this.pressedLanes);

      if (this.state !== GameState.Menu) {
        this.animationId = requestAnimationFrame(this._boundLoop);
      }
    };
  }

  // -- Loop forwarding ------------------------------------------------------

  get loopStart(): number | null { return this.loop.start; }
  set loopStart(v: number | null) { this.loop.start = v; }
  get loopEnd(): number | null { return this.loop.end; }
  set loopEnd(v: number | null) { this.loop.end = v; }
  get loopActive(): boolean { return this.loop.active; }
  set loopActive(v: boolean) { this.loop.active = v; }
  get loopDefinitionState(): LoopDefinitionState { return this.loop.definitionState; }
  set loopDefinitionState(v: LoopDefinitionState) { this.loop.definitionState = v; }

  beginLoopDefine(): void { this.loop.beginDefine(); }
  setLoopBoundary(time: number): LoopDefinitionState {
    const result = this.loop.setBoundary(time);
    if (result === LoopDefinitionState.Off) this._applyScoringEnabled();
    return result;
  }
  deactivateLoop(): void { this.loop.deactivate(); this._applyScoringEnabled(); }
  clearLoop(): void { this.loop.clear(); this._applyScoringEnabled(); }

  // -- Frame time & loop wrap -----------------------------------------------

  private _updateFrameTime(now: number, _delta: number): void {
    const rawTime = this.refGameTime + (now - this.refRealTime) * this.speedMultiplier;

    let frameTime = rawTime;
    if (this.learningMode && this.state === GameState.Playing) {
      const waitTime = this.noteManager.getEarliestWaitTime(rawTime);
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
    if (
      this.loop.shouldRewind(this.currentTime, this.noteManager.getLoopEffectiveEnd(this.loop.end!))
    ) {
      this.seekTo(this.loop.start!);
    }
  }

  // -- Playing frame rendering ----------------------------------------------

  private _renderPlayingFrame(): void {
    this.noteManager.update(this.currentTime, this.renderer.height);

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
    for (const note of activeNotes) {
      this.renderer.drawNote(note.lane, note.y, note.height, note.color, note.alpha, this.renderer.sheetBottom, note.key, note.holding, note.failing, note.waiting);
    }

    this.scoreDisplay?.update(this.noteManager.scoring);
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
    this._usedLearningMode = false;

    this.menuScreen.classList.remove('active');
    this.resultsScreen.hide();
    this.playScreen.classList.add('active');

    this.clearLoop();
    this._setupInputHandlers();
    this._setupNoteCallbacks();

    this._lastFrameTime = 0;
    this._boundLoop();
  }

  private _setupInputHandlers(): void {
    this.keyboardInput.onNoteOn = (note, keyCode) => this._handleNoteOn(note, keyCode);
    this.keyboardInput.onNoteOff = (note, keyCode) => this._handleNoteOff(note, keyCode);
    this.midiInput.onNoteOn = (note, id) => this._handleNoteOn(note, id);
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
        this.scoreDisplay?.showFeedback('Miss', FEEDBACK_COLORS.MISS);
        return;
      }
      const label = gradeLabel(grade);
      const color = FEEDBACK_COLORS[grade];
      this.scoreDisplay?.showFeedback(`+${result.score} ${label}`, color);

      const note = result.note;
      const holdRatio = note.duration > 0 ? note.accumulatedHeldDuration / note.duration : 0;
      const isTapNote = note.duration <= TAP_NOTE_THRESHOLD;

      if ((note.failing && holdRatio >= SUCCESS_PARTICLE_HOLD_RATIO) || isTapNote) {
        const hitZoneY = this.renderer.height * HIT_ZONE_Y_RATIO;
        const keyLayout = getPianoKeyLayout(note.key, this.renderer.width);
        const noteColor = NOTE_COLORS[note.key] || '#ffffff';
        this.renderer.spawnParticles(
          keyLayout.x + keyLayout.width / 2,
          hitZoneY,
          noteColor,
          10,
        );
      }
    };
  }

  // -- Input handling -------------------------------------------------------

  private _handleNoteOn(noteName: string, _id: string): void {
    const lane = NOTE_TO_LANE.get(noteName);
    if (lane === undefined) return;

    this.pressedLanes.add(lane);
    this.synth.noteOn(noteName);

    if (this.state === GameState.Playing) {
      const results = this._resolveHit(lane);
      this._spawnPerfectParticles(results);
    }
  }

  private _resolveHit(lane: number): HitResult[] {
    if (this.learningMode) {
      const outcome = this.noteManager.checkLearningHit(this.currentTime, lane, performance.now());
      if (outcome.wrong) this.scoreDisplay?.showFeedback('Wrong', FEEDBACK_COLORS.MISS);
      return outcome.results;
    }
    const r = this.noteManager.checkHit(this.currentTime, lane);
    if (r === null) this.scoreDisplay?.showFeedback('Wrong', FEEDBACK_COLORS.MISS);
    return r ? [r] : [];
  }

  private _spawnPerfectParticles(results: HitResult[]): void {
    const hitZoneY = this.renderer.height * HIT_ZONE_Y_RATIO;
    for (const result of results) {
      if (result.result === NoteGrade.PERFECT) {
        const noteColor = NOTE_COLORS[result.note.key] || '#ffffff';
        const keyLayout = getPianoKeyLayout(result.note.key, this.renderer.width);
        this.renderer.spawnParticles(
          keyLayout.x + keyLayout.width / 2,
          hitZoneY,
          noteColor,
          15
        );
      }
    }
  }

  private _handleNoteOff(noteName: string, _id: string): void {
    const lane = NOTE_TO_LANE.get(noteName);
    if (lane === undefined) return;

    this.pressedLanes.delete(lane);
    this.synth.noteOff(noteName);

    if (this.state === GameState.Playing) {
      this.noteManager.checkRelease(this.currentTime, lane);
    }
  }

  // -- Results & navigation -------------------------------------------------

  private _showResults(): void {
    this.state = GameState.Results;
    this.playScreen.classList.remove('active');
    this.resultsScreen.show(this.noteManager.scoring, this._usedLearningMode);

    this.keyboardInput.stop();
    this.midiInput.onNoteOn = null;
    this.midiInput.onNoteOff = null;
    this.synth.releaseAll();
  }

  retry(): void {
    if (!this.currentSong) return;
    // Preserve a stored/active loop across a restart: seek to loopStart so
    // the player resumes at the beginning of the loop instead of the song.
    const savedStart = this.loop.start;
    const savedEnd = this.loop.end;
    const savedActive = this.loop.active;
    const hadLoop = savedStart !== null && savedEnd !== null;
    this.start(this.currentSong);
    if (hadLoop) {
      this.loop.start = savedStart;
      this.loop.end = savedEnd;
      this.loop.active = savedActive;
      this.seekTo(savedStart);
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
    this.noteManager.scoring.enabled = !this.loop.active;
  }

  private _playNoteOnce(note: SongNote): void {
    this.synth.noteOn(note.key);
    setTimeout(() => this.synth.noteOff(note.key), note.duration * 1000);
  }

  // -- Playback controls ----------------------------------------------------

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
    this.noteManager.resetFromTime(clamped);
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
}

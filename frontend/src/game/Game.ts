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
import { formatScore } from '../utils/helpers.js';
import type { Synth } from '../audio/Synth.js';
import type { KeyboardInput } from '../input/KeyboardInput.js';
import type { MidiInput } from '../input/MidiInput.js';
import type { ScoreDisplay } from '../ui/ScoreDisplay.js';
import type { Song } from '../utils/MidiParser.js';

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
  loopStart: number | null = null;
  loopEnd: number | null = null;
  loopDefinitionState: LoopDefinitionState = LoopDefinitionState.Off;
  loopActive = false;

  private playScreen: HTMLElement;
  private resultsScreen: HTMLElement;
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
    this.resultsScreen = document.getElementById('results-screen')!;
    this.menuScreen = document.getElementById('menu-screen')!;
    this.resizeHandle = document.getElementById('sheet-resize-handle')!;

    this._onResize = () => this.renderer.resize();
    window.addEventListener('resize', this._onResize);

    this._boundLoop = (): void => {
      const now = performance.now() / 1000;
      const delta = this._lastFrameTime ? now - this._lastFrameTime : 1 / 60;
      this._lastFrameTime = now;
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

      // Loop wrap: when active and we've reached the end of the last note
      // within the loop, rewind to loopStart. Using the effective end (last
      // note's time+duration) lets the player finish holding the final note
      // before the loop rewinds.
      if (
        this.loopActive &&
        this.loopStart !== null &&
        this.loopEnd !== null &&
        this.state === GameState.Playing &&
        this.currentTime >= this.noteManager.getLoopEffectiveEnd(this.loopEnd)
      ) {
        this.seekTo(this.loopStart);
      }

      this.scrollOffset += SCROLL_SPEED * delta * this.speedMultiplier;

      this.renderer.clear();
      this.renderer.drawHighway(this.scrollOffset);

      if (this.state === GameState.Playing) {
        this.noteManager.update(this.currentTime, this.renderer.height);

        const songDuration = this.noteManager.getSongDuration();
        this.renderer.drawSheetMusic(this.noteManager.trebleNotes, this.noteManager.bassNotes, this.currentTime, songDuration, {
          start: this.loopStart,
          end: this.loopEnd,
          active: this.loopActive,
          defining: this.loopDefinitionState,
        });

        const activeNotes = this.noteManager.getActiveNotes(this.currentTime, this.renderer.height, this.learningMode);
        for (const note of activeNotes) {
          this.renderer.drawNote(note.lane, note.y, note.height, note.color, note.alpha, this.renderer.sheetBottom, note.key, note.holding, note.failing, note.waiting);
        }

        this.scoreDisplay?.update(this.noteManager.scoring);

        if (this.noteManager.isComplete()) {
          if (this._completionTime === null) {
            this._completionTime = this.currentTime;
          } else if (this.currentTime - this._completionTime >= RESULTS_DELAY_SECONDS) {
            this._showResults();
          }
        }
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

  start(song: Song): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    this.currentSong = song;
    this.noteManager.loadSong(song);
    this.refGameTime = -COUNTDOWN_SECONDS;
    this.refRealTime = performance.now() / 1000;
    this.state = GameState.Playing;
    this.pressedLanes.clear();
    this._completionTime = null;
    this._usedLearningMode = false;

    this.menuScreen.classList.remove('active');
    this.resultsScreen.classList.remove('active');
    this.playScreen.classList.add('active');

    this.clearLoop();

    this.keyboardInput.onNoteOn = (note, keyCode) => this._handleNoteOn(note, keyCode);
    this.keyboardInput.onNoteOff = (note, keyCode) => this._handleNoteOff(note, keyCode);
    this.midiInput.onNoteOn = (note, id) => this._handleNoteOn(note, id);
    this.midiInput.onNoteOff = (note, id) => this._handleNoteOff(note, id);

    this.keyboardInput.start();
    this.synth.init();
    this.synth.resume();

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

    this._lastFrameTime = 0;
    this._boundLoop();
  }

  private _handleNoteOn(noteName: string, _id: string): void {
    const lane = NOTE_TO_LANE.get(noteName);
    if (lane === undefined) return;

    this.pressedLanes.add(lane);
    this.synth.noteOn(noteName);

    if (this.state === GameState.Playing) {
      let results: HitResult[];
      if (this.learningMode) {
        const outcome = this.noteManager.checkLearningHit(this.currentTime, lane, performance.now());
        results = outcome.results;
        if (outcome.wrong) this.scoreDisplay?.showFeedback('Wrong', FEEDBACK_COLORS.MISS);
      } else {
        const r = this.noteManager.checkHit(this.currentTime, lane);
        if (r === null) this.scoreDisplay?.showFeedback('Wrong', FEEDBACK_COLORS.MISS);
        results = r ? [r] : [];
      }

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

  private _showResults(): void {
    this.state = GameState.Results;
    this.playScreen.classList.remove('active');
    this.resultsScreen.classList.add('active');

    const scoring = this.noteManager.scoring;
    const gradeEl = document.getElementById('result-grade')!;
    if (this._usedLearningMode) {
      gradeEl.textContent = 'PRACTICE';
      gradeEl.className = 'grade-practice';
    } else {
      const gradeInfo = scoring.getGrade();
      gradeEl.textContent = gradeInfo.grade;
      gradeEl.className = gradeInfo.class;
    }

    document.getElementById('result-stats')!.innerHTML = `
      Score: <span class="stat-value">${formatScore(scoring.score)}</span><br>
      Perfect: <span class="stat-value">${scoring.perfects}</span><br>
      Great: <span class="stat-value">${scoring.greats}</span><br>
      Good: <span class="stat-value">${scoring.goods}</span><br>
      Miss: <span class="stat-value">${scoring.misses}</span><br>
      Wrong: <span class="stat-value">${scoring.wrongNotes}</span><br>
      Dropped: <span class="stat-value">${scoring.failures}</span><br>
      Max Combo: <span class="stat-value">${scoring.maxCombo}</span><br>
      Accuracy: <span class="stat-value">${scoring.getAccuracy()}%</span>
    `;

    this.keyboardInput.stop();
    this.midiInput.onNoteOn = null;
    this.midiInput.onNoteOff = null;
    this.synth.releaseAll();
  }

  retry(): void {
    if (!this.currentSong) return;
    // Preserve a stored/active loop across a restart: seek to loopStart so
    // the player resumes at the beginning of the loop instead of the song.
    const savedStart = this.loopStart;
    const savedEnd = this.loopEnd;
    const savedActive = this.loopActive;
    const hadLoop = savedStart !== null && savedEnd !== null;
    this.start(this.currentSong);
    if (hadLoop) {
      this.loopStart = savedStart;
      this.loopEnd = savedEnd;
      this.loopActive = savedActive;
      this.seekTo(savedStart);
      this._applyScoringEnabled();
    }
  }

  /** Reflect loopActive onto the NoteManager's scoring flag so score does
   *  not accrue while looping. */
  private _applyScoringEnabled(): void {
    this.noteManager.scoring.enabled = !this.loopActive;
  }

  backToMenu(): void {
    this.state = GameState.Menu;
    this.resultsScreen.classList.remove('active');
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

  private _playNoteOnce(note: SongNote): void {
    this.synth.noteOn(note.key);
    setTimeout(() => this.synth.noteOff(note.key), note.duration * 1000);
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
    this.noteManager.resetFromTime(clamped);
  }

  /** Begin defining a loop. Clicking the button always enters the start
   *  phase, replacing any previously active/stored loop. */
  beginLoopDefine(): void {
    this.loopDefinitionState = LoopDefinitionState.Start;
    this.loopActive = false;
    this.loopStart = null;
    this.loopEnd = null;
  }

  /** Abort the current define flow without affecting an already-active
   *  loop (none exists in this case since begin clears it first). */
  cancelLoopDefine(): void {
    this.loopDefinitionState = LoopDefinitionState.Off;
  }

  /** Set loop boundaries during the define flow. Returns the new phase. */
  setLoopBoundary(time: number): LoopDefinitionState {
    if (this.loopDefinitionState === LoopDefinitionState.Start) {
      this.loopStart = time;
      this.loopDefinitionState = LoopDefinitionState.End;
      return LoopDefinitionState.End;
    }
    if (this.loopDefinitionState === LoopDefinitionState.End) {
      if (this.loopStart !== null && time < this.loopStart) {
        // Swap so start < end.
        this.loopEnd = this.loopStart;
        this.loopStart = time;
      } else {
        this.loopEnd = time;
      }
      this.loopDefinitionState = LoopDefinitionState.Off;
      this.loopActive = true;
      this._applyScoringEnabled();
      return LoopDefinitionState.Off;
    }
    return this.loopDefinitionState;
  }

  /** Deactivate the loop (e.g., user switched to play mode) but keep
   *  stored boundaries so it could be re-activated from a stored state. */
  deactivateLoop(): void {
    this.loopActive = false;
    this._applyScoringEnabled();
  }

  /** Clear loop state fully (boundaries + active flag + define phase). */
  clearLoop(): void {
    this.loopStart = null;
    this.loopEnd = null;
    this.loopActive = false;
    this.loopDefinitionState = LoopDefinitionState.Off;
    this._applyScoringEnabled();
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

import { Renderer } from './Renderer.js';
import { NoteManager, SCROLL_SPEED, HIT_ZONE_Y_RATIO } from './NoteManager.js';
import { NoteGrade, gradeLabel } from './scoring.js';
import { NOTE_TO_LANE, NOTE_COLORS, getPianoKeyLayout } from '../utils/notes.js';
import { formatScore } from '../utils/helpers.js';
import type { Synth } from '../audio/Synth.js';
import type { KeyboardInput } from '../input/KeyboardInput.js';
import type { MidiInput } from '../input/MidiInput.js';
import type { ScoreDisplay } from '../ui/ScoreDisplay.js';
import type { Song } from '../utils/MidiParser.js';

export type GameState = 'menu' | 'playing' | 'results';

const FEEDBACK_COLORS: Record<NoteGrade | 'MISS' | 'FAIL', string> = {
  [NoteGrade.PERFECT]: '#ffdd22',
  [NoteGrade.GREAT]: '#22ff66',
  [NoteGrade.GOOD]: '#2288ff',
  MISS: '#ff2244',
  FAIL: '#ff8822',
};

const COUNTDOWN_SECONDS = 1.5;

export class Game {
  canvas: HTMLCanvasElement;
  renderer: Renderer;
  noteManager: NoteManager;
  private synth: Synth;
  private keyboardInput: KeyboardInput;
  private midiInput: MidiInput;
  state: GameState = 'menu';
  private currentSong: Song | null = null;
  currentTime = 0;
  private refGameTime = 0;
  private refRealTime = 0;
  private animationId: number | null = null;
  private pressedLanes = new Set<number>();
  scrollOffset = 0;
  speedMultiplier = 1.0;
  scoreDisplay: ScoreDisplay | null = null;

  private playScreen: HTMLElement;
  private resultsScreen: HTMLElement;
  private menuScreen: HTMLElement;
  private resizeHandle: HTMLElement;
  private _onResize: () => void;
  private _boundLoop: () => void;
  private _lastFrameTime = 0;

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
      this.currentTime = this.refGameTime + (now - this.refRealTime) * this.speedMultiplier;
      this.scrollOffset += SCROLL_SPEED * delta * this.speedMultiplier;

      this.renderer.clear();
      this.renderer.drawHighway(this.scrollOffset);

      if (this.state === 'playing') {
        this.noteManager.update(this.currentTime, this.renderer.height);

        const songDuration = this.noteManager.getSongDuration();
        this.renderer.drawSheetMusic(this.noteManager.trebleNotes, this.noteManager.bassNotes, this.currentTime, songDuration);

        const activeNotes = this.noteManager.getActiveNotes(this.currentTime, this.renderer.height);
        for (const note of activeNotes) {
          this.renderer.drawNote(note.lane, note.y, note.height, note.color, note.alpha, this.renderer.sheetBottom, note.key, note.holding, note.failing);
        }

        this.scoreDisplay?.update(this.noteManager.scoring);

        if (this.noteManager.isComplete()) {
          this._showResults();
        }
      }

      this.resizeHandle.style.top = `${this.renderer.sheetBottom}px`;

      this.renderer.drawParticles();
      this.renderer.drawPiano(this.pressedLanes);
      this.renderer.drawHitZone(this.pressedLanes);

      if (this.state !== 'menu') {
        this.animationId = requestAnimationFrame(this._boundLoop);
      }
    };
  }

  start(song: Song): void {
    this.currentSong = song;
    this.noteManager.loadSong(song);
    this.refGameTime = -COUNTDOWN_SECONDS;
    this.refRealTime = performance.now() / 1000;
    this.state = 'playing';
    this.pressedLanes.clear();

    this.menuScreen.classList.remove('active');
    this.resultsScreen.classList.remove('active');
    this.playScreen.classList.add('active');

    this.keyboardInput.onNoteOn = (note, keyCode) => this._handleNoteOn(note, keyCode);
    this.keyboardInput.onNoteOff = (note, keyCode) => this._handleNoteOff(note, keyCode);
    this.midiInput.onNoteOn = (note, id) => this._handleNoteOn(note, id);
    this.midiInput.onNoteOff = (note, id) => this._handleNoteOff(note, id);

    this.keyboardInput.start();
    this.synth.init();
    this.synth.resume();

    this.noteManager.onMiss = (note) => {
      this.synth.noteOn(note.key);
      setTimeout(() => this.synth.noteOff(note.key), note.duration * 1000);
    };

    this.noteManager.onResolve = (result) => {
      const grade = result.grade;
      if (grade === null) {
        this.scoreDisplay?.showFeedback('Miss', FEEDBACK_COLORS.MISS);
        return;
      }
      const label = gradeLabel(grade);
      const color = FEEDBACK_COLORS[grade];
      this.scoreDisplay?.showFeedback(`+${result.score} ${label}`, color);

      if (result.note.failing) {
        const hitZoneY = this.renderer.height * HIT_ZONE_Y_RATIO;
        const keyLayout = getPianoKeyLayout(result.note.key, this.renderer.width);
        this.renderer.spawnParticles(
          keyLayout.x + keyLayout.width / 2,
          hitZoneY,
          FEEDBACK_COLORS.FAIL,
          10
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

    if (this.state === 'playing') {
      const result = this.noteManager.checkHit(this.currentTime, lane);
      if (result) {
        const hitZoneY = this.renderer.height * HIT_ZONE_Y_RATIO;
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
      } else {
        this.scoreDisplay?.showFeedback('Miss', FEEDBACK_COLORS.MISS);
      }
    }
  }

  private _handleNoteOff(noteName: string, _id: string): void {
    const lane = NOTE_TO_LANE.get(noteName);
    if (lane === undefined) return;

    this.pressedLanes.delete(lane);
    this.synth.noteOff(noteName);

    if (this.state === 'playing') {
      this.noteManager.checkRelease(this.currentTime, lane);
    }
  }

  private _showResults(): void {
    this.state = 'results';
    this.playScreen.classList.remove('active');
    this.resultsScreen.classList.add('active');

    const scoring = this.noteManager.scoring;
    const gradeInfo = scoring.getGrade();
    const gradeEl = document.getElementById('result-grade')!;
    gradeEl.textContent = gradeInfo.grade;
    gradeEl.className = gradeInfo.class;

    document.getElementById('result-stats')!.innerHTML = `
      Score: <span class="stat-value">${formatScore(scoring.score)}</span><br>
      Perfect: <span class="stat-value">${scoring.perfects}</span><br>
      Great: <span class="stat-value">${scoring.greats}</span><br>
      Good: <span class="stat-value">${scoring.goods}</span><br>
      Miss: <span class="stat-value">${scoring.misses}</span><br>
      Dropped: <span class="stat-value">${scoring.failures}</span><br>
      Max Combo: <span class="stat-value">${scoring.maxCombo}</span><br>
      Accuracy: <span class="stat-value">${scoring.getAccuracy()}%</span>
    `;

    this.keyboardInput.stop();
    this.midiInput.stop();
    this.midiInput.onNoteOn = null;
    this.midiInput.onNoteOff = null;
    this.synth.releaseAll();
  }

  retry(): void {
    if (this.currentSong) {
      this.start(this.currentSong);
    }
  }

  backToMenu(): void {
    this.state = 'menu';
    this.resultsScreen.classList.remove('active');
    this.playScreen.classList.remove('active');
    this.menuScreen.classList.add('active');
    this.keyboardInput.stop();
    this.midiInput.stop();
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

  setSpeed(multiplier: number): void {
    this.refGameTime = this.currentTime;
    this.refRealTime = performance.now() / 1000;
    this.speedMultiplier = Math.max(0.1, Math.min(2.0, multiplier));
  }
}

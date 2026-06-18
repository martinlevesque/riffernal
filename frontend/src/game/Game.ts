import { Renderer } from './Renderer.js';
import { NoteManager, NoteGrade, SCROLL_SPEED, HIT_ZONE_Y_RATIO, gradeLabel } from './NoteManager.js';
import { NOTE_NAMES, NOTE_COLORS } from '../utils/notes.js';
import { formatScore } from '../utils/helpers.js';
import { Synth } from '../audio/Synth.js';
import { KeyboardInput } from '../input/KeyboardInput.js';
import { MidiInput } from '../input/MidiInput.js';
import { ScoreDisplay } from '../ui/ScoreDisplay.js';
import type { Song } from '../utils/MidiParser.js';
import type { ReleaseResult } from './NoteManager.js';

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
  private paused = false;
  private animationId: number | null = null;
  private pressedLanes = new Set<number>();
  scrollOffset = 0;
  speedMultiplier = 1.0;
  scoreDisplay: ScoreDisplay | null = null;

  private playScreen: HTMLElement;
  private resultsScreen: HTMLElement;
  private menuScreen: HTMLElement;
  private _onResize: () => void;

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

    this._onResize = () => this.renderer.resize();
    window.addEventListener('resize', this._onResize);
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
        const laneWidth = this.renderer.width / NOTE_NAMES.length;
        const hitZoneY = this.renderer.height * HIT_ZONE_Y_RATIO;
        this.renderer.spawnParticles(
          result.note.lane * laneWidth + laneWidth / 2,
          hitZoneY,
          FEEDBACK_COLORS.FAIL,
          10
        );
      }
    };

    this._loop();
  }

  private _handleNoteOn(noteName: string, _id: string): void {
    const lane = NOTE_NAMES.indexOf(noteName);
    if (lane < 0) return;

    this.pressedLanes.add(lane);
    this.synth.noteOn(noteName);

    if (this.state === 'playing') {
      const result = this.noteManager.checkHit(this.currentTime, lane);
      if (result) {
        const laneWidth = this.renderer.width / NOTE_NAMES.length;
        const hitZoneY = this.renderer.height * HIT_ZONE_Y_RATIO;
        if (result.result === NoteGrade.PERFECT) {
          const noteColor = NOTE_COLORS[result.note.key] || '#ffffff';
          this.renderer.spawnParticles(
            lane * laneWidth + laneWidth / 2,
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
    const lane = NOTE_NAMES.indexOf(noteName);
    if (lane < 0) return;

    this.pressedLanes.delete(lane);
    this.synth.noteOff(noteName);

    if (this.state === 'playing') {
      this.noteManager.checkRelease(this.currentTime, lane);
    }
  }

  private _loop(): void {
    const now = performance.now() / 1000;
    this.currentTime = this.refGameTime + (now - this.refRealTime) * this.speedMultiplier;
    this.scrollOffset += (SCROLL_SPEED / 60) * this.speedMultiplier;

    this.renderer.clear();
    this.renderer.drawHighway(NOTE_NAMES.length, this.scrollOffset);

    if (this.state === 'playing') {
      this.noteManager.update(this.currentTime, this.renderer.height);

      const songDuration = this.noteManager.getSongDuration();
      this.renderer.drawSheetMusic(this.noteManager.notes, this.currentTime, songDuration);

      const activeNotes = this.noteManager.getActiveNotes(this.currentTime, this.renderer.height);
      for (const note of activeNotes) {
        this.renderer.drawNote(note.lane, note.y, note.height, note.color, note.alpha, this.renderer.sheetBottom, note.key, note.holding, note.failing);
      }

      this.scoreDisplay?.update(this.noteManager);

      if (this.noteManager.isComplete()) {
        this._showResults();
      }
    }

    const handle = document.getElementById('sheet-resize-handle')!;
    handle.style.top = this.renderer.sheetBottom + 'px';

    this.renderer.drawParticles();
    this.renderer.drawPiano(NOTE_NAMES.length, this.pressedLanes);
    this.renderer.drawHitZone(NOTE_NAMES.length, this.pressedLanes);

    if (this.state !== 'menu') {
      this.animationId = requestAnimationFrame(() => this._loop());
    }
  }

  private _showResults(): void {
    this.state = 'results';
    this.playScreen.classList.remove('active');
    this.resultsScreen.classList.add('active');

    const gradeInfo = this.noteManager.getGrade();
    const gradeEl = document.getElementById('result-grade')!;
    gradeEl.textContent = gradeInfo.grade;
    gradeEl.className = gradeInfo.class;

    document.getElementById('result-stats')!.innerHTML = `
      Score: <span class="stat-value">${formatScore(this.noteManager.score)}</span><br>
      Perfect: <span class="stat-value">${this.noteManager.perfects}</span><br>
      Great: <span class="stat-value">${this.noteManager.greats}</span><br>
      Good: <span class="stat-value">${this.noteManager.goods}</span><br>
      Miss: <span class="stat-value">${this.noteManager.misses}</span><br>
      Dropped: <span class="stat-value">${this.noteManager.failures}</span><br>
      Max Combo: <span class="stat-value">${this.noteManager.maxCombo}</span><br>
      Accuracy: <span class="stat-value">${this.noteManager.getAccuracy()}%</span>
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

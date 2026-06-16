import { Renderer } from './Renderer.js';
import { NoteManager } from './NoteManager.js';
import { KEYBOARD_MAP, NOTE_NAMES, NOTE_COLORS, FEEDBACK_COLORS, HIT_ZONE_Y_RATIO, SCROLL_SPEED } from '../utils/constants.js';
import { formatScore } from '../utils/helpers.js';

export class Game {
  constructor(canvas, synth, keyboardInput, midiInput) {
    this.canvas = canvas;
    this.renderer = new Renderer(canvas);
    this.noteManager = new NoteManager();
    this.synth = synth;
    this.keyboardInput = keyboardInput;
    this.midiInput = midiInput;

    this.state = 'menu';
    this.currentSong = null;
    this.currentTime = 0;
    this.startTime = 0;
    this.refGameTime = 0;
    this.refRealTime = 0;
    this.paused = false;
    this.animationId = null;
    this.pressedLanes = new Set();
    this.scrollOffset = 0;
    this.speedMultiplier = 1.0;

    this.playScreen = document.getElementById('play-screen');
    this.resultsScreen = document.getElementById('results-screen');
    this.menuScreen = document.getElementById('menu-screen');

    this._onResize = this._onResize.bind(this);
    window.addEventListener('resize', this._onResize);
  }

  _onResize() {
    this.renderer.resize();
  }

  start(song) {
    this.currentSong = song;
    this.noteManager.loadSong(song);
    this.currentTime = -1.5;
    this.startTime = performance.now() / 1000 + 1.5;
    this.refGameTime = -1.5;
    this.refRealTime = this.startTime;
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

    if (!this.animationId) {
      this._loop();
    }
  }

  _handleNoteOn(noteName, id) {
    const lane = NOTE_NAMES.indexOf(noteName);
    if (lane < 0) return;

    this.pressedLanes.add(lane);
    this.synth.noteOn(noteName);

    if (this.state === 'playing') {
      const result = this.noteManager.checkHit(this.currentTime, lane);
      if (result) {
        const color = FEEDBACK_COLORS[result.result];
        this.scoreDisplay.showFeedback(result.result, color);

        const laneWidth = this.renderer.width / NOTE_NAMES.length;
        const hitZoneY = this.renderer.height * HIT_ZONE_Y_RATIO;
        if (result.result === 'PERFECT') {
          const noteColor = NOTE_COLORS[result.note.key] || '#ffffff';
          this.renderer.spawnParticles(
            lane * laneWidth + laneWidth / 2,
            hitZoneY,
            noteColor,
            15
          );
        }
      }
    }
  }

  _handleNoteOff(noteName, id) {
    const lane = NOTE_NAMES.indexOf(noteName);
    if (lane < 0) return;

    this.pressedLanes.delete(lane);
    this.synth.noteOff(noteName);
  }

  _loop() {
    const now = performance.now() / 1000;
    this.currentTime = this.refGameTime + (now - this.refRealTime) * this.speedMultiplier;
    this.scrollOffset += (SCROLL_SPEED / 60) * this.speedMultiplier;

    this.renderer.clear();
    this.renderer.drawHighway(NOTE_NAMES.length, this.scrollOffset);
    this.renderer.drawHitZone(NOTE_NAMES.length, this.pressedLanes);

    if (this.state === 'playing') {
      this.noteManager.update(this.currentTime, this.renderer.height);

      const songDuration = this.noteManager.getSongDuration();
      this.renderer.drawTimeline(this.noteManager.notes, this.currentTime, songDuration);

      const activeNotes = this.noteManager.getActiveNotes(this.currentTime, this.renderer.height);
      for (const note of activeNotes) {
        this.renderer.drawNote(note.lane, note.y, note.height, note.color, note.alpha);
      }

      if (window._scoreDisplay) {
        window._scoreDisplay.update(this.noteManager);
      }

      if (this.noteManager.isComplete()) {
        this._showResults();
      }
    }

    this.renderer.drawParticles();
    this.renderer.drawPiano(NOTE_NAMES.length, this.pressedLanes);

    this.animationId = requestAnimationFrame(() => this._loop());
  }

  _showResults() {
    this.state = 'results';
    this.playScreen.classList.remove('active');
    this.resultsScreen.classList.add('active');

    const gradeInfo = this.noteManager.getGrade();
    document.getElementById('result-grade').textContent = gradeInfo.grade;
    document.getElementById('result-grade').className = gradeInfo.class;

    document.getElementById('result-stats').innerHTML = `
      Score: <span class="stat-value">${formatScore(this.noteManager.score)}</span><br>
      Perfect: <span class="stat-value">${this.noteManager.perfects}</span><br>
      Great: <span class="stat-value">${this.noteManager.greats}</span><br>
      Good: <span class="stat-value">${this.noteManager.goods}</span><br>
      Miss: <span class="stat-value">${this.noteManager.misses}</span><br>
      Max Combo: <span class="stat-value">${this.noteManager.maxCombo}</span><br>
      Accuracy: <span class="stat-value">${this.noteManager.getAccuracy()}%</span>
    `;

    this.keyboardInput.stop();
    this.synth.releaseAll();
  }

  retry() {
    if (this.currentSong) {
      this.start(this.currentSong);
    }
  }

  backToMenu() {
    this.state = 'menu';
    this.resultsScreen.classList.remove('active');
    this.playScreen.classList.remove('active');
    this.menuScreen.classList.add('active');
    this.keyboardInput.stop();
    this.synth.releaseAll();
    this.keyboardInput.onNoteOn = null;
    this.keyboardInput.onNoteOff = null;
  }

  setSpeed(multiplier) {
    this.refGameTime = this.currentTime;
    this.refRealTime = performance.now() / 1000;
    this.speedMultiplier = Math.max(0.1, Math.min(2.0, multiplier));
  }
}

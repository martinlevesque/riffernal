import { Game, GameState, LoopDefinitionState } from './game/Game.js';
import { Synth } from './audio/Synth.js';
import { KeyboardInput } from './input/KeyboardInput.js';
import { MidiInput } from './input/MidiInput.js';
import { Menu } from './ui/Menu.js';
import { ScoreDisplay } from './ui/ScoreDisplay.js';
import { parseMidi } from './utils/MidiParser.js';
import { SHEET_TOP_OFFSET, Renderer, SHEET_BEATS_VISIBLE } from './game/Renderer.js';
import { PracticeHand } from './utils/notes.js';
import type { Song } from './utils/MidiParser.js';

const SHEET_STAFF_LINE_SPACING = 10;
const BASE_SHEET_HEIGHT = 5 + 4 * SHEET_STAFF_LINE_SPACING + 8 + 4 * SHEET_STAFF_LINE_SPACING + 5;

const SONG_FILES = [
  'assets/songs/frere-jacques.json',
  'assets/songs/iron-rain.json',
  'assets/songs/steel-thunder.json',
  'assets/songs/night-rider.json',
];

async function loadSongs(): Promise<Song[]> {
  const songs: Song[] = [];
  for (const file of SONG_FILES) {
    try {
      const res = await fetch(file);
      if (res.ok) {
        songs.push(await res.json());
      }
    } catch (e) {
      console.warn(`Failed to load ${file}:`, e);
    }
  }
  return songs;
}

async function init(): Promise<void> {
  const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
  const synth = new Synth();
  const keyboardInput = new KeyboardInput();
  const midiInput = new MidiInput();

  const game = new Game(canvas, synth, keyboardInput, midiInput);
  const scoreDisplay = new ScoreDisplay();
  game.scoreDisplay = scoreDisplay;

  const speedValue = document.getElementById('speed-value')!;
  const speedDown = document.getElementById('speed-down')!;
  const speedUp = document.getElementById('speed-up')!;

  const modePlay = document.getElementById('mode-play')!;
  const modeLearn = document.getElementById('mode-learn')!;
  const handControl = document.getElementById('hand-control')!;
  const handLeft = document.getElementById('hand-left')!;
  const handRight = document.getElementById('hand-right')!;

  const defineLoopBtn = document.getElementById('btn-define-loop')!;
  const clearLoopBtn = document.getElementById('btn-clear-loop')!;
  const loopStatus = document.getElementById('loop-status')!;

  // -- Full sheet view ---------------------------------------------------
  const openSheetBtn = document.getElementById('btn-open-sheet')!;
  const sheetScreen = document.getElementById('sheet-screen')!;
  const sheetCanvas = document.getElementById('sheet-canvas') as HTMLCanvasElement;
  const sheetPrevBtn = document.getElementById('btn-sheet-prev')!;
  const sheetNextBtn = document.getElementById('btn-sheet-next')!;
  const sheetCloseBtn = document.getElementById('btn-close-sheet')!;
  const sheetPageInfo = document.getElementById('sheet-page-info')!;
  const sheetHint = document.getElementById('sheet-hint')!;
  const sheetRenderer = new Renderer(sheetCanvas);
  const bpm = 120;
  const pageDuration = SHEET_BEATS_VISIBLE * (60 / bpm);
  let sheetCurrentPage = 0;
  let sheetOpen = false;

  function applyPracticeHandButtons(): void {
    const hand = game.practiceHand;
    handLeft.classList.toggle('active', hand === PracticeHand.Left);
    handRight.classList.toggle('active', hand === PracticeHand.Right);
  }

  function setPracticeHand(hand: PracticeHand): void {
    game.setPracticeHand(hand);
    applyPracticeHandButtons();
  }

  function setMode(learning: boolean): void {
    game.setLearningMode(learning);
    modePlay.classList.toggle('active', !learning);
    modeLearn.classList.toggle('active', learning);
    handControl.classList.toggle('active', learning);
    if (!learning && game.loopActive) {
      game.deactivateLoop();
      updateLoopUI();
    }
  }

  function updateLoopUI(): void {
    const phase = game.loopDefinitionState;
    defineLoopBtn.classList.toggle('active', phase !== 'off');
    defineLoopBtn.classList.toggle('loop-active', game.loopActive);
    const stored = !game.loopActive && game.loopStart !== null && game.loopEnd !== null;
    defineLoopBtn.classList.toggle('loop-stored', stored);
    if (phase === 'start') {
      loopStatus.textContent = 'Click start note';
    } else if (phase === 'end') {
      loopStatus.textContent = 'Click end note';
    } else if (game.loopActive) {
      loopStatus.textContent = `Loop ${game.loopStart?.toFixed(2)}s-${game.loopEnd?.toFixed(2)}s`;
    } else if (stored) {
      loopStatus.textContent = `Stored ${game.loopStart?.toFixed(2)}s-${game.loopEnd?.toFixed(2)}s`;
    } else {
      loopStatus.textContent = 'No loop';
    }
  }

  modePlay.addEventListener('click', () => setMode(false));
  modeLearn.addEventListener('click', () => setMode(true));

  defineLoopBtn.addEventListener('click', () => {
    // Clicking always (re-)enters start-defining, replacing any stored/active loop.
    game.beginLoopDefine();
    if (!game.learningMode) setMode(true);
    updateLoopUI();
    if (game.state === GameState.Playing) {
      openSheetView();
      startSheetRAF();
    }
  });

  clearLoopBtn.addEventListener('click', () => {
    game.clearLoop();
    updateLoopUI();
    if (sheetOpen) renderSheetPage();
  });

  handLeft.addEventListener('click', () => {
    setPracticeHand(game.practiceHand === PracticeHand.Left ? PracticeHand.Both : PracticeHand.Left);
  });
  handRight.addEventListener('click', () => {
    setPracticeHand(game.practiceHand === PracticeHand.Right ? PracticeHand.Both : PracticeHand.Right);
  });

  function updateSpeedDisplay(): void {
    speedValue.textContent = `${Math.round(game.speedMultiplier * 100)}%`;
  }

  function changeSpeed(delta: number): void {
    const newSpeed = Math.round((game.speedMultiplier + delta) * 10) / 10;
    game.setSpeed(newSpeed);
    updateSpeedDisplay();
  }

  speedDown.addEventListener('click', () => changeSpeed(-0.1));
  speedUp.addEventListener('click', () => changeSpeed(0.1));

  document.addEventListener('keydown', (e) => {
    if (game.state !== GameState.Playing) return;
    if (e.code === 'BracketLeft') {
      changeSpeed(-0.1);
    } else if (e.code === 'BracketRight') {
      changeSpeed(0.1);
    }
  });

  updateSpeedDisplay();

  const songs = await loadSongs();
  if (songs.length === 0) {
    document.getElementById('song-list')!.innerHTML = '<p class="error">Failed to load songs. Please refresh the page.</p>';
    (document.getElementById('btn-start') as HTMLButtonElement).disabled = true;
  }
  const menu = new Menu(songs);
  menu.onStart = (song) => {
    setMode(false);
    setPracticeHand(PracticeHand.Both);
    game.start(song);
  };

  await midiInput.start();
  menu.setMidiStatus(
    midiInput.connected,
    midiInput.connected ? 'MIDI device connected' : 'No MIDI device - use keyboard'
  );

  midiInput.onConnectionChange = (connected, message) => {
    menu.setMidiStatus(connected, message);
  };

  document.getElementById('btn-retry')!.addEventListener('click', () => { game.retry(); setMode(game.learningMode); applyPracticeHandButtons(); updateLoopUI(); });
  document.getElementById('btn-menu')!.addEventListener('click', () => game.backToMenu());
  document.getElementById('btn-restart')!.addEventListener('click', () => { game.retry(); setMode(game.learningMode); applyPracticeHandButtons(); updateLoopUI(); });

  const importBtn = document.getElementById('btn-import-midi')! as HTMLButtonElement;
  const importInput = document.getElementById('midi-import-input')! as HTMLInputElement;

  importBtn.addEventListener('click', () => {
    importInput.click();
  });

  importInput.addEventListener('change', () => {
    const file = importInput.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const song = parseMidi(reader.result as ArrayBuffer, file.name);
        menu.addSong(song);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        alert(`Failed to import MIDI: ${message}`);
        console.error(err);
      }
      importInput.value = '';
    };
    reader.onerror = () => {
      alert('Failed to read file');
      importInput.value = '';
    };
    reader.readAsArrayBuffer(file);
  });

  const resizeHandle = document.getElementById('sheet-resize-handle')!;
  let resizing = false;

  resizeHandle.addEventListener('pointerdown', (e) => {
    resizing = true;
    resizeHandle.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  window.addEventListener('pointermove', (e) => {
    if (!resizing) return;
    if (game.state !== GameState.Playing) return;
    const rect = canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const minSheetHeight = BASE_SHEET_HEIGHT * 0.5;
    const maxSheetHeight = canvas.height * 0.35;
    const targetHeight = Math.max(minSheetHeight, Math.min(maxSheetHeight, y - SHEET_TOP_OFFSET));
    game.renderer.sheetScale = targetHeight / BASE_SHEET_HEIGHT;
  });

  window.addEventListener('pointerup', () => {
    resizing = false;
  });

  canvas.addEventListener('click', (e) => {
    if (game.state !== GameState.Playing) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const r = game.renderer;
    if (r.sheetBarW <= 0 || y < r.sheetTrebleTop || y > r.sheetBassBottom) return;
    if (x < r.sheetBarX || x > r.sheetBarX + r.sheetBarW) return;

    const viewStart = r.sheetViewStart;
    const viewEnd = r.sheetViewEnd;
    const t = viewStart + ((x - r.sheetBarX) / r.sheetBarW) * (viewEnd - viewStart);

    let staff: 'treble' | 'bass' | undefined;
    if (y >= r.sheetTrebleTop && y <= r.sheetTrebleBottom) staff = 'treble';
    else if (y >= r.sheetBassTop && y <= r.sheetBassBottom) staff = 'bass';

    const note = game.noteManager.findNearestNote(t, staff);
    if (!note) return;

    if (game.loopDefinitionState === LoopDefinitionState.Start || game.loopDefinitionState === LoopDefinitionState.End) {
      const wasStart = game.loopDefinitionState === LoopDefinitionState.Start;
      game.setLoopBoundary(note.time);
      updateLoopUI();
      if (!wasStart && game.loopStart !== null) {
        // Loop fully defined and activated -> seek to the start.
        game.seekTo(game.loopStart);
      }
    } else {
      game.seekTo(note.time);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (game.state !== GameState.Playing) return;
    if (e.code === 'KeyR') {
      game.retry();
    }
  });

  // -- Full sheet view wiring ---------------------------------------------

  function sheetPageCount(): number {
    const dur = game.noteManager.getSongDuration();
    return Math.max(1, Math.ceil(dur / pageDuration));
  }

  function renderSheetPage(): void {
    if (!sheetOpen) return;
    const ctx = sheetRenderer.ctx;
    ctx.clearRect(0, 0, sheetCanvas.width, sheetCanvas.height);
    const start = sheetCurrentPage * pageDuration;
    const end = Math.min(start + pageDuration, game.noteManager.getSongDuration());
    sheetRenderer.drawSheetMusic(
      game.noteManager.trebleNotes,
      game.noteManager.bassNotes,
      game.currentTime,
      game.noteManager.getSongDuration(),
      { start: game.loopStart, end: game.loopEnd, active: game.loopActive, defining: game.loopDefinitionState },
      { start, end },
    );
    sheetPageInfo.textContent = `${sheetCurrentPage + 1} / ${sheetPageCount()}`;
    sheetPrevBtn.toggleAttribute('disabled', sheetCurrentPage <= 0);
    sheetNextBtn.toggleAttribute('disabled', sheetCurrentPage >= sheetPageCount() - 1);
    const phase = game.loopDefinitionState;
    if (phase === LoopDefinitionState.Start) {
      sheetHint.textContent = 'Click the start note';
    } else if (phase === LoopDefinitionState.End) {
      sheetHint.textContent = 'Click the end note';
    } else {
      sheetHint.textContent = 'Click a note to resume there';
    }
  }

  function openSheetView(jumpToCurrent = true): void {
    if (sheetOpen) {
      if (jumpToCurrent) jumpSheetToCurrent();
      else renderSheetPage();
      return;
    }
    sheetOpen = true;
    sheetScreen.classList.add('active');
    // Force a resize so the sheet canvas matches the current window size.
    sheetRenderer.resize();
    sheetRenderer.sheetScale = Math.max(sheetRenderer.sheetScale, 1.5);
    if (jumpToCurrent) jumpSheetToCurrent();
    else renderSheetPage();
  }

  function jumpSheetToCurrent(): void {
    const dur = game.noteManager.getSongDuration();
    if (dur <= 0) {
      sheetCurrentPage = 0;
    } else {
      sheetCurrentPage = Math.min(Math.floor(game.currentTime / pageDuration), sheetPageCount() - 1);
      if (sheetCurrentPage < 0) sheetCurrentPage = 0;
    }
    renderSheetPage();
  }

  function closeSheetView(): void {
    sheetOpen = false;
    sheetScreen.classList.remove('active');
  }

  function toggleSheetView(): void {
    if (sheetOpen) closeSheetView();
    else openSheetView();
  }

  openSheetBtn.addEventListener('click', () => {
    if (game.state !== GameState.Playing) return;
    toggleSheetView();
  });

  sheetCloseBtn.addEventListener('click', closeSheetView);

  sheetPrevBtn.addEventListener('click', () => {
    if (sheetCurrentPage > 0) {
      sheetCurrentPage--;
      renderSheetPage();
    }
  });

  sheetNextBtn.addEventListener('click', () => {
    if (sheetCurrentPage < sheetPageCount() - 1) {
      sheetCurrentPage++;
      renderSheetPage();
    }
  });

  sheetCanvas.addEventListener('click', (e) => {
    if (game.state !== GameState.Playing) return;
    const rect = sheetCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const r = sheetRenderer;
    if (r.sheetBarW <= 0 || y < r.sheetTrebleTop || y > r.sheetBassBottom) return;
    if (x < r.sheetBarX || x > r.sheetBarX + r.sheetBarW) return;

    const t = r.sheetViewStart + ((x - r.sheetBarX) / r.sheetBarW) * (r.sheetViewEnd - r.sheetViewStart);

    let staff: 'treble' | 'bass' | undefined;
    if (y >= r.sheetTrebleTop && y <= r.sheetTrebleBottom) staff = 'treble';
    else if (y >= r.sheetBassTop && y <= r.sheetBassBottom) staff = 'bass';

    const note = game.noteManager.findNearestNote(t, staff);
    if (!note) return;

    if (game.loopDefinitionState === LoopDefinitionState.Start || game.loopDefinitionState === LoopDefinitionState.End) {
      const wasStart = game.loopDefinitionState === LoopDefinitionState.Start;
      game.setLoopBoundary(note.time);
      updateLoopUI();
      if (wasStart) {
        // Stayed in define flow (advanced to 'end') -> refresh to show A marker.
        renderSheetPage();
      } else {
        // Loop fully defined and activated -> seek to start and close.
        if (game.loopStart !== null) game.seekTo(game.loopStart);
        closeSheetView();
      }
    } else {
      game.seekTo(note.time);
      closeSheetView();
    }
  });

  // Arrow keys / Escape for sheet navigation
  document.addEventListener('keydown', (e) => {
    if (!sheetOpen) return;
    if (e.code === 'ArrowLeft') {
      e.preventDefault();
      if (sheetCurrentPage > 0) {
        sheetCurrentPage--;
        renderSheetPage();
      }
    } else if (e.code === 'ArrowRight') {
      e.preventDefault();
      if (sheetCurrentPage < sheetPageCount() - 1) {
        sheetCurrentPage++;
        renderSheetPage();
      }
    } else if (e.code === 'Escape') {
      e.preventDefault();
      closeSheetView();
    }
  });

  // Re-render the sheet page while the sheet view is open to keep the
  // loop region overlay and current-time cursor in sync (cheap, only a
  // single drawSheetMusic call per frame).
  let sheetRAF: number | null = null;
  function sheetRAFLoop(): void {
    if (!sheetOpen) {
      sheetRAF = null;
      return;
    }
    renderSheetPage();
    sheetRAF = requestAnimationFrame(sheetRAFLoop);
  }
  function startSheetRAF(): void {
    if (sheetRAF === null) sheetRAF = requestAnimationFrame(sheetRAFLoop);
  }

  // Close the sheet view when the game exits playing state (retry/menu/back).
  sheetScreen.addEventListener('click', (e) => {
    // Click on the backdrop but not on the content closes the sheet. The
    // toolbar/canvas are inside #sheet-screen-content which has its own pointer handlers.
    if (e.target === sheetScreen) closeSheetView();
  });
}

init();

import { Game, GameState, LoopDefinitionState } from './game/Game.js';
import { Synth } from './audio/Synth.js';
import { KeyboardInput } from './input/KeyboardInput.js';
import { MidiInput } from './input/MidiInput.js';
import { Menu } from './ui/Menu.js';
import { ScoreDisplay } from './ui/ScoreDisplay.js';
import { TrackSelect } from './ui/TrackSelect.js';
import { parseMidi, normalizeSong } from './utils/MidiParser.js';
import { SHEET_TOP_OFFSET, Renderer, SHEET_BEATS_VISIBLE } from './game/Renderer.js';
import type { SongNote } from './game/NoteManager.js';
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
        songs.push(normalizeSong(await res.json()));
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
  const trackSelect = new TrackSelect();

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
  const loopPlayBtn = document.getElementById('btn-loop-play')!;
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
  function pageDuration(): number { return SHEET_BEATS_VISIBLE * (60 / game.songBpm); }
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

    const showLoopPlay = game.loopActive && game.learningMode;
    loopPlayBtn.style.display = showLoopPlay ? '' : 'none';
    loopPlayBtn.classList.toggle('play-active', game.loopPlay);
    loopPlayBtn.textContent = game.loopPlay ? '\u23F8' : '\u25B6';

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
    const hasExisting = game.loopStart !== null && game.loopEnd !== null;
    if (hasExisting) {
      // Keep existing boundaries visible so the user sees what they had,
      // but deactivate the loop and enter start-defining mode.
      game.deactivateLoop();
      game.loopDefinitionState = LoopDefinitionState.Start;
    } else {
      game.beginLoopDefine();
    }
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

  loopPlayBtn.addEventListener('click', () => {
    game.loopPlay = !game.loopPlay;
    updateLoopUI();
  });

  handLeft.addEventListener('click', () => {
    setPracticeHand(game.practiceHand === PracticeHand.Left ? PracticeHand.Both : PracticeHand.Left);
  });
  handRight.addEventListener('click', () => {
    setPracticeHand(game.practiceHand === PracticeHand.Right ? PracticeHand.Both : PracticeHand.Right);
  });

  // -- Background track panel ----------------------------------------------
  const toggleBgBtn = document.getElementById('btn-toggle-bg')! as HTMLButtonElement;
  const bgPanel = document.getElementById('bg-panel')!;
  const bgTrackList = document.getElementById('bg-track-list')!;
  let bgPanelOpen = false;

  function renderBgPanel(): void {
    bgTrackList.innerHTML = '';
    const song = game.song;
    if (!song?.tracks || song.tracks.length === 0) {
      bgPanel.classList.add('hidden');
      return;
    }
    const selectedSet = new Set(song.selectedTrackIndices ?? []);
    const bgTracks = song.tracks.filter((t) => !selectedSet.has(t.index));
    if (bgTracks.length === 0) {
      bgPanel.classList.add('hidden');
      return;
    }
    for (const track of bgTracks) {
      const li = document.createElement('li');
      li.className = 'bg-track-item';

      const label = document.createElement('span');
      label.className = 'bg-track-label';
      label.textContent = track.name;

      const toggle = document.createElement('button');
      toggle.className = 'bg-track-toggle';
      const isOn = game.noteManager.backgroundTracks.has(track.index);
      toggle.textContent = isOn ? '\u{1F50A}' : '\u{1F507}';
      toggle.title = isOn ? 'Mute background' : 'Unmute background';
      toggle.addEventListener('click', () => {
        const nowOn = !game.noteManager.backgroundTracks.has(track.index);
        game.setBackgroundTrack(track.index, nowOn);
        toggle.textContent = nowOn ? '\u{1F50A}' : '\u{1F507}';
        toggle.title = nowOn ? 'Mute background' : 'Unmute background';
      });

      li.appendChild(label);
      li.appendChild(toggle);
      bgTrackList.appendChild(li);
    }
  }

  function toggleBgPanel(): void {
    bgPanelOpen = !bgPanelOpen;
    if (bgPanelOpen) {
      renderBgPanel();
      bgPanel.classList.remove('hidden');
    } else {
      bgPanel.classList.add('hidden');
    }
  }

  toggleBgBtn.addEventListener('click', toggleBgPanel);

  document.addEventListener('click', (e) => {
    if (bgPanelOpen && !bgPanel.contains(e.target as Node) && e.target !== toggleBgBtn) {
      bgPanelOpen = false;
      bgPanel.classList.add('hidden');
    }
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

  document.getElementById('btn-retry')!.addEventListener('click', () => { closeSheetView(); game.retry(); setMode(game.learningMode); applyPracticeHandButtons(); updateLoopUI(); });
  document.getElementById('btn-menu')!.addEventListener('click', () => { closeSheetView(); game.backToMenu(); });
  document.getElementById('btn-restart')!.addEventListener('click', () => { closeSheetView(); game.retry(); setMode(game.learningMode); applyPracticeHandButtons(); updateLoopUI(); });

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
        const needsSelection = song.tracks && song.tracks.length > 2 && (song.selectedTrackIndices?.length ?? 0) === 0;
        if (needsSelection) {
          trackSelect.onConfirm = (selection) => {
            song.selectedTrackIndices = selection.indices;
            song.trackHands = selection.hands;
            song.backgroundTracks = selection.backgroundTracks;
            menu.addSong(song);
            trackSelect.onConfirm = null;
            trackSelect.onCancel = null;
          };
          trackSelect.onCancel = () => {
            menu.setMidiStatus(false, 'Import cancelled');
            trackSelect.onConfirm = null;
            trackSelect.onCancel = null;
          };
          trackSelect.show(song);
        } else {
          menu.addSong(song);
        }
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
  let resizeRAF = false;

  resizeHandle.addEventListener('pointerdown', (e) => {
    resizing = true;
    resizeHandle.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  window.addEventListener('pointermove', (e) => {
    if (!resizing || resizeRAF) return;
    if (game.state !== GameState.Playing) return;
    resizeRAF = true;
    requestAnimationFrame(() => {
      const rect = canvas.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const minSheetHeight = BASE_SHEET_HEIGHT * 0.5;
      const maxSheetHeight = canvas.height * 0.35;
      const targetHeight = Math.max(minSheetHeight, Math.min(maxSheetHeight, y - SHEET_TOP_OFFSET));
      game.renderer.sheetScale = targetHeight / BASE_SHEET_HEIGHT;
      resizeRAF = false;
    });
  });

  window.addEventListener('pointerup', () => {
    resizing = false;
  });

  function noteFromClick(rect: DOMRect, clientX: number, clientY: number, renderer: Renderer, maxRadius = 30): SongNote | null {
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const r = renderer;
    if (r.sheetBarW <= 0) return null;
    if (x < r.sheetBarX - maxRadius || x > r.sheetBarX + r.sheetBarW + maxRadius) return null;

    const note = game.noteManager.findNearestNoteByClick(x, y, r, maxRadius);
    if (note) return note;

    // Fallback: find nearest by time with staff hint (legacy behaviour).
    const t = r.sheetViewStart + ((x - r.sheetBarX) / r.sheetBarW) * (r.sheetViewEnd - r.sheetViewStart);
    let staff: 'treble' | 'bass' | undefined;
    if (y >= r.sheetTrebleTop && y <= r.sheetTrebleBottom) staff = 'treble';
    else if (y >= r.sheetBassTop && y <= r.sheetBassBottom) staff = 'bass';
    return game.noteManager.findNearestNote(t, staff);
  }

  canvas.addEventListener('click', (e) => {
    if (game.state !== GameState.Playing) return;
    const inLoopDefine = game.loopDefinitionState === LoopDefinitionState.Start || game.loopDefinitionState === LoopDefinitionState.End;
    const note = noteFromClick(canvas.getBoundingClientRect(), e.clientX, e.clientY, game.renderer, inLoopDefine ? 50 : 30);
    if (!note) return;

    if (inLoopDefine) {
      const wasStart = game.loopDefinitionState === LoopDefinitionState.Start;
      game.setLoopBoundary(note.time);
      updateLoopUI();
      if (!wasStart && game.loopStart !== null) {
        game.seekTo(game.loopStart);
      }
    } else {
      game.seekTo(note.time);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (game.state !== GameState.Playing) return;
    if (e.code === 'KeyR') {
      closeSheetView();
      game.retry();
    }
  });

  // -- Full sheet view wiring ---------------------------------------------

  function sheetPageCount(): number {
    const dur = game.noteManager.getSongDuration();
    return Math.max(1, Math.ceil(dur / pageDuration()));
  }

  function renderSheetPage(): void {
    if (!sheetOpen) return;
    const ctx = sheetRenderer.ctx;
    ctx.clearRect(0, 0, sheetCanvas.width, sheetCanvas.height);
    const start = sheetCurrentPage * pageDuration();
    const end = Math.min(start + pageDuration(), game.noteManager.getSongDuration());
    sheetRenderer.drawSheetMusic(
      game.noteManager.trebleNotes,
      game.noteManager.bassNotes,
      game.currentTime,
      game.noteManager.getSongDuration(),
      { start: game.loopStart, end: game.loopEnd, active: game.loopActive, defining: game.loopDefinitionState },
      { start, end },
      game.songBpm,
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
      sheetCurrentPage = Math.min(Math.floor(game.currentTime / pageDuration()), sheetPageCount() - 1);
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
    const inLoopDefine = game.loopDefinitionState === LoopDefinitionState.Start || game.loopDefinitionState === LoopDefinitionState.End;
    const note = noteFromClick(sheetCanvas.getBoundingClientRect(), e.clientX, e.clientY, sheetRenderer, inLoopDefine ? 50 : 30);
    if (!note) return;

    if (inLoopDefine) {
      const wasStart = game.loopDefinitionState === LoopDefinitionState.Start;
      game.setLoopBoundary(note.time);
      updateLoopUI();
      if (wasStart) {
        renderSheetPage();
      } else {
        if (game.loopStart !== null) game.seekTo(game.loopStart);
        closeSheetView();
      }
    } else {
      game.seekTo(note.time);
      closeSheetView();
    }
  });

  // -- Hover cursor feedback for note selection ----------------------------
  function setupHoverCursor(
    targetCanvas: HTMLCanvasElement,
    targetRenderer: Renderer,
  ): void {
    let hoverRAF: number | null = null;
    targetCanvas.addEventListener('mousemove', (e) => {
      if (hoverRAF !== null) return;
      hoverRAF = requestAnimationFrame(() => {
        hoverRAF = null;
        if (game.state !== GameState.Playing) {
          targetCanvas.style.cursor = '';
          return;
        }
        const rect = targetCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const inLoopDefine = game.loopDefinitionState === LoopDefinitionState.Start
          || game.loopDefinitionState === LoopDefinitionState.End;
        const radius = inLoopDefine ? 50 : 30;
        const note = game.noteManager.findNearestNoteByClick(x, y, targetRenderer, radius);
        targetCanvas.style.cursor = note ? 'pointer' : 'crosshair';
      });
    });
    targetCanvas.addEventListener('mouseleave', () => {
      targetCanvas.style.cursor = 'crosshair';
    });
  }
  setupHoverCursor(canvas, game.renderer);
  setupHoverCursor(sheetCanvas, sheetRenderer);

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
    if (!sheetOpen || game.state !== GameState.Playing) {
      closeSheetView();
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

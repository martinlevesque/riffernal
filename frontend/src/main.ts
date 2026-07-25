import { Game, GameState, LoopDefinitionState } from './game/Game.js';
import { Synth } from './audio/Synth.js';
import { KeyboardInput } from './input/KeyboardInput.js';
import { MidiInput } from './input/MidiInput.js';
import { Menu } from './ui/Menu.js';
import { ScoreDisplay } from './ui/ScoreDisplay.js';
import { TrackSelect } from './ui/TrackSelect.js';
import { CategorySelect } from './ui/CategorySelect.js';
import { parseMidi } from './utils/MidiParser.js';
import { SHEET_TOP_OFFSET, Renderer, SHEET_BEATS_VISIBLE } from './game/rendering/Renderer.js';
import type { SongNote } from './game/NoteManager.js';
import { PracticeHand } from './utils/notes.js';
import type { Song } from './utils/MidiParser.js';
import {
  fetchSongs, fetchSong, uploadSong, songFullToSong, summaryToSong, markSongPlayed,
  updateSongTitle, recordBestScore, saveSongTrackPreferences,
} from './api/SongApi.js';
import { fetchLoops, createLoop, updateLoopEnabled, deleteLoop } from './api/LoopApi.js';
import { fetchUserSettings, updateUserSettings } from './api/UserApi.js';
import { formatTime, formatScore } from './utils/helpers.js';
import { themeManager } from './themes/ThemeManager.js';

const SHEET_STAFF_LINE_SPACING = 10;
const BASE_SHEET_HEIGHT = 5 + 4 * SHEET_STAFF_LINE_SPACING + 8 + 4 * SHEET_STAFF_LINE_SPACING + 5;

async function loadSongs(): Promise<Song[]> {
  try {
    const summaries = await fetchSongs();
    return summaries.map(summaryToSong);
  } catch (e) {
    console.warn('Failed to load songs from API:', e);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Setup functions (top-level, each owns its DOM elements)
// ---------------------------------------------------------------------------

function setupBackgroundPanel(game: Game): void {
  const toggleBgBtn = document.getElementById('btn-toggle-bg')! as HTMLButtonElement;
  const bgPanel = document.getElementById('bg-panel')!;
  const bgTrackList = document.getElementById('bg-track-list')!;
  let bgPanelOpen = false;

  // Debounced persistence of the in-game Tracks panel state.
  let preferencesTimer: ReturnType<typeof setTimeout> | null = null;
  function schedulePreferencesSave(song: Song): void {
    const songId = song.id;
    if (songId === undefined) return;
    if (preferencesTimer !== null) clearTimeout(preferencesTimer);
    preferencesTimer = setTimeout(() => {
      preferencesTimer = null;
      const preferences = song.trackPreferences;
      if (!preferences) return;
      saveSongTrackPreferences(songId, preferences)
        .catch((e) => console.warn('Failed to save track preferences:', e));
    }, 500);
  }
  game.onTrackPreferencesChange = schedulePreferencesSave;

  function mainTrackName(song: Song): string {
    const tracks = song.tracks ?? [];
    const firstSelected = song.selectedTrackIndices?.[0];
    const picked = firstSelected !== undefined
      ? tracks.find((t) => t.index === firstSelected)
      : undefined;
    return picked?.name ?? tracks[0]?.name ?? 'Main (piano)';
  }

  function renderBgPanel(): void {
    bgTrackList.innerHTML = '';
    const song = game.song;
    if (!song) {
      bgPanel.classList.add('hidden');
      return;
    }

    // Main (foreground) track row: toggles whether the web app's synth plays
    // live key presses. Muting it lets a plugged-in MIDI keyboard be the
    // audible source instead.
    const mainLi = document.createElement('li');
    mainLi.className = 'bg-track-item';
    const mainLabel = document.createElement('span');
    mainLabel.className = 'bg-track-label';
    mainLabel.textContent = `${mainTrackName(song)} (main)`;
    const mainToggle = document.createElement('button');
    mainToggle.className = 'bg-track-toggle';
    const mainOn = !game.mainTrackMuted;
    mainToggle.textContent = mainOn ? '\u{1F50A}' : '\u{1F507}';
    mainToggle.title = mainOn ? 'Mute main track' : 'Unmute main track';
    mainToggle.addEventListener('click', () => {
      const nowMuted = !game.mainTrackMuted; // flip
      game.setMainTrackMuted(nowMuted);
      const on = !nowMuted;
      mainToggle.textContent = on ? '\u{1F50A}' : '\u{1F507}';
      mainToggle.title = on ? 'Mute main track' : 'Unmute main track';
    });
    mainLi.appendChild(mainLabel);
    mainLi.appendChild(mainToggle);
    bgTrackList.appendChild(mainLi);

    if (!song.tracks || song.tracks.length === 0) {
      bgPanel.classList.remove('hidden');
      return;
    }
    const selectedSet = new Set(song.selectedTrackIndices ?? []);
    const bgTracks = song.tracks.filter((t) => !selectedSet.has(t.index));
    if (bgTracks.length === 0) {
      bgPanel.classList.remove('hidden');
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
    bgPanel.classList.remove('hidden');
  }

  toggleBgBtn.addEventListener('click', () => {
    bgPanelOpen = !bgPanelOpen;
    if (bgPanelOpen) {
      renderBgPanel();
      bgPanel.classList.remove('hidden');
    } else {
      bgPanel.classList.add('hidden');
    }
  });

  document.addEventListener('click', (e) => {
    if (bgPanelOpen && !bgPanel.contains(e.target as Node) && e.target !== toggleBgBtn) {
      bgPanelOpen = false;
      bgPanel.classList.add('hidden');
    }
  });
}

function setupSpeedControls(game: Game): void {
  const speedValue = document.getElementById('speed-value')!;
  const speedDown = document.getElementById('speed-down')!;
  const speedUp = document.getElementById('speed-up')!;

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
    if (e.code === 'BracketLeft') changeSpeed(-0.1);
    else if (e.code === 'BracketRight') changeSpeed(0.1);
  });

  updateSpeedDisplay();
}

function setupRenamePopup(menu: Menu): { onRename: (song: Song) => void } {
  const renamePopup = document.getElementById('rename-popup')!;
  const renameTitle = document.getElementById('rename-song-title') as HTMLInputElement;
  const renameArtist = document.getElementById('rename-song-artist') as HTMLInputElement;
  const btnRenameSave = document.getElementById('btn-rename-save') as HTMLButtonElement;
  const btnRenameCancel = document.getElementById('btn-rename-cancel') as HTMLButtonElement;
  let renameSongId: number | null = null;

  function showRenamePopup(song: Song): void {
    if (song.id === undefined) return;
    renameSongId = song.id;
    renameTitle.value = song.title;
    renameArtist.value = song.artist || '';
    renamePopup.classList.remove('hidden');
    renameTitle.focus();
    renameTitle.select();
  }

  btnRenameSave.addEventListener('click', async () => {
    if (renameSongId === null) return;
    const title = renameTitle.value.trim();
    if (!title) return;
    const artist = renameArtist.value.trim();
    try {
      const updated = await updateSongTitle(renameSongId, title, artist);
      menu.updateSong(songFullToSong(updated));
    } catch (err) {
      console.error('Failed to rename song:', err);
    }
    renamePopup.classList.add('hidden');
    renameSongId = null;
  });

  btnRenameCancel.addEventListener('click', () => {
    renamePopup.classList.add('hidden');
    renameSongId = null;
  });

  renamePopup.addEventListener('click', (e) => {
    if (e.target === renamePopup) {
      renamePopup.classList.add('hidden');
      renameSongId = null;
    }
  });

  function handleRenameEnter(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      btnRenameSave.click();
    }
  }

  renameTitle.addEventListener('keydown', handleRenameEnter);
  renameArtist.addEventListener('keydown', handleRenameEnter);

  return { onRename: showRenamePopup };
}

function setupSongInfoPopup(
  game: Game,
  updatePauseBtn: () => void,
): {
  closeSongInfoPopup: () => void;
  showSongInfoPopup: (song: Song) => void;
} {
  const songInfoPopup = document.getElementById('song-info-popup')!;
  const songInfoDuration = document.getElementById('song-info-duration')!;
  const songInfoBestScore = document.getElementById('song-info-best-score')!;
  const btnCloseSongInfo = document.getElementById('btn-close-song-info')!;
  let songInfoTimer: ReturnType<typeof setTimeout> | null = null;

  function closeSongInfoPopup(): void {
    if (songInfoTimer !== null) {
      clearTimeout(songInfoTimer);
      songInfoTimer = null;
    }
    songInfoPopup.classList.add('hidden');
    if (game.state === GameState.Playing && game.paused) {
      game.togglePause();
      updatePauseBtn();
    }
  }

  btnCloseSongInfo.addEventListener('click', closeSongInfoPopup);

  function showSongInfoPopup(song: Song): void {
    const duration = game.noteManager.getSongDuration();
    songInfoDuration.textContent = formatTime(duration);
    songInfoBestScore.textContent =
      song.bestScore != null ? formatScore(song.bestScore) : 'No record yet';
    songInfoPopup.classList.remove('hidden');
    songInfoTimer = setTimeout(closeSongInfoPopup, 4000);
  }

  return { closeSongInfoPopup, showSongInfoPopup };
}

function setupMidiImport(
  menu: Menu,
  midiInput: MidiInput,
  trackSelect: TrackSelect,
  categorySelect: CategorySelect,
): void {
  const importBtn = document.getElementById('btn-import-midi')! as HTMLButtonElement;
  const importInput = document.getElementById('midi-import-input')! as HTMLInputElement;

  importBtn.addEventListener('click', () => importInput.click());

  importInput.addEventListener('change', () => {
    const file = importInput.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const song = parseMidi(reader.result as ArrayBuffer, file.name);
        const needsSelection = song.tracks && song.tracks.length > 2
          && (song.selectedTrackIndices?.length ?? 0) === 0;

        const proceed = (finalSong: Song, midiFile: File) => {
          categorySelect.onConfirm = async (categoryId, title, artist) => {
            categorySelect.onConfirm = null;
            categorySelect.onCancel = null;
            try {
              const full = await uploadSong({
                midiFile,
                metadata: {
                  title: title || finalSong.title,
                  artist: artist || finalSong.artist,
                  bpm: finalSong.bpm,
                  difficulty: finalSong.difficulty,
                  notes: finalSong.notes,
                  tracks: finalSong.tracks ?? [],
                  selectedTrackIndices: finalSong.selectedTrackIndices ?? [],
                  trackHands: finalSong.trackHands ?? {},
                  backgroundTracks: finalSong.backgroundTracks ?? [],
                },
                categoryId,
              });
              menu.addSong(songFullToSong(full));
              menu.setMidiStatus(midiInput.connected, 'Import complete');
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : String(err);
              alert(`Failed to save song: ${message}`);
              console.error(err);
            }
          };
          categorySelect.onCancel = () => {
            categorySelect.onConfirm = null;
            categorySelect.onCancel = null;
            menu.setMidiStatus(midiInput.connected, 'Import cancelled');
          };
          categorySelect.show(song);
        };

        if (needsSelection) {
          trackSelect.onConfirm = (selection) => {
            song.selectedTrackIndices = selection.indices;
            song.trackHands = selection.hands;
            song.backgroundTracks = selection.backgroundTracks;
            trackSelect.onConfirm = null;
            trackSelect.onCancel = null;
            proceed(song, file);
          };
          trackSelect.onCancel = () => {
            menu.setMidiStatus(false, 'Import cancelled');
            trackSelect.onConfirm = null;
            trackSelect.onCancel = null;
          };
          trackSelect.show(song);
        } else {
          proceed(song, file);
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
}

function setupHoverCursor(
  game: Game,
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

function setupSheetView(
  game: Game,
  canvas: HTMLCanvasElement,
  deps: {
    closeSongInfoPopup: () => void;
    setMode: (learning: boolean) => void;
    updateLoopUI: () => void;
  },
): { closeSheetView: () => void } {
  const { closeSongInfoPopup, setMode, updateLoopUI } = deps;

  const openSheetBtn = document.getElementById('btn-open-sheet')!;
  const sheetScreen = document.getElementById('sheet-screen')!;
  const sheetCanvas = document.getElementById('sheet-canvas') as HTMLCanvasElement;
  const sheetPrevBtn = document.getElementById('btn-sheet-prev')!;
  const sheetNextBtn = document.getElementById('btn-sheet-next')!;
  const sheetCloseBtn = document.getElementById('btn-close-sheet')!;
  const sheetPageInfo = document.getElementById('sheet-page-info')!;
  const sheetHint = document.getElementById('sheet-hint')!;
  const sheetRenderer = new Renderer(sheetCanvas);
  const defineLoopBtn = document.getElementById('btn-define-loop')!;
  const clearLoopBtn = document.getElementById('btn-clear-loop')!;
  const loopsList = document.getElementById('loops-list')!;
  const loopsPanelCount = document.getElementById('loops-panel-count')!;

  /** Format a loop's start/end times as used by panel rows and the inline
   *  status text. */
  function fmtBounds(start: number, end: number): string {
    return `${start.toFixed(2)}s-${end.toFixed(2)}s`;
  }

  /** Render the saved-loops panel rows. Called whenever the saved set or
   *  draft changes (save/delete/toggle/define complete). */
  function renderLoopsPanel(): void {
    loopsList.innerHTML = '';
    const loops = game.loop.loops;
    const chain = game.loop.chain;
    const idx = game.loop.currentIndex;
    const currentId = (idx !== null && idx >= 0 && idx < chain.length)
      ? chain[idx].id
      : null;

    // Header count reflects enabled loops (chain length), not total saved.
    loopsPanelCount.textContent = chain.length > 0
      ? `${chain.length} enabled`
      : '';

    if (loops.length === 0 && !game.loop.hasDraft) {
      const empty = document.createElement('li');
      empty.className = 'loops-list-empty';
      empty.textContent = 'No loops saved — click LOOP to define one';
      loopsList.appendChild(empty);
      return;
    }

    for (const loop of loops) {
      const li = document.createElement('li');
      li.className = 'loop-row';
      if (loop.id === currentId) li.classList.add('loop-row--current');

      const time = document.createElement('span');
      time.className = 'loop-row-time';
      time.textContent = fmtBounds(loop.startTime, loop.endTime);

      const toggle = document.createElement('button');
      toggle.className = 'loop-row-toggle';
      if (loop.enabled) toggle.classList.add('is-on');
      toggle.textContent = loop.enabled ? 'ON' : 'OFF';
      toggle.title = loop.enabled ? 'Disable loop' : 'Enable loop';
      toggle.addEventListener('click', async () => {
        const next = !loop.enabled;
        try {
          await updateLoopEnabled(loop.id, next);
          game.setLoopEnabled(loop.id, next);
          // Enabling a loop engages the chain (and disables scoring); the
          // user is now in practice mode, so switch to LEARN. Disabling
          // leaves the mode alone — the user can switch back to PLAY
          // themselves if they want a competitive run.
          if (next && game.loopActive && !game.learningMode) setMode(true);
          renderLoopsPanel();
          updateLoopUI();
          if (sheetOpen) renderSheetPage();
        } catch (e) {
          console.error('Failed to update loop:', e);
        }
      });

      const delBtn = document.createElement('button');
      delBtn.className = 'loop-row-delete';
      delBtn.textContent = 'Delete';
      delBtn.title = 'Delete this loop';
      delBtn.addEventListener('click', async () => {
        try {
          await deleteLoop(loop.id);
          game.deleteSavedLoop(loop.id);
          renderLoopsPanel();
          updateLoopUI();
          if (sheetOpen) renderSheetPage();
        } catch (e) {
          console.error('Failed to delete loop:', e);
        }
      });

      li.appendChild(time);
      li.appendChild(toggle);
      li.appendChild(delBtn);
      loopsList.appendChild(li);
    }

    // Draft in progress (mid-define or awaiting auto-save).
    // The "both boundaries picked" case auto-saves in handleCanvasClick,
    // so we only show a Cancel option for partial drafts.
    if (game.loopDefinitionState !== LoopDefinitionState.Off) {
      const ds = game.loop.draftStart;
      const li = document.createElement('li');
      li.className = 'loop-row loop-row--draft';

      const time = document.createElement('span');
      time.className = 'loop-row-time';
      time.textContent = ds !== null
        ? `${fmtBounds(ds, ds)} (picking end…)`
        : '(picking start…)';

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'loop-row-cancel';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.addEventListener('click', () => {
        game.cancelLoopDraft();
        renderLoopsPanel();
        updateLoopUI();
        if (sheetOpen) renderSheetPage();
      });

      li.appendChild(time);
      li.appendChild(cancelBtn);
      loopsList.appendChild(li);
    }
  }

  function pageDuration(): number { return SHEET_BEATS_VISIBLE * (60 / game.songBpm); }
  let sheetCurrentPage = 0;
  let sheetOpen = false;

  function sheetPageCount(): number {
    return Math.max(1, Math.ceil(game.noteManager.getSongDuration() / pageDuration()));
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
      game.loop.snapshot(),
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

  function jumpSheetToCurrent(): void {
    const dur = game.noteManager.getSongDuration();
    sheetCurrentPage = dur <= 0
      ? 0
      : Math.min(Math.floor(game.currentTime / pageDuration()), sheetPageCount() - 1);
    if (sheetCurrentPage < 0) sheetCurrentPage = 0;
    renderSheetPage();
  }

  function openSheetView(jumpToCurrent = true): void {
    if (sheetOpen) {
      if (jumpToCurrent) jumpSheetToCurrent();
      else renderSheetPage();
      renderLoopsPanel();
      return;
    }
    sheetOpen = true;
    sheetScreen.classList.add('active');
    sheetRenderer.resize();
    sheetRenderer.sheetScale = Math.max(sheetRenderer.sheetScale, 1.5);
    renderLoopsPanel();
    if (jumpToCurrent) jumpSheetToCurrent();
    else renderSheetPage();
  }

  function closeSheetView(): void {
    sheetOpen = false;
    sheetScreen.classList.remove('active');
  }

  function toggleSheetView(): void {
    if (sheetOpen) closeSheetView();
    else openSheetView();
  }

  function noteFromClick(
    rect: DOMRect, clientX: number, clientY: number,
    renderer: Renderer, maxRadius = 30,
  ): SongNote | null {
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const r = renderer;
    if (r.sheetBarW <= 0) return null;
    if (x < r.sheetBarX - maxRadius || x > r.sheetBarX + r.sheetBarW + maxRadius) return null;
    const note = game.noteManager.findNearestNoteByClick(x, y, r, maxRadius);
    if (note) return note;
    const t = r.sheetViewStart
      + ((x - r.sheetBarX) / r.sheetBarW) * (r.sheetViewEnd - r.sheetViewStart);
    let staff: 'treble' | 'bass' | undefined;
    if (y >= r.sheetTrebleTop && y <= r.sheetTrebleBottom) staff = 'treble';
    else if (y >= r.sheetBassTop && y <= r.sheetBassBottom) staff = 'bass';
    return game.noteManager.findNearestNote(t, staff);
  }

  async function handleCanvasClick(e: MouseEvent, targetCanvas: HTMLCanvasElement, renderer: Renderer): Promise<void> {
    if (game.state !== GameState.Playing) return;
    const inLoopDefine
      = game.loopDefinitionState === LoopDefinitionState.Start
      || game.loopDefinitionState === LoopDefinitionState.End;
    const note = noteFromClick(
      targetCanvas.getBoundingClientRect(), e.clientX, e.clientY,
      renderer, inLoopDefine ? 50 : 30,
    );
    if (!note) return;

    if (inLoopDefine) {
      const newState = game.setLoopBoundary(note.time);
      updateLoopUI();
      renderLoopsPanel();
      if (targetCanvas === sheetCanvas) renderSheetPage();

      // When both boundaries picked (Off returned) and draft exists,
      // auto-save and auto-enable.
      if (newState === LoopDefinitionState.Off && game.loop.hasDraft) {
        const song = game.song;
        if (!song || song.id === undefined) return;
        const ds = game.loop.draftStart!;
        const de = game.loop.draftEnd!;
        try {
          const created = await createLoop(song.id, ds, de, true);
          game.cancelLoopDraft();
          game.addSavedLoop(created);
          if (game.loopActive && !game.learningMode) setMode(true);
          renderLoopsPanel();
          updateLoopUI();
          if (sheetOpen) renderSheetPage();
        } catch (err) {
          console.error('Failed to auto-save loop:', err);
        }
      }
    } else {
      game.seekTo(note.time);
      if (targetCanvas !== canvas) closeSheetView();
    }
  }

  // Loop define / clear buttons
  defineLoopBtn.addEventListener('click', () => {
    // beginLoopDefine() resets any in-progress draft and enters the
    // start-boundary phase.
    game.beginLoopDefine();
    if (!game.learningMode) setMode(true);
    updateLoopUI();
    renderLoopsPanel();
    if (game.state === GameState.Playing) {
      openSheetView();
      startSheetRAF();
    }
  });

  clearLoopBtn.addEventListener('click', () => {
    // Cancel an in-progress draft only; saved loops are deleted via the
    // panel's per-row Delete button.
    if (game.loopDefinitionState !== LoopDefinitionState.Off || game.loop.hasDraft) {
      game.cancelLoopDraft();
    }
    updateLoopUI();
    renderLoopsPanel();
    if (sheetOpen) renderSheetPage();
  });

  // Sheet resize
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

  window.addEventListener('pointerup', () => { resizing = false; });

  // Canvas click (seeking / loop define)
  canvas.addEventListener('click', (e) => handleCanvasClick(e, canvas, game.renderer));

  // Keyboard: R to retry
  document.addEventListener('keydown', (e) => {
    if (game.state !== GameState.Playing) return;
    if (e.code === 'KeyR') {
      closeSongInfoPopup();
      closeSheetView();
      game.retry();
    }
  });

  // Sheet toolbar / canvas listeners
  openSheetBtn.addEventListener('click', () => {
    if (game.state === GameState.Playing) toggleSheetView();
  });
  sheetCloseBtn.addEventListener('click', closeSheetView);
  sheetPrevBtn.addEventListener('click', () => {
    if (sheetCurrentPage > 0) { sheetCurrentPage--; renderSheetPage(); }
  });
  sheetNextBtn.addEventListener('click', () => {
    if (sheetCurrentPage < sheetPageCount() - 1) { sheetCurrentPage++; renderSheetPage(); }
  });
  sheetCanvas.addEventListener('click', (e) => handleCanvasClick(e, sheetCanvas, sheetRenderer));

  // Keyboard: arrow keys & Escape for sheet navigation
  document.addEventListener('keydown', (e) => {
    if (!sheetOpen) return;
    if (e.code === 'ArrowLeft') {
      e.preventDefault();
      if (sheetCurrentPage > 0) { sheetCurrentPage--; renderSheetPage(); }
    } else if (e.code === 'ArrowRight') {
      e.preventDefault();
      if (sheetCurrentPage < sheetPageCount() - 1) { sheetCurrentPage++; renderSheetPage(); }
    } else if (e.code === 'Escape') {
      e.preventDefault();
      closeSheetView();
    }
  });

  // RAF loop to keep sheet overlay in sync
  let sheetRAF: number | null = null;
  let lastPanelRenderLoopId: number | null = null;
  function sheetRAFLoop(): void {
    if (!sheetOpen || game.state !== GameState.Playing) {
      closeSheetView();
      sheetRAF = null;
      return;
    }
    renderSheetPage();
    // Keep the loops-panel current-loop highlight in sync as the chain
    // advances. Refresh once per ~30 frames to avoid layout thrash.
    if (lastPanelRenderLoopId !== game.loop.currentIndex) {
      lastPanelRenderLoopId = game.loop.currentIndex;
      renderLoopsPanel();
    }
    sheetRAF = requestAnimationFrame(sheetRAFLoop);
  }
  function startSheetRAF(): void {
    if (sheetRAF === null) sheetRAF = requestAnimationFrame(sheetRAFLoop);
  }

  // Backdrop click closes sheet
  sheetScreen.addEventListener('click', (e) => {
    if (e.target === sheetScreen) closeSheetView();
  });

  // Hover cursor on sheet canvas
  setupHoverCursor(game, sheetCanvas, sheetRenderer);

  return { closeSheetView };
}

function setupResultButtons(
  game: Game,
  deps: {
    closeSongInfoPopup: () => void;
    closeSheetView: () => void;
    setMode: (learning: boolean) => void;
    applyPracticeHandButtons: () => void;
    updateLoopUI: () => void;
    updatePauseBtn: () => void;
  },
): void {
  const { closeSongInfoPopup, closeSheetView, setMode, applyPracticeHandButtons, updateLoopUI, updatePauseBtn } = deps;

  document.getElementById('btn-play')!.addEventListener('click', () => {
    closeSongInfoPopup();
    closeSheetView();
    game.setPracticeHand(PracticeHand.Both);
    setMode(false);
    game.retry();
    updateLoopUI();
    updatePauseBtn();
  });

  document.getElementById('btn-retry')!.addEventListener('click', () => {
    closeSongInfoPopup();
    closeSheetView();
    setMode(game.learningMode);
    game.retry();
    applyPracticeHandButtons();
    updateLoopUI();
    updatePauseBtn();
  });

  document.getElementById('btn-menu')!.addEventListener('click', () => {
    closeSongInfoPopup();
    closeSheetView();
    game.backToMenu();
  });

  document.getElementById('btn-restart')!.addEventListener('click', () => {
    closeSongInfoPopup();
    closeSheetView();
    setMode(game.learningMode);
    game.retry();
    applyPracticeHandButtons();
    updateLoopUI();
    updatePauseBtn();
  });
}

// ---------------------------------------------------------------------------
// init
// ---------------------------------------------------------------------------

/**
 * App bootstrap. Constructs the Synth, KeyboardInput, MidiInput and Game,
 * wires every UI button to the corresponding game call, connects MIDI input,
 * then starts the render loop and the setup helpers. Invoked at file end.
 */
async function init(): Promise<void> {
  themeManager.init();

  const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
  const synth = new Synth();
  const keyboardInput = new KeyboardInput();
  const midiInput = new MidiInput();
  const game = new Game(canvas, synth, keyboardInput, midiInput);
  // Exposed for tests so they can read game.currentTime etc.
  (window as unknown as Record<string, unknown>)._game = game;
  game.scoreDisplay = new ScoreDisplay();
  const trackSelect = new TrackSelect();

  const modePlay = document.getElementById('mode-play')!;
  const modeLearn = document.getElementById('mode-learn')!;
  const handControl = document.getElementById('hand-control')!;
  const handLeft = document.getElementById('hand-left')!;
  const handRight = document.getElementById('hand-right')!;
  const loopPlayBtn = document.getElementById('btn-loop-play')!;
  const pauseBtn = document.getElementById('btn-pause')!;

  // --- Shared helpers -------------------------------------------------------
  function applyPracticeHandButtons(): void {
    handLeft.classList.toggle('active', game.practiceHand === PracticeHand.Left);
    handRight.classList.toggle('active', game.practiceHand === PracticeHand.Right);
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
    const defineLoopBtn = document.getElementById('btn-define-loop')!;
    const loopStatus = document.getElementById('loop-status')!;
    const phase = game.loopDefinitionState;
    defineLoopBtn.classList.toggle('active', phase !== 'off');
    defineLoopBtn.classList.toggle('loop-active', game.loopActive);

    const enabledCount = game.loop.chain.length;
    const savedCount = game.loop.loops.length;
    loopPlayBtn.style.display = (game.loopActive && game.learningMode) ? '' : 'none';
    loopPlayBtn.classList.toggle('play-active', game.loopPlay);
    loopPlayBtn.textContent = game.loopPlay ? '\u23F8' : '\u25B6';

    if (phase === 'start') loopStatus.textContent = 'Click start note';
    else if (phase === 'end') loopStatus.textContent = 'Click end note';
    else if (game.loop.hasDraft) loopStatus.textContent = 'Draft ready — Save in Loops panel';
    else if (game.loopActive) {
      const cur = game.loop.current;
      loopStatus.textContent = cur
        ? `Loop ${cur.startTime.toFixed(2)}s-${cur.endTime.toFixed(2)}s`
        : 'Chain active';
    } else if (savedCount > 0) {
      loopStatus.textContent = enabledCount > 0
        ? `${enabledCount} of ${savedCount} loops enabled`
        : `${savedCount} loop${savedCount === 1 ? '' : 's'} saved`;
    } else loopStatus.textContent = 'No loops';
  }

  function updatePauseBtn(): void {
    pauseBtn.innerHTML = game.paused ? '&#9654;' : '&#9646;&#9646;';
    pauseBtn.title = game.paused ? 'Resume (Space)' : 'Pause (Space)';
  }

  // --- Inline wiring --------------------------------------------------------
  modePlay.addEventListener('click', () => setMode(false));
  modeLearn.addEventListener('click', () => setMode(true));
  loopPlayBtn.addEventListener('click', () => { game.loopPlay = !game.loopPlay; updateLoopUI(); });
  handLeft.addEventListener('click', () => setPracticeHand(
    game.practiceHand === PracticeHand.Left ? PracticeHand.Both : PracticeHand.Left));
  handRight.addEventListener('click', () => setPracticeHand(
    game.practiceHand === PracticeHand.Right ? PracticeHand.Both : PracticeHand.Right));
  pauseBtn.addEventListener('click', () => {
    if (game.state === GameState.Playing) { game.togglePause(); updatePauseBtn(); }
  });
  document.addEventListener('keydown', (e) => {
    if (game.state !== GameState.Playing) return;
    if (e.code === 'Space') { e.preventDefault(); game.togglePause(); updatePauseBtn(); }
    else if (e.code === 'KeyN') game.seekToNextNote();
  });
  document.getElementById('btn-next-note')!.addEventListener('click', () => {
    if (game.state === GameState.Playing) game.seekToNextNote();
  });

  // Settings popup
  const settingsPopup = document.getElementById('settings-popup')!;
  document.getElementById('btn-settings')!.addEventListener('click', () => settingsPopup.classList.remove('hidden'));
  document.getElementById('btn-close-settings')!.addEventListener('click', () => settingsPopup.classList.add('hidden'));
  settingsPopup.addEventListener('click', (e) => { if (e.target === settingsPopup) settingsPopup.classList.add('hidden'); });

  // Theme dropdown
  const btnTheme = document.getElementById('btn-theme')!;
  const themeDropdown = document.getElementById('theme-dropdown')!;

  function renderThemeDropdown(): void {
    themeDropdown.innerHTML = '';
    for (const theme of themeManager.availableThemes) {
      const option = document.createElement('button');
      option.className = `theme-option${theme.id === themeManager.current.id ? ' active' : ''}`;
      option.textContent = theme.name;
      option.addEventListener('click', () => {
        themeManager.apply(theme);
        renderThemeDropdown();
        themeDropdown.classList.add('hidden');
      });
      themeDropdown.appendChild(option);
    }
  }

  renderThemeDropdown();

  btnTheme.addEventListener('click', (e) => {
    e.stopPropagation();
    themeDropdown.classList.toggle('hidden');
  });

  document.addEventListener('click', () => {
    themeDropdown.classList.add('hidden');
  });

  // User settings
  const showUsedKeysCheckbox = document.getElementById('show-used-keys') as HTMLInputElement;
  const octaveAgnosticCheckbox = document.getElementById('octave-agnostic') as HTMLInputElement;
  try {
    const settings = await fetchUserSettings();
    game.showUsedKeys = settings.piano_show_used_keys_only ?? false;
    showUsedKeysCheckbox.checked = game.showUsedKeys;
    game.octaveAgnostic = settings.octave_agnostic ?? false;
    octaveAgnosticCheckbox.checked = game.octaveAgnostic;
  } catch { /* ignore */ }
  showUsedKeysCheckbox.addEventListener('change', () => {
    game.setShowUsedKeys(showUsedKeysCheckbox.checked);
    updateUserSettings({ piano_show_used_keys_only: showUsedKeysCheckbox.checked })
      .catch((e) => console.warn('Failed to save settings:', e));
  });
  octaveAgnosticCheckbox.addEventListener('change', () => {
    game.octaveAgnostic = octaveAgnosticCheckbox.checked;
    updateUserSettings({ octave_agnostic: octaveAgnosticCheckbox.checked })
      .catch((e) => console.warn('Failed to save settings:', e));
  });

  // --- Setup functions that depend on local helpers -------------------------
  const { closeSongInfoPopup, showSongInfoPopup } = setupSongInfoPopup(game, updatePauseBtn);

  game.onResults = (scoring, song) => {
    if (!song.id || game.usedLearningMode) return;
    recordBestScore(song.id, scoring.score)
      .then(({ bestScore, lastScore }) => {
        song.bestScore = bestScore;
        song.lastScore = lastScore;
        menu.updateSongStats(song.id!, bestScore, lastScore);
      })
      .catch((e) => console.error('Failed to record best score:', e));
  };

  // --- Song loading & menu --------------------------------------------------
  const songs = await loadSongs();
  if (songs.length === 0) {
    (document.getElementById('btn-start') as HTMLButtonElement).disabled = true;
  }
  const menu = new Menu(songs);
  await menu.loadCategories();
  const categorySelect = new CategorySelect();

  menu.onStart = async (song) => {
    setMode(false);
    setPracticeHand(PracticeHand.Both);
    let fullSong = song;
    if (song.id !== undefined && song.notes.length === 0) {
      try { fullSong = songFullToSong(await fetchSong(song.id)); }
      catch (e) { console.warn('Failed to fetch full song:', e); }
    }
    // Apply the user's saved Tracks panel preferences before
    // starting, so muted background / main tracks stay muted across games
    // and across sessions for this song. Note: `game.retry()` reuses
    // `currentSong` with its trackPreferences already set, so it's covered.
    if (fullSong.trackPreferences) {
      fullSong.backgroundTracks = fullSong.trackPreferences.backgroundTracks;
      game.mainTrackMuted = fullSong.trackPreferences.mainTrackMuted;
    } else if (game.mainTrackMuted) {
      // Reset to default when there's no stored pref for this song.
      game.mainTrackMuted = false;
    }
    // Load saved loops before start so Game.start() can engage the chain
    // (with the countdown buffer) when ≥1 loop is enabled.
    let hasEnabledLoops = false;
    if (fullSong.id !== undefined) {
      try {
        const loops = await fetchLoops(fullSong.id);
        game.loadLoops(loops);
        hasEnabledLoops = loops.some((l) => l.enabled);
      } catch (e) {
        console.warn('Failed to fetch loops:', e);
      }
    }
    // Loops disable scoring, so auto-switch to LEARN mode (practice) when
    // any saved loop is enabled. The user can switch back to PLAY mode via
    // the mode toggle, which disengages the chain.
    if (hasEnabledLoops) setMode(true);
    game.start(fullSong);
    game.engageChain();
    game.pause();
    updatePauseBtn();
    updateLoopUI();
    showSongInfoPopup(fullSong);
    if (song.id !== undefined) markSongPlayed(song.id).catch((e) => console.warn('Failed to mark song played:', e));
  };

  // --- MIDI input -----------------------------------------------------------
  await midiInput.start();
  menu.setMidiStatus(midiInput.connected, midiInput.connected ? 'MIDI device connected' : 'No MIDI device - use keyboard');
  midiInput.onConnectionChange = (connected, message) => menu.setMidiStatus(connected, message);

  // --- Top-level setup functions (no local-helper deps) ---------------------
  setupBackgroundPanel(game);
  setupSpeedControls(game);
  menu.onRename = setupRenamePopup(menu).onRename;
  setupMidiImport(menu, midiInput, trackSelect, categorySelect);
  setupHoverCursor(game, canvas, game.renderer);

  // --- Functions that depend on other setup functions ------------------------
  const { closeSheetView } = setupSheetView(game, canvas, { closeSongInfoPopup, setMode, updateLoopUI });
  setupResultButtons(game, { closeSongInfoPopup, closeSheetView, setMode, applyPracticeHandButtons, updateLoopUI, updatePauseBtn });
}

init();

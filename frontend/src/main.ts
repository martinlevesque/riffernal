import { Game } from './game/Game.js';
import { Synth } from './audio/Synth.js';
import { KeyboardInput } from './input/KeyboardInput.js';
import { MidiInput } from './input/MidiInput.js';
import { Menu } from './ui/freeplay/Menu.js';
import { ScoreDisplay } from './ui/play/ScoreDisplay.js';
import { TrackSelect } from './ui/freeplay/TrackSelect.js';
import { CategorySelect } from './ui/freeplay/CategorySelect.js';
import { BackgroundPanel } from './ui/play/BackgroundPanel.js';
import { SpeedControls } from './ui/play/SpeedControls.js';
import { RenameSongPopup } from './ui/freeplay/RenameSongPopup.js';
import { SongInfoPopup } from './ui/freeplay/SongInfoPopup.js';
import { MidiImportDialog } from './ui/freeplay/MidiImportDialog.js';
import { SheetView } from './ui/sheet/SheetView.js';
import { ResultButtons } from './ui/play/ResultButtons.js';
import { GameControls } from './ui/play/GameControls.js';
import { HomeScreen } from './ui/home/HomeScreen.js';
import { setupHoverCursor } from './ui/play/HoverCursor.js';
import { PracticeHand } from './utils/notes.js';
import type { Song } from './utils/MidiParser.js';
import {
  fetchSongs, fetchSong, songFullToSong, summaryToSong, markSongPlayed,
  recordBestScore, updateSongTitle, deleteSong,
  fetchCommunitySong, setSongPublicCommunity, toggleCommunityBookmark,
} from './api/SongApi.js';
import { fetchLoops } from './api/LoopApi.js';
import { themeManager } from './themes/ThemeManager.js';
import { AuthScreen } from './ui/auth/AuthScreen.js';
import { getStoredUser, logout } from './api/AuthApi.js';

export type AppMode = 'home' | 'freeplay' | 'settings';
let currentMode: AppMode = 'home';
let _homeScreen: HomeScreen | null = null;
let _appInitialized = false;

async function loadSongs(): Promise<Song[]> {
  try {
    const summaries = await fetchSongs();
    return summaries.map(summaryToSong);
  } catch (e) {
    console.warn('Failed to load songs from API:', e);
    return [];
  }
}

function showApp(): void {
  document.getElementById('auth-screen')!.classList.remove('active');
  document.getElementById('home-screen')!.classList.add('active');
}

/** Shared logout handler: clears auth, hides the home screen, and shows
 *  the auth screen for re-login. A successful re-login reloads the page so
 *  the app reboots with the new user's data (the in-memory Menu held the
 *  previous user's scores/loops). */
async function handleLogout(): Promise<void> {
  await logout();
  _homeScreen?.hide();
  const authScreen = new AuthScreen({
    onAuth: () => {
      authScreen.hide();
      window.location.reload();
    },
  });
  authScreen.show();
}

async function init(): Promise<void> {
  themeManager.init();

  const authScreen = new AuthScreen({
    onAuth: () => {
      authScreen.hide();
      showApp();
      initApp();
    },
  });

  if (getStoredUser()) {
    showApp();
    initApp();
  } else {
    authScreen.show();
  }
}

/** Initialize the app (HomeScreen, Game, Synth, etc.). Idempotent —
 *  subsequent calls just re-show the existing HomeScreen without
 *  duplicating event listeners or resource-heavy objects. */
async function initApp(): Promise<void> {
  if (_appInitialized) {
    _homeScreen?.show();
    return;
  }
  _appInitialized = true;

  _homeScreen = new HomeScreen({
    onNavigate: (mode: AppMode) => { currentMode = mode; },
    onLogout: handleLogout,
  });
  _homeScreen.show();

  const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
  const synth = new Synth();
  const keyboardInput = new KeyboardInput();
  const midiInput = new MidiInput();
  const game = new Game(canvas, synth, keyboardInput, midiInput);
  (window as unknown as Record<string, unknown>)._game = game;
  game.scoreDisplay = new ScoreDisplay();
  const trackSelect = new TrackSelect();

  const controls = new GameControls(game);

  const menu = new Menu([]);
  await menu.loadCategories();

  const songs = await loadSongs();
  menu.refreshSongs(songs);

  if (songs.length === 0) {
    (document.getElementById('btn-start') as HTMLButtonElement).disabled = true;
  }

  menu.loadCommunitySongs().catch((e) => console.error('Failed to load community songs:', e));

  game.onBackToMenu = () => {
    const freeplayScreen = document.getElementById('freeplay-screen')!;
    const homeScreenEl = document.getElementById('home-screen')!;

    if (currentMode === 'freeplay') {
      homeScreenEl.classList.remove('active');
      freeplayScreen.classList.add('active');
    } else {
      freeplayScreen.classList.remove('active');
      homeScreenEl.classList.add('active');
    }

    loadSongs()
      .then((songs) => menu.refreshSongs(songs))
      .catch((e) => console.error('Failed to refresh songs:', e));
  };

  const categorySelect = new CategorySelect();
  const songInfoPopup = new SongInfoPopup(game, () => controls.updatePauseBtn());

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

  menu.onStart = async (song) => {
    controls.setMode(false);
    controls.setPracticeHand(PracticeHand.Both);
    let fullSong = song;

    if (song.id !== undefined && song.notes.length === 0) {
      try { fullSong = songFullToSong(await fetchSong(song.id)); }
      catch (e) { console.warn('Failed to fetch full song:', e); }
    }

    if (fullSong.trackPreferences) {
      fullSong.backgroundTracks = fullSong.trackPreferences.backgroundTracks;
      game.mainTrackMuted = fullSong.trackPreferences.mainTrackMuted;
    } else if (game.mainTrackMuted) {
      game.mainTrackMuted = false;
    }

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

    if (hasEnabledLoops) controls.setMode(true);
    game.start(fullSong);
    game.engageChain();
    game.pause();
    controls.updatePauseBtn();
    controls.updateLoopUI();
    songInfoPopup.show(fullSong);

    if (song.id !== undefined) markSongPlayed(song.id).catch((e) => console.warn('Failed to mark song played:', e));
  };

  await midiInput.start();
  menu.setMidiStatus(midiInput.connected, midiInput.connected ? 'MIDI device connected' : 'No MIDI device - use keyboard');
  _homeScreen!.updateMidiStatus(midiInput.connected, midiInput.connected ? 'MIDI device connected' : 'Computer keyboard (no MIDI keyboard detected)');
  midiInput.onConnectionChange = (connected, message) => {
    menu.setMidiStatus(connected, message);
    _homeScreen?.updateMidiStatus(connected, connected ? message : 'Computer keyboard (no MIDI keyboard detected)');
  };

  // --- Component instantiation ----------------------------------------------
  new BackgroundPanel(game);
  new SpeedControls(game);

  const renamePopup = new RenameSongPopup({
    onSave: async (id, title, artist) => {
      const updated = await updateSongTitle(id, title, artist);
      menu.updateSong(songFullToSong(updated));
    },
  });
  menu.onRename = (song) => {
    if (song.id === undefined) return;
    renamePopup.show({ id: song.id, title: song.title, subtitle: song.artist || '' });
  };

  menu.onDelete = (song) => {
    if (song.id === undefined) return;
    const id = song.id;
    if (confirm(`Delete "${song.title}"? This cannot be undone.`)) {
      deleteSong(id).then(() => {
        menu.removeSong(id);
      }).catch((err) => {
        console.error("Failed to delete song:", err);
        alert("Failed to delete song.");
      });
    }
  };

  menu.onPublishCommunity = (song) => {
    if (song.id === undefined) return;
    const id = song.id;
    const newValue = !(song.publicCommunity === true);
    setSongPublicCommunity(id, newValue).then((updated) => {
      menu.updateSong(songFullToSong(updated));
    }).catch((err) => {
      console.error("Failed to update community visibility:", err);
      alert("Failed to update community visibility.");
    });
  };

  menu.onCommunityStart = async (song) => {
    controls.setMode(false);
    controls.setPracticeHand(PracticeHand.Both);
    let fullSong = song;

    if (song.id !== undefined && song.notes.length === 0) {
      try {
        fullSong = songFullToSong(await fetchCommunitySong(song.id));
      } catch (e) {
        console.warn("Failed to fetch community song:", e);
      }
    }

    if (fullSong.trackPreferences) {
      fullSong.backgroundTracks = fullSong.trackPreferences.backgroundTracks;
      game.mainTrackMuted = fullSong.trackPreferences.mainTrackMuted;
    } else if (game.mainTrackMuted) {
      game.mainTrackMuted = false;
    }

    let hasEnabledLoops = false;

    if (fullSong.id !== undefined) {
      try {
        const loops = await fetchLoops(fullSong.id);
        game.loadLoops(loops);
        hasEnabledLoops = loops.some((l) => l.enabled);
      } catch (e) {
        console.warn("Failed to fetch loops:", e);
      }
    }

    if (hasEnabledLoops) controls.setMode(true);
    game.start(fullSong);
    game.engageChain();
    game.pause();
    controls.updatePauseBtn();
    controls.updateLoopUI();
    songInfoPopup.show(fullSong);

    if (song.id !== undefined) markSongPlayed(song.id).catch((e) => console.warn("Failed to mark song played:", e));
  };

  menu.onBookmark = (song) => {
    if (song.id === undefined) return;
    const id = song.id;
    const newValue = !(song.communityBookmarked === true);
    toggleCommunityBookmark(id, newValue).then(() => {
      menu.updateBookmarkState(id, newValue);
    }).catch((err) => {
      console.error("Failed to toggle bookmark:", err);
    });
  };

  new MidiImportDialog(menu, midiInput, trackSelect, categorySelect);

  setupHoverCursor(game, canvas, game.renderer);

  const sheetView = new SheetView(game, canvas, {
    closeSongInfoPopup: () => songInfoPopup.hide(),
    setMode: (learning) => controls.setMode(learning),
    updateLoopUI: () => controls.updateLoopUI(),
  });

  new ResultButtons(game, {
    closeSongInfoPopup: () => songInfoPopup.hide(),
    closeSheetView: () => sheetView.closeSheetView(),
    setMode: (learning) => controls.setMode(learning),
    applyPracticeHandButtons: () => controls.applyPracticeHandButtons(),
    updateLoopUI: () => controls.updateLoopUI(),
    updatePauseBtn: () => controls.updatePauseBtn(),
  });
}

init();

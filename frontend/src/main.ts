import { Game } from './game/Game.js';
import { Synth } from './audio/Synth.js';
import { installUserGestureTracking } from './audio/userGesture.js';
import { KeyboardInput } from './input/KeyboardInput.js';
import { MidiInput } from './input/MidiInput.js';
import { Menu } from './ui/freeplay/Menu.js';
import { MenuShortcutsPopup } from './ui/freeplay/MenuShortcutsPopup.js';
import { ScoreDisplay } from './ui/play/ScoreDisplay.js';
import { TrackSelect } from './ui/freeplay/TrackSelect.js';
import { CategorySelect } from './ui/freeplay/CategorySelect.js';
import { BackgroundPanel } from './ui/play/BackgroundPanel.js';
import { SpeedControls } from './ui/play/SpeedControls.js';
import { RenameSongPopup } from './ui/freeplay/RenameSongPopup.js';
import { DifficultySelectPopup } from './ui/freeplay/DifficultySelectPopup.js';
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
  PlayMode,
  fetchSong, songFullToSong, markSongPlayed,
  recordBestScore, updateSongTitle, deleteSong,
  updateSongDifficulty, setSongGuestShowcase,
  fetchCommunitySong, setSongPublicCommunity, toggleCommunityBookmark,
  type SongFull,
} from './api/SongApi.js';
import { fetchLoops } from './api/LoopApi.js';
import { fetchGuestShowcaseSong } from './api/GuestApi.js';
import { loadGuestSongs, removeGuestSong } from './utils/guestStore.js';
import { themeManager } from './themes/ThemeManager.js';
import { AuthScreen } from './ui/auth/AuthScreen.js';
import { getStoredUser, logout, clearAuth, isGuestMode, setGuestMode } from './api/AuthApi.js';
import { deleteAccount } from './api/UserApi.js';

export type AppMode = 'home' | 'freeplay' | 'settings';
let currentMode: AppMode = 'home';
let _homeScreen: HomeScreen | null = null;
let _appInitialized = false;
let _guestMode = false;

function showApp(): void {
  document.getElementById('auth-screen')!.classList.remove('active');
  document.getElementById('home-screen')!.classList.add('active');
}

/** Show the freeplay screen without the (user-scoped) home screen. */
function showFreeplay(): void {
  document.getElementById('auth-screen')!.classList.remove('active');
  document.getElementById('home-screen')!.classList.remove('active');
  document.getElementById('freeplay-screen')!.classList.add('active');
}

/** Enter guest mode: no account, no server persistence. The local shelf
 *  (IndexedDB) and the public showcase/community listings carry the
 *  session. Kept in localStorage so a refresh re-enters guest mode. */
function enterGuestMode(): void {
  setGuestMode();
  _guestMode = true;
  showFreeplay();
  initApp();
}

/** Leave guest mode through the auth screen. A successful login/register
 *  clears the guest flag (setAuth), and the reload boots the app
 *  authenticated. */
function signInFromGuest(): void {
  const authScreen = new AuthScreen({
    onAuth: () => window.location.reload(),
  });
  authScreen.show();
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

/** Delete the logged-in account after a confirmation. The server session
 *  dies with the account, so local auth is cleared and the page reloaded —
 *  booting onto the auth screen also drops the in-memory Menu that holds
 *  this user's scores/loops. */
async function handleDeleteAccount(): Promise<void> {
  if (!confirm('Delete your account? This permanently destroys your account, your songs and all your progress — including other users\' bookmarks and loops copied from your songs. This cannot be undone.')) return;

  try {
    await deleteAccount();
    clearAuth();
    window.location.reload();
  } catch (err) {
    console.error('Failed to delete account:', err);
    alert(err instanceof Error && err.message ? `Failed to delete account: ${err.message}` : 'Failed to delete account.');
  }
}

async function init(): Promise<void> {
  themeManager.init();
  installUserGestureTracking();

  const authScreen = new AuthScreen({
    onAuth: () => {
      authScreen.hide();
      showApp();
      initApp();
    },
    onGuest: () => {
      authScreen.hide();
      enterGuestMode();
    },
  });

  if (getStoredUser()) {
    showApp();
    initApp();
  } else if (isGuestMode()) {
    // Returning guest after a refresh: the shelf lives in IndexedDB, so
    // boot straight back into the freeplay menu.
    enterGuestMode();
  } else {
    authScreen.show();
  }
}

/** Shared objects created once and passed to the setup functions. */
interface AppContext {
  canvas: HTMLCanvasElement;
  game: Game;
  controls: GameControls;
  menu: Menu;
  keyboardInput: KeyboardInput;
  songInfoPopup: SongInfoPopup;
  midiInput: MidiInput;
  trackSelect: TrackSelect;
  categorySelect: CategorySelect;
}

/** Instantiate the core engine and UI objects (Game, Synth, inputs, Menu,
 *  popups). Side-effect-heavy; called once. */
function createAppContext(): AppContext {
  const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
  const synth = new Synth();
  const keyboardInput = new KeyboardInput();
  const midiInput = new MidiInput();
  const game = new Game(canvas, synth, keyboardInput, midiInput);
  (window as unknown as Record<string, unknown>)._game = game;
  game.scoreDisplay = new ScoreDisplay();
  const trackSelect = new TrackSelect();
  const controls = new GameControls(game);
  const menu = new Menu();
  new MenuShortcutsPopup(menu);
  const categorySelect = new CategorySelect();
  const songInfoPopup = new SongInfoPopup(game, () => controls.updatePauseBtn());

  return { canvas, game, controls, menu, keyboardInput, songInfoPopup, midiInput, trackSelect, categorySelect };
}

/** Load the user's library (own + bookmarked songs grouped by category) and
 *  fire off the community browse listing (not awaited — it can populate
 *  whenever ready). Guests load the local shelf plus the public showcase
 *  and community listings instead. */
async function loadMenuData(ctx: AppContext): Promise<void> {
  const { menu } = ctx;

  if (_guestMode) {
    menu.loadGuestLibrary(await loadGuestSongs());
    menu.loadShowcaseSongs().catch((e) => console.error('Failed to load guest showcase:', e));
    menu.loadCommunitySongs().catch((e) => console.error('Failed to load community songs:', e));
    return;
  }

  await menu.loadLibrary();
  menu.loadCommunitySongs().catch((e) => console.error('Failed to load community songs:', e));
}

/** While browsing menus the game has not started, so piano key presses
 *  (MIDI or computer keyboard) belong to the song-list shortcuts.
 *  Game.start() takes the input callbacks over and Game clears them when
 *  leaving gameplay, so this must re-run on every return to the menu. */
function wireMenuNoteInput(ctx: AppContext): void {
  const { menu, midiInput, keyboardInput } = ctx;
  menu.resetNoteHold();
  midiInput.onNoteOn = (note) => menu.handleNoteOn(note);
  keyboardInput.onNoteOn = (note) => menu.handleNoteOn(note);
  midiInput.onNoteOff = (note) => menu.handleNoteOff(note);
  keyboardInput.onNoteOff = (note) => menu.handleNoteOff(note);
  keyboardInput.start();
}

/** Wire up the game's own lifecycle callbacks (back-to-menu navigation and
 *  end-of-game score recording). */
function setupGameCallbacks(ctx: AppContext): void {
  const { game, menu } = ctx;

  game.onBackToMenu = () => {
    const freeplayScreen = document.getElementById('freeplay-screen')!;
    const homeScreenEl = document.getElementById('home-screen')!;

    if (_guestMode) {
      homeScreenEl.classList.remove('active');
      freeplayScreen.classList.add('active');
    } else if (currentMode === 'freeplay') {
      homeScreenEl.classList.remove('active');
      freeplayScreen.classList.add('active');
    } else {
      freeplayScreen.classList.remove('active');
      homeScreenEl.classList.add('active');
      _homeScreen?.refreshLeaderboard();
    }

    wireMenuNoteInput(ctx);
    loadMenuData(ctx).catch((e) => console.error('Failed to refresh menu:', e));
  };

  game.onResultsShown = () => wireMenuNoteInput(ctx);

  game.onResults = (scoring, song) => {
    // Guests keep their run's on-screen score but nothing is persisted.
    if (!song.id || game.usedLearningMode || _guestMode) return;

    recordBestScore(song.id, scoring.score)
      .then(({ bestScore, lastScore }) => {
        song.bestScore = bestScore;
        song.lastScore = lastScore;
        menu.updateSongStats(song.id!, bestScore, lastScore);
      })
      .catch((e) => console.error('Failed to record best score:', e));
  };
}

/** Shared start-flow for both the user's own songs and community songs:
 *  fetch the full song if needed, apply track preferences, load loops, then
 *  start the game paused with the info popup open. `fetchFull` differs per
 *  caller (own-song vs community endpoint). */
async function startSong(
  ctx: AppContext,
  song: Song,
  fetchFull: (id: number) => Promise<SongFull>,
): Promise<void> {
  const { game, controls, songInfoPopup } = ctx;
  // Reset for the incoming song without persisting: the previous song is
  // still the game's current one until start() swaps it, so a persisted
  // save here would write the wrong mode into its stored preferences.
  controls.setMode(false, false);
  controls.setPracticeHand(PracticeHand.Both);
  let fullSong = song;

  if (song.id !== undefined && song.notes.length === 0) {
    try { fullSong = songFullToSong(await fetchFull(song.id)); }
    catch (e) { console.warn('Failed to fetch full song:', e); }
  }

  if (fullSong.trackPreferences) {
    fullSong.backgroundTracks = fullSong.trackPreferences.backgroundTracks;
    game.mainTrackMuted = fullSong.trackPreferences.mainTrackMuted;
  } else if (game.mainTrackMuted) {
    game.mainTrackMuted = false;
  }

  let hasEnabledLoops = false;

  // Guests have no server-side loops to load (loop saving needs an account).
  if (fullSong.id !== undefined && !_guestMode) {
    try {
      const loops = await fetchLoops(fullSong.id);
      game.loadLoops(loops);
      hasEnabledLoops = loops.some((l) => l.enabled);
    } catch (e) {
      console.warn('Failed to fetch loops:', e);
    }
  }

  // Enabled loops still force LEARN; otherwise resume the LEARN/PLAY mode
  // the user last played this song in (stored as trackPreferences.playMode).
  // PLAY is already active from the reset above, so only LEARN switches.
  // Neither is persisted — applying the starting mode is not a mode switch.
  if (hasEnabledLoops || fullSong.trackPreferences?.playMode === PlayMode.Learn) {
    controls.setMode(true, false);
  }

  game.start(fullSong);
  game.engageChain();
  game.pause();
  controls.updatePauseBtn();
  controls.updateLoopUI();
  songInfoPopup.show(fullSong);

  if (song.id !== undefined && !_guestMode) {
    markSongPlayed(song.id).catch((e) => console.warn('Failed to mark song played:', e));
  }
}

/** Wire up all Menu action callbacks: start, rename, delete, publish,
 *  community-start, bookmark, and back-to-home navigation. Guest mode
 *  swaps server-backed actions for local-shelf ones. */
function setupMenuCallbacks(ctx: AppContext): void {
  const { menu } = ctx;

  menu.onStart = (song) => startSong(ctx, song, fetchSong);
  menu.onBackToHome = () => _homeScreen?.show();
  menu.onShowcaseStart = (song) => startSong(ctx, song, fetchGuestShowcaseSong);
  menu.onSignIn = signInFromGuest;

  if (_guestMode) {
    // Guest shelf delete: remove from the local store and the menu.
    menu.onDelete = (song) => {
      if (song.id === undefined) return;

      removeGuestSong(song.id).then((removed) => {
        if (removed) menu.removeSong(song.id!);
      }).catch((err) => console.error('Failed to remove guest song:', err));
    };

    return;
  }

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

  const difficultyPopup = new DifficultySelectPopup({
    onSave: async (id, difficulty) => {
      const updated = await updateSongDifficulty(id, difficulty);
      menu.updateSong(songFullToSong(updated));
    },
  });
  menu.onSetDifficulty = (song) => {
    if (song.id === undefined) return;
    difficultyPopup.show({ id: song.id, difficulty: song.difficulty, ownerId: song.importedByUserId ?? null });
  };

  menu.onDelete = (song) => {
    if (song.id === undefined) return;
    const id = song.id;

    if (confirm(`Delete "${song.title}"? This cannot be undone.`)) {
      deleteSong(id).then(() => {
        menu.removeSong(id);
      }).catch((err) => {
        console.error('Failed to delete song:', err);
        alert('Failed to delete song.');
      });
    }
  };

  menu.onPublishCommunity = (song) => {
    if (song.id === undefined) return;
    const id = song.id;
    const newValue = !(song.publicCommunity === true);
    setSongPublicCommunity(id, newValue).then((updated) => {
      menu.updateSong(songFullToSong(updated));
      menu.refreshAfterPublishChange(!newValue);
    }).catch((err) => {
      console.error('Failed to update community visibility:', err);
      alert('Failed to update community visibility.');
    });
  };

  // Admin curation of the guest showcase (front window for visitors).
  menu.onToggleGuestShowcase = (song) => {
    if (song.id === undefined) return;
    const id = song.id;
    const newValue = !(song.guestShowcase === true);
    setSongGuestShowcase(id, newValue).then((updated) => {
      menu.updateSong(songFullToSong(updated));
    }).catch((err) => {
      console.error('Failed to update guest showcase:', err);
      alert('Failed to update guest showcase.');
    });
  };

  menu.onCommunityStart = (song) => startSong(ctx, song, fetchCommunitySong);

  menu.onBookmark = (song) => {
    if (song.id === undefined) return;
    const id = song.id;
    const newValue = !(song.communityBookmarked === true);
    toggleCommunityBookmark(id, newValue).then(() => {
      menu.updateBookmarkState(id, newValue);
    }).catch((err) => {
      console.error('Failed to toggle bookmark:', err);
    });
  };
}

/** Start MIDI input and wire connection-change updates to both the Menu
 *  and the HomeScreen status indicators. */
async function setupMidiStatus(ctx: AppContext): Promise<void> {
  const { menu, midiInput } = ctx;
  await midiInput.start();
  menu.setMidiStatus(midiInput.connected, midiInput.connected ? 'MIDI device connected' : 'No MIDI device - use keyboard');
  _homeScreen?.updateMidiStatus(midiInput.connected, midiInput.connected ? 'MIDI device connected' : 'Computer keyboard (no MIDI keyboard detected)');
  midiInput.onConnectionChange = (connected, message) => {
    menu.setMidiStatus(connected, message);
    _homeScreen?.updateMidiStatus(connected, connected ? message : 'Computer keyboard (no MIDI keyboard detected)');
  };
}

/** Instantiate the remaining side-effect UI components: background panel,
 *  speed controls, MIDI import dialog, hover cursor, sheet view, and result
 *  buttons. These attach themselves to the game/canvas on construction. */
function setupTrailingComponents(ctx: AppContext): void {
  const { game, canvas, menu, midiInput, trackSelect, categorySelect, songInfoPopup, controls } = ctx;

  new BackgroundPanel(game);
  new SpeedControls(game);
  new MidiImportDialog(menu, midiInput, trackSelect, categorySelect);
  setupHoverCursor(game, canvas, game.renderer);

  const sheetView = new SheetView(game, canvas, {
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

  // Keep the loop HUD status following the chain as it auto-advances.
  game.onLoopAdvanced = () => controls.updateLoopUI();
}

/** Guest-mode chrome: no home screen (user-scoped stats/leaderboard), no
 *  loop controls (loop persistence needs an account). A Sign in button is
 *  the way out of the session. */
function setupGuestUi(): void {
  document.querySelector('.brand-corner')?.classList.add('hidden');
  document.getElementById('btn-guest-signin')?.classList.remove('hidden');
  document.getElementById('btn-guest-signin')?.addEventListener('click', signInFromGuest);
  document.getElementById('loop-control')?.classList.add('hidden');
  document.getElementById('loops-panel')?.classList.add('hidden');
}

/** Initialize the app (HomeScreen, Game, Synth, etc.). Idempotent —
 *  subsequent calls just re-show the existing HomeScreen without
 *  duplicating event listeners or resource-heavy objects. */
async function initApp(): Promise<void> {
  if (_appInitialized) {
    if (_guestMode) showFreeplay();
    else _homeScreen?.show();
    return;
  }
  _appInitialized = true;

  if (_guestMode) {
    setupGuestUi();
  } else {
    _homeScreen = new HomeScreen({
      onNavigate: (mode: AppMode) => { currentMode = mode; },
      onLogout: handleLogout,
      onDeleteAccount: handleDeleteAccount,
    });
    _homeScreen.show();
  }

  const ctx = createAppContext();
  ctx.menu.setGuestMode(_guestMode);
  ctx.menu.setHomeActions((action) => _homeScreen?.cardAction(action));
  ctx.menu.setResultsActions((action) => ctx.game.runResultsAction(action));
  wireMenuNoteInput(ctx);
  await loadMenuData(ctx);
  setupGameCallbacks(ctx);
  setupMenuCallbacks(ctx);
  await setupMidiStatus(ctx);
  setupTrailingComponents(ctx);
}

init();

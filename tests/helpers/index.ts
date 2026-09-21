// Re-export everything so existing `from './helpers/index.js'` imports keep working.

export * from './constants.js';

export {
  SEED_MIDI,
  cleanupSongs,
  cleanupAllCategories,
  wipeDatabase,
  deleteSong,
  seedSong,
  seedSongWithNotes,
  cleanupCategoriesByLabel,
  authHeaders,
  authJsonHeaders,
  bearer,
  uniqueUsername,
  register,
  registerUser,
  login,
  logout,
  type AuthSession,
} from './api.js';

export {
  type NoteSpec,
  type SongData,
  makeSong,
} from './song.js';

export {
  type LeaderboardEntry,
  type SeededUser,
  seedUserWithScores,
  recordScore,
  fetchLeaderboard,
  expectWellFormedBoard,
} from './leaderboard.js';

export {
  type StartGameOptions,
  startGame,
  goToSongList,
} from './navigation.js';

export {
  expectPlayScreenActive,
  speedUp,
  waitForResults,
  clickRetry,
  clickRestart,
  clickPlay,
  closeSongInfoPopup,
  toggleLearnMode,
  togglePlayMode,
  expectMode,
  expectLoopStatus,
  expectPracticeHand,
  evaluateWithNoteManager,
  bootGame,
  bootNoteManager,
  gameState,
  type GameSnapshot,
  type TestLoop,
  buildFreezeResumeScript,
} from './page/game.js';

export {
  expectHomeScreenActive,
  expectHomeScreenInactive,
  expectAuthScreenActive,
  clickLogout,
  openSettings,
  themeOptions,
  themeOption,
  expectHomeMidiStatus,
  expectHomeMidiConnected,
  expectHomeMidiDisconnected,
  expectMenuScreenActive,
  clickFreeplay,
  clickBackToHome,
} from './page/home.js';

export {
  expectSheetScreenActive,
  expectSheetScreenInactive,
  openSheet,
  closeSheet,
} from './page/sheet.js';

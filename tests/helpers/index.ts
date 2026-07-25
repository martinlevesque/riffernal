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
} from './api.js';

export {
  type NoteSpec,
  type SongData,
  makeSong,
} from './song.js';

export {
  type StartGameOptions,
  startGame,
} from './navigation.js';

export {
  expectPlayScreenActive,
  speedUp,
  waitForResults,
  clickRetry,
  clickRestart,
  clickPlay,
  toggleLearnMode,
  togglePlayMode,
  expectMode,
  expectLoopStatus,
  expectPracticeHand,
  evaluateWithNoteManager,
  buildFreezeResumeScript,
} from './page/game.js';

export {
  expectMenuScreenActive,
  clickBackToMenu,
} from './page/home.js';

export {
  expectSheetScreenActive,
  expectSheetScreenInactive,
  openSheet,
  closeSheet,
} from './page/sheet.js';

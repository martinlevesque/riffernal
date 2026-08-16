export { DB_PATH, db } from "./connection.ts";
export { type CategoryRow, findAllCategories, findCategoryByName, insertCategoryRow } from "./category.ts";
export {
  type SongRow,
  type InsertSongInput,
  getAllSongs,
  getAllSongsForUser,
  getSongById,
  insertSong,
  updateSongCategory,
  updateSongTitle,
  deleteSong,
} from "./song.ts";
export {
  type UserSongRow,
  type ScoreStatsRow,
  findScoreStats,
  findTrackPreferencesJson,
  upsertBestScoreRaw,
  upsertTrackPreferencesJson,
  touchUserSongPlayed,
  findAllScoreStats,
} from "./userSong.ts";
export {
  type UserRow,
  getUserRow,
  getUserByUsername,
  createUser,
  setGameSettingsJson,
  userNeedsSetup,
  createSession,
  findSession,
  deleteSession,
} from "./user.ts";

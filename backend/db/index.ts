export { DB_PATH, db } from "./connection.ts";
export { type CategoryRow, findAllCategories, findCategoryByName, insertCategoryRow } from "./category.ts";
export {
  type SongRow,
  type InsertSongInput,
  getAllSongs,
  getSongById,
  insertSong,
  updateSongCategory,
  updateSongTitle,
  deleteSong,
  touchLastPlayed,
} from "./song.ts";
export {
  type UserSongRow,
  type ScoreStatsRow,
  findScoreStats,
  findTrackPreferencesJson,
  upsertBestScoreRaw,
  upsertTrackPreferencesJson,
  findAllScoreStats,
} from "./userSong.ts";
export { type UserRow, getUserRow, setGameSettingsJson } from "./user.ts";
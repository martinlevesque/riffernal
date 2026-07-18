export { DB_PATH, db } from "./connection.ts";
export { type CategoryRow, getAllCategories, createCategory } from "./category.ts";
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
  type TrackPreferences,
  getUserSongScoreStats,
  getUserSongTrackPreferences,
  upsertBestScore,
  upsertUserSongTrackPreferences,
  getAllScoreStats,
} from "./userSong.ts";
export { type ScoreStats, isBestScoreValid } from "../models/scoreStats.ts";
export { type UserRow, type GameSettings, getUser, getUserGameSettings, updateUserGameSettings } from "./user.ts";

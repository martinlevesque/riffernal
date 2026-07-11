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
  getUserSongBestScore,
  getUserSongLastScore,
  upsertBestScore,
  getAllBestScores,
  getAllLastScores,
} from "./userSong.ts";
export { type UserRow, type GameSettings, getUser, getUserGameSettings, updateUserGameSettings } from "./user.ts";

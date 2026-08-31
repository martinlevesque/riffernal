// Persistence layer (SQL only). When adding or changing a query here,
// check connection.ts for a matching index and add one if missing.
export { DB_PATH, db } from "./connection.ts";
export { type CategoryRow, findAllCategories, findCategoryByName, insertCategoryRow } from "./category.ts";
export {
  type SongRow,
  type InsertSongInput,
  type PublicCommunitySongRow,
  getAllSongs,
  getAllSongsForUser,
  getSongById,
  insertSong,
  updateSongCategory,
  updateSongTitle,
  deleteSong,
  countPublicCommunitySongs,
  getPublicCommunitySongs,
  updateSongPublicCommunity,
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
export { setCommunityBookmark, findCommunityBookmarks } from "./community.ts";
export {
  type DailyScoreRow,
  type LeaderboardScoreRow,
  addDailyScore,
  findTopDailyScores,
} from "./leaderboard.ts";
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

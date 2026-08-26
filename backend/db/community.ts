import { db } from './connection.ts';
import { inList } from './helpers/inList.ts';

export function setCommunityBookmark(userId: number, songId: number, value: number): void {
  db.query(
    `INSERT INTO user_songs (user_id, song_id, best_score, last_score, community_bookmarked)
     VALUES (?, ?, 0, NULL, ?)
     ON CONFLICT (user_id, song_id) DO UPDATE SET
       community_bookmarked = excluded.community_bookmarked,
       updated_at = datetime('now')`,
  ).run(userId, songId, value);
}

export function clearBookmarksForSong(songId: number): void {
  db.query("UPDATE user_songs SET community_bookmarked = 0 WHERE song_id = ?").run(songId);
}

/** Return a set of song_ids that the given user has community-bookmarked,
 *  from the provided list of song ids. Used to populate the
 *  communityBookmarked flag on community listing DTOs. */
export function findCommunityBookmarks(
  userId: number,
  songIds: number[],
): Set<number> {
  if (songIds.length === 0) return new Set();

  const rows = db
    .query(
      `SELECT song_id FROM user_songs
       WHERE user_id = ? AND community_bookmarked = 1 AND song_id IN (${inList(songIds)})`,
    )
    .all(userId, ...songIds) as Array<{ song_id: number }>;
  return new Set(rows.map((r) => r.song_id));
}

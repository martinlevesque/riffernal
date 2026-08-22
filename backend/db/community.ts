import { db } from './connection.ts';
import { inList } from './helpers/inList.ts';

/** Set the community_bookmarked flag for a user and song. Creates the
 *  user_songs row if missing (best_score defaults to 0). value is 0 or 1. */
export function setCommunityBookmark(userId: number, songId: number, value: number): void {
  db.query(
    `INSERT INTO user_songs (user_id, song_id, best_score, last_score, community_bookmarked)
     VALUES (?, ?, 0, NULL, ?)
     ON CONFLICT (user_id, song_id) DO UPDATE SET
       community_bookmarked = excluded.community_bookmarked,
       updated_at = datetime('now')`,
  ).run(userId, songId, value);
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

import { db } from "./connection.ts";

export interface SongRow {
  id: number;
  title: string;
  artist: string;
  bpm: number;
  difficulty: string;
  notes: string;
  midi_data: Uint8Array | null;
  category_id: number | null;
  tracks: string | null;
  selected_track_indices: string | null;
  track_hands: string | null;
  background_tracks: string | null;
  imported: number;
  imported_by_user_id: number | null;
  public_community: number;
  created_at: string;
}

export interface InsertSongInput {
  title: string;
  artist: string;
  bpm: number;
  difficulty: string;
  notes: string;
  midi_data: Uint8Array | null;
  category_id: number | null;
  tracks: string | null;
  selected_track_indices: string | null;
  track_hands: string | null;
  background_tracks: string | null;
  imported_by_user_id?: number | null;
}

export function getAllSongs(): SongRow[] {
  return db
    .query("SELECT * FROM songs ORDER BY created_at DESC")
    .all() as SongRow[];
}

/** Get songs owned by a specific user (imported_by_user_id = userId). */
export function getAllSongsForUser(userId: number): SongRow[] {
  return db
    .query("SELECT * FROM songs WHERE imported_by_user_id = ? ORDER BY created_at DESC")
    .all(userId) as SongRow[];
}

export function getSongById(id: number): SongRow | undefined {
  return db.query("SELECT * FROM songs WHERE id = ?").get(id) as SongRow | undefined;
}

export function insertSong(input: InsertSongInput): SongRow {
  db.run(
    `INSERT INTO songs
      (title, artist, bpm, difficulty, notes, midi_data, category_id,
       tracks, selected_track_indices, track_hands, background_tracks, imported,
       imported_by_user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    [
      input.title,
      input.artist,
      input.bpm,
      input.difficulty,
      input.notes,
      input.midi_data ?? null,
      input.category_id,
      input.tracks,
      input.selected_track_indices,
      input.track_hands,
      input.background_tracks,
      input.imported_by_user_id ?? null,
    ],
  );
  const id = (db.query("SELECT last_insert_rowid() AS id").get() as { id: number }).id;
  return getSongById(id)!;
}

export function updateSongCategory(id: number, categoryId: number | null): void {
  db.run("UPDATE songs SET category_id = ? WHERE id = ?", [categoryId ?? null, id]);
}

export function updateSongTitle(id: number, title: string, artist: string): void {
  db.run("UPDATE songs SET title = ?, artist = ? WHERE id = ?", [title, artist, id]);
}

export function deleteSong(id: number): void {
  db.run("DELETE FROM songs WHERE id = ?", [id]);
}

/** Count public community songs (for pagination totals), excluding songs
 *  the requesting user has bookmarked (those live in their own category
 *  groups instead of the community browse list). */
export function countPublicCommunitySongs(userId: number): number {
  const row = db
    .query(
      `SELECT COUNT(*) AS count FROM songs s
       WHERE s.public_community = 1
         AND NOT EXISTS (
           SELECT 1 FROM user_songs us
           WHERE us.user_id = ? AND us.song_id = s.id AND us.community_bookmarked = 1
         )`,
    )
    .get(userId) as { count: number };
  return row.count;
}

/** A public community song row with its bookmark popularity count and the
 *  username of the user who originally shared it to the community. */
export interface PublicCommunitySongRow extends SongRow {
  bookmark_count: number;
  imported_by_username?: string | null;
}

/** Get public community songs ordered by bookmark popularity (most
 *  bookmarked first), then by creation date. Paginated via limit/offset.
 *  Excludes songs the requesting user has bookmarked (those appear in the
 *  user's category groups instead). */
export function getPublicCommunitySongs(
  limit: number,
  offset: number,
  userId: number,
): PublicCommunitySongRow[] {
  return db
    .query(
      `SELECT s.*, COUNT(us.user_id) AS bookmark_count, u.username AS imported_by_username
       FROM songs s
       LEFT JOIN users u ON u.id = s.imported_by_user_id
       LEFT JOIN user_songs us ON us.song_id = s.id AND us.community_bookmarked = 1
       WHERE s.public_community = 1
         AND NOT EXISTS (
           SELECT 1 FROM user_songs us2
           WHERE us2.user_id = ? AND us2.song_id = s.id AND us2.community_bookmarked = 1
         )
       GROUP BY s.id
       ORDER BY bookmark_count DESC, s.created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .all(userId, limit, offset) as PublicCommunitySongRow[];
}

/** Get the public community songs the given user has bookmarked, ordered by
 *  the user's last-played time (most recent first, never-played last), then
 *  by song creation. These appear in the user's category groups in the
 *  freeplay menu rather than in the community browse list. */
export function getBookmarkedSongs(userId: number): SongRow[] {
  return db
    .query(
      `SELECT s.*
       FROM songs s
       JOIN user_songs us
         ON us.user_id = ? AND us.song_id = s.id AND us.community_bookmarked = 1
       WHERE s.public_community = 1
       ORDER BY us.last_played_at DESC, s.created_at DESC`,
    )
    .all(userId) as SongRow[];
}

/** Set the public_community flag on a song. */
export function updateSongPublicCommunity(id: number, value: number): void {
  db.run("UPDATE songs SET public_community = ? WHERE id = ?", [value, id]);
}

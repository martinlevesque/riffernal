import { db } from "./connection.ts";

export interface LoopRow {
  id: number;
  user_id: number;
  song_id: number;
  start_time: number;
  end_time: number;
  enabled: number;
  created_at: string;
}

export function findLoopsBySong(userId: number, songId: number): LoopRow[] {
  return db
    .query(
      `SELECT id, user_id, song_id, start_time, end_time, enabled, created_at
       FROM user_song_loops WHERE user_id = ? AND song_id = ?
       ORDER BY start_time ASC`,
    )
    .all(userId, songId) as LoopRow[];
}

/** Insert a new loop for a user and return the stored row. */
export function insertLoop(
  userId: number,
  songId: number,
  startTime: number,
  endTime: number,
  enabled: boolean,
): LoopRow {
  return db
    .query(
      `INSERT INTO user_song_loops (user_id, song_id, start_time, end_time, enabled)
       VALUES (?, ?, ?, ?, ?)
       RETURNING id, user_id, song_id, start_time, end_time, enabled, created_at`,
    )
    .get(userId, songId, startTime, endTime, enabled ? 1 : 0) as LoopRow;
}

/** Flip a loop's enabled flag. Returns the updated row, or undefined when
 *  no loop with that id exists for the user. */
export function updateLoopEnabled(userId: number, id: number, enabled: boolean): LoopRow | undefined {
  const result = db
    .query(
      `UPDATE user_song_loops SET enabled = ? WHERE id = ? AND user_id = ?
       RETURNING id, user_id, song_id, start_time, end_time, enabled, created_at`,
    )
    .get(enabled ? 1 : 0, id, userId) as LoopRow | undefined;
  return result;
}

/** Update a loop's end time. Returns the updated row, or undefined when
 *  no loop with that id exists for the user. */
export function updateLoopEndTime(userId: number, id: number, endTime: number): LoopRow | undefined {
  const result = db
    .query(
      `UPDATE user_song_loops SET end_time = ? WHERE id = ? AND user_id = ?
       RETURNING id, user_id, song_id, start_time, end_time, enabled, created_at`,
    )
    .get(endTime, id, userId) as LoopRow | undefined;
  return result;
}

/** Delete a loop owned by the user. Returns true when a row was removed. */
export function deleteLoop(userId: number, id: number): boolean {
  const result = db
    .query("DELETE FROM user_song_loops WHERE id = ? AND user_id = ?")
    .run(id, userId);
  return result.changes > 0;
}

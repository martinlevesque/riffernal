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

/** All loops for the default user (id=1) and a song, in time order. */
export function findLoopsBySong(songId: number): LoopRow[] {
  return db
    .query(
      `SELECT id, user_id, song_id, start_time, end_time, enabled, created_at
       FROM user_song_loops WHERE user_id = 1 AND song_id = ?
       ORDER BY start_time ASC`,
    )
    .all(songId) as LoopRow[];
}

/** Insert a new loop for the default user (id=1) and return the stored row. */
export function insertLoop(
  songId: number,
  startTime: number,
  endTime: number,
  enabled: boolean,
): LoopRow {
  return db
    .query(
      `INSERT INTO user_song_loops (user_id, song_id, start_time, end_time, enabled)
       VALUES (1, ?, ?, ?, ?)
       RETURNING id, user_id, song_id, start_time, end_time, enabled, created_at`,
    )
    .get(songId, startTime, endTime, enabled ? 1 : 0) as LoopRow;
}

/** Flip a loop's enabled flag. Returns the updated row, or undefined when
 *  no loop with that id exists for the default user. */
export function updateLoopEnabled(id: number, enabled: boolean): LoopRow | undefined {
  const result = db
    .query(
      `UPDATE user_song_loops SET enabled = ? WHERE id = ? AND user_id = 1
       RETURNING id, user_id, song_id, start_time, end_time, enabled, created_at`,
    )
    .get(enabled ? 1 : 0, id) as LoopRow | undefined;
  return result;
}

/** Update a loop's end time. Returns the updated row, or undefined when
 *  no loop with that id exists for the default user. */
export function updateLoopEndTime(id: number, endTime: number): LoopRow | undefined {
  const result = db
    .query(
      `UPDATE user_song_loops SET end_time = ? WHERE id = ? AND user_id = 1
       RETURNING id, user_id, song_id, start_time, end_time, enabled, created_at`,
    )
    .get(endTime, id) as LoopRow | undefined;
  return result;
}

/** Delete a loop owned by the default user. Returns true when a row was
 *  actually removed. */
export function deleteLoop(id: number): boolean {
  const result = db
    .query("DELETE FROM user_song_loops WHERE id = ? AND user_id = 1")
    .run(id);
  return result.changes > 0;
}
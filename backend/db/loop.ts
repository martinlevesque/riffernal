import type { SQLQueryBindings } from "bun:sqlite";
import { db } from "./connection.ts";

const LOOP_COLUMNS = "id, user_id, song_id, start_time, end_time, enabled, name, created_at";

export interface LoopRow {
  id: number;
  user_id: number;
  song_id: number;
  start_time: number;
  end_time: number;
  enabled: number;
  name: string | null;
  created_at: string;
}

export function findLoopsBySong(userId: number, songId: number): LoopRow[] {
  return db
    .query(
      `SELECT ${LOOP_COLUMNS}
       FROM user_song_loops WHERE user_id = ? AND song_id = ?
       ORDER BY start_time ASC, id ASC`,
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
  name: string | null = null,
): LoopRow {
  return db
    .query(
      `INSERT INTO user_song_loops (user_id, song_id, start_time, end_time, enabled, name)
       VALUES (?, ?, ?, ?, ?, ?)
       RETURNING ${LOOP_COLUMNS}`,
    )
    .get(userId, songId, startTime, endTime, enabled ? 1 : 0, name) as LoopRow;
}

/** Field updates for one loop, keyed by table column. */
export interface LoopFieldUpdate {
  enabled?: boolean;
  end_time?: number;
  name?: string | null;
}

/** Per-column encoders: only these columns accept an update, and each
 *  maps its domain value to its storage representation (the enabled flag
 *  persists as the 1/0 boolean column). */
const LOOP_FIELD_ENCODERS: Record<string, (value: unknown) => SQLQueryBindings> = {
  enabled: (value) => (value ? 1 : 0),
  end_time: (value) => value as number,
  name: (value) => value as string | null,
};

/** Update a loop from a map of column values in one statement. Keys are
 *  confined to `LOOP_FIELD_ENCODERS`; each present value is encoded
 *  first. Returns the updated row, or undefined when no loop with that
 *  id belongs to the user (or nothing was asked to change). */
export function updateLoopRow(
  userId: number,
  id: number,
  updates: LoopFieldUpdate,
): LoopRow | undefined {
  const assignments: string[] = [];
  const params: SQLQueryBindings[] = [];

  for (const column of Object.keys(LOOP_FIELD_ENCODERS)) {
    const value = updates[column as keyof LoopFieldUpdate];
    if (value === undefined) continue;
    assignments.push(`${column} = ?`);
    params.push(LOOP_FIELD_ENCODERS[column](value));
  }

  if (assignments.length === 0) return undefined;

  return db
    .query(
      `UPDATE user_song_loops SET ${assignments.join(", ")} WHERE id = ? AND user_id = ?
       RETURNING ${LOOP_COLUMNS}`,
    )
    .get(...params, id, userId) as LoopRow | undefined;
}

/** Delete a loop owned by the user. Returns true when a row was removed. */
export function deleteLoop(userId: number, id: number): boolean {
  const result = db
    .query("DELETE FROM user_song_loops WHERE id = ? AND user_id = ?")
    .run(id, userId);
  return result.changes > 0;
}

/** Copy all loops from one user to another for a given song.
 *  Skips loops that already exist (same user, song, start_time, end_time).
 *  Returns the number of loops copied. */
export function copyLoopsToUser(fromUserId: number, toUserId: number, songId: number): number {
  const result = db
    .query(
      `INSERT INTO user_song_loops (user_id, song_id, start_time, end_time, enabled, name)
       SELECT ?, song_id, start_time, end_time, enabled, name
       FROM user_song_loops
       WHERE user_id = ? AND song_id = ?
       AND NOT EXISTS (
         SELECT 1 FROM user_song_loops AS existing
         WHERE existing.user_id = ? AND existing.song_id = user_song_loops.song_id
           AND existing.start_time = user_song_loops.start_time
           AND existing.end_time = user_song_loops.end_time
       )`,
    )
    .run(toUserId, fromUserId, songId, toUserId);
  return result.changes;
}

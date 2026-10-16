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

export interface LoopFieldUpdate {
  enabled?: boolean;
  end_time?: number;
  name?: string | null;
}

const LOOP_FIELD_ENCODERS: Record<string, (value: unknown) => SQLQueryBindings> = {
  enabled: (value) => (value ? 1 : 0),
  end_time: (value) => value as number,
  name: (value) => value as string | null,
};

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

export function deleteLoop(userId: number, id: number): boolean {
  const result = db
    .query("DELETE FROM user_song_loops WHERE id = ? AND user_id = ?")
    .run(id, userId);
  return result.changes > 0;
}

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

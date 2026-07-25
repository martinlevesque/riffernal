import {
  findLoopsBySong,
  insertLoop,
  updateLoopEnabled as updateLoopEnabledRow,
  deleteLoop as deleteLoopRow,
  type LoopRow,
} from "../db/loop.ts";

/** Domain DTO for one saved loop. `enabled` controls whether the loop
 *  participates in chained playback. */
export interface Loop {
  id: number;
  startTime: number;
  endTime: number;
  enabled: boolean;
}

/** Convert a raw snake_case `LoopRow` (with `enabled` as 0/1) into the
 *  camelCase `Loop` DTO exposed by the API. */
function rowToLoop(row: LoopRow): Loop {
  return {
    id: row.id,
    startTime: row.start_time,
    endTime: row.end_time,
    enabled: row.enabled !== 0,
  };
}

/** All saved loops for a song (default user, id=1), in time order. */
export function listLoops(songId: number): Loop[] {
  return findLoopsBySong(songId).map(rowToLoop);
}

/** Persist a new loop. Validates that `startTime < endTime` and both are
 *  non-negative finite numbers; throws on invalid input. */
export function createLoop(
  songId: number,
  startTime: number,
  endTime: number,
  enabled: boolean,
): Loop {
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)
    || startTime < 0 || endTime < 0 || startTime >= endTime) {
    throw new Error("Invalid loop boundaries");
  }
  const row = insertLoop(songId, startTime, endTime, enabled);
  return rowToLoop(row);
}

/** Toggle a loop's enabled flag. Returns the updated DTO, or null when no
 *  loop with that id exists for the default user. */
export function setLoopEnabled(id: number, enabled: boolean): Loop | null {
  const row = updateLoopEnabledRow(id, enabled);
  return row ? rowToLoop(row) : null;
}

/** Remove a loop. Returns true when a row was deleted. */
export function removeLoop(id: number): boolean {
  return deleteLoopRow(id);
}
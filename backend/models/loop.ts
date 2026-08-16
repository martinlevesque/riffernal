import {
  findLoopsBySong,
  insertLoop,
  updateLoopEnabled as updateLoopEnabledRow,
  updateLoopEndTime as updateLoopEndTimeRow,
  deleteLoop as deleteLoopRow,
  type LoopRow,
} from "../db/loop.ts";
import { ValidationError } from "./validation.ts";

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

/** All saved loops for a user and song, in time order. */
export function listLoops(userId: number, songId: number): Loop[] {
  return findLoopsBySong(userId, songId).map(rowToLoop);
}

/** Validate that both boundaries are finite, non-negative numbers with
 *  `startTime < endTime`. Throws on invalid input. */
function validateLoopBoundaries(startTime: unknown, endTime: unknown): void {
  if (typeof startTime !== "number" || typeof endTime !== "number"
    || !Number.isFinite(startTime) || !Number.isFinite(endTime)
    || startTime < 0 || endTime < 0 || startTime >= endTime) {
    throw new ValidationError("Invalid loop boundaries");
  }
}

/** Persist a new loop. Validates boundaries; throws on invalid input. */
export function createLoop(
  userId: number,
  songId: number,
  startTime: unknown,
  endTime: unknown,
  enabled: boolean,
): Loop {
  validateLoopBoundaries(startTime, endTime);
  const row = insertLoop(userId, songId, startTime as number, endTime as number, enabled);
  return rowToLoop(row);
}

/** Validate that `enabled` is a boolean. Throws on invalid input. */
function validateEnabled(enabled: unknown): asserts enabled is boolean {
  if (typeof enabled !== "boolean") {
    throw new ValidationError("Invalid enabled flag");
  }
}

/** Toggle a loop's enabled flag. Returns the updated DTO, or null when no
 *  loop with that id exists for the user. Throws when `enabled` is not a
 *  boolean. */
export function setLoopEnabled(userId: number, id: number, enabled: unknown): Loop | null {
  validateEnabled(enabled);
  const row = updateLoopEnabledRow(userId, id, enabled);
  return row ? rowToLoop(row) : null;
}

/** Validate that `endTime` is a finite, non-negative number. Throws on
 *  invalid input. */
function validateEndTime(endTime: unknown): asserts endTime is number {
  if (typeof endTime !== "number" || !Number.isFinite(endTime) || endTime < 0) {
    throw new ValidationError("Invalid end time");
  }
}

/** Update a loop's end time. Validates that the new end is finite and
 *  non-negative. Returns the updated DTO, or null when the loop doesn't
 *  exist. */
export function setLoopEndTime(userId: number, id: number, endTime: unknown): Loop | null {
  validateEndTime(endTime);
  const row = updateLoopEndTimeRow(userId, id, endTime);
  return row ? rowToLoop(row) : null;
}

/** Remove a loop. Returns true when a row was deleted. */
export function removeLoop(userId: number, id: number): boolean {
  return deleteLoopRow(userId, id);
}
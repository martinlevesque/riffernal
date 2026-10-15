import {
  findLoopsBySong,
  insertLoop,
  updateLoopRow as updateLoopRowDb,
  deleteLoop as deleteLoopRow,
  type LoopRow,
} from "../db/loop.ts";
import { ValidationError } from "./validation.ts";

/** Domain DTO for one saved loop. `enabled` controls whether the loop
 *  participates in chained playback; `name` is the user-facing label
 *  (null when unnamed). */
export interface Loop {
  id: number;
  startTime: number;
  endTime: number;
  enabled: boolean;
  name: string | null;
}

/** Max characters accepted for a loop name; matches the other UI text
 *  inputs (category names) so one DB column keeps its bound. */
const LOOP_NAME_MAX_LENGTH = 64;

/** Convert a raw snake_case `LoopRow` (with `enabled` as 0/1) into the
 *  camelCase `Loop` DTO exposed by the API. */
function rowToLoop(row: LoopRow): Loop {
  return {
    id: row.id,
    startTime: row.start_time,
    endTime: row.end_time,
    enabled: row.enabled !== 0,
    name: row.name,
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

/** Normalize a loop name: strings are trimmed and capped at the max
 *  length, empty results (and anything non-string) become null. */
function validateLoopName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const trimmed = name.trim().slice(0, LOOP_NAME_MAX_LENGTH);
  return trimmed || null;
}

/** Validate that `enabled` is a boolean. Throws on invalid input. */
function validateEnabled(enabled: unknown): asserts enabled is boolean {
  if (typeof enabled !== "boolean") {
    throw new ValidationError("Invalid enabled flag");
  }
}

/** Validate that `endTime` is a finite, non-negative number. Throws on
 *  invalid input. */
function validateEndTime(endTime: unknown): asserts endTime is number {
  if (typeof endTime !== "number" || !Number.isFinite(endTime) || endTime < 0) {
    throw new ValidationError("Invalid end time");
  }
}

/** Updatable loop fields. `id` and `startTime` are excluded — they
 *  identify the row and order the chain, so they are never patched. */
export interface LoopUpdates {
  enabled?: boolean;
  endTime?: number;
  name?: string | null;
}

/** Validate every present field of an updates object before anything is
 *  persisted, so a multi-field patch cannot half-apply. Throws on invalid
 *  input. */
function validateLoopUpdates(updates: LoopUpdates): void {
  if (updates.enabled !== undefined) validateEnabled(updates.enabled);
  if (updates.endTime !== undefined) validateEndTime(updates.endTime);
  // name is normalized (see validateLoopName), never rejected
}

/** Update a loop in place from a whitelist of fields: `enabled` toggles
 *  chained playback, `endTime` moves the loop's end, `name` renames it
 *  (normalized, null clears). All present fields are validated before
 *  any one of them is persisted, and the whole set lands in one UPDATE.
 *  Returns the updated DTO, or null when the loop doesn't exist for the
 *  user. Throws on invalid input. */
export function setLoopProperties(userId: number, id: number, updates: LoopUpdates): Loop | null {
  validateLoopUpdates(updates);

  const hasUpdates = Object.keys(updates).length > 0;
  const row = updateLoopRowDb(userId, id, {
    ...(updates.enabled !== undefined && { enabled: updates.enabled }),
    ...(updates.endTime !== undefined && { end_time: updates.endTime }),
    ...(updates.name !== undefined && { name: validateLoopName(updates.name) }),
  });

  if (!row) {
    if (hasUpdates) return null;
    throw new ValidationError("No updatable fields");
  }
  return rowToLoop(row);
}

/** Remove a loop. Returns true when a row was deleted. */
export function removeLoop(userId: number, id: number): boolean {
  return deleteLoopRow(userId, id);
}

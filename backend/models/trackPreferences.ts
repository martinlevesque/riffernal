import { findTrackPreferencesJson, upsertTrackPreferencesJson } from "../db/userSong.ts";
import { ValidationError } from "./validation.ts";

/** Per-user-per-song in-game Tracks panel preferences.
 *  `backgroundTracks` is the user's chosen enabled set (overrides the
 *  song-level default stored on the `songs` table). `mainTrackMuted` mutes
 *  the sound the web app plays on live key presses. */
export interface TrackPreferences {
  backgroundTracks: number[];
  mainTrackMuted: boolean;
}

const EMPTY_PREFS: TrackPreferences = { backgroundTracks: [], mainTrackMuted: false };

/** Validate that `backgroundTracks` is an array of numbers. Throws on
 *  invalid input. */
function validateBackgroundTracks(backgroundTracks: unknown): asserts backgroundTracks is number[] {
  if (!Array.isArray(backgroundTracks) || backgroundTracks.some((n) => typeof n !== "number")) {
    throw new ValidationError("Invalid backgroundTracks");
  }
}

/** Validate that `mainTrackMuted` is a boolean. Throws on invalid input. */
function validateMainTrackMuted(mainTrackMuted: unknown): asserts mainTrackMuted is boolean {
  if (typeof mainTrackMuted !== "boolean") {
    throw new ValidationError("Invalid mainTrackMuted");
  }
}

/** Validate raw input as a TrackPreferences DTO. Throws on invalid input
 *  (non-array backgroundTracks, non-number entries, or non-boolean
 *  mainTrackMuted). */
export function validateTrackPreferences(input: {
  backgroundTracks?: unknown;
  mainTrackMuted?: unknown;
}): TrackPreferences {
  validateBackgroundTracks(input.backgroundTracks);
  validateMainTrackMuted(input.mainTrackMuted);
  return { backgroundTracks: input.backgroundTracks, mainTrackMuted: input.mainTrackMuted };
}

/** Read the saved track preferences for a user and song. Returns null when
 *  no row exists or no prefs are stored yet. Corrupt JSON degrades to null. */
export function getTrackPreferences(userId: number, songId: number): TrackPreferences | null {
  const raw = findTrackPreferencesJson(userId, songId);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<TrackPreferences>;
    return {
      backgroundTracks: Array.isArray(parsed.backgroundTracks) ? parsed.backgroundTracks : [],
      mainTrackMuted: parsed.mainTrackMuted === true,
    };
  } catch {
    return null;
  }
}

/** Persist the user's track preferences for a song. Validates `prefs`
 *  first (throws on invalid input); creates the user_songs row if missing
 *  (best_score defaults to 0). Returns the prefs back to the caller for
 *  convenience — they're guaranteed to match what was stored. */
export function saveTrackPreferences(
  userId: number,
  songId: number,
  prefs: { backgroundTracks?: unknown; mainTrackMuted?: unknown },
): TrackPreferences {
  const valid = validateTrackPreferences(prefs);
  upsertTrackPreferencesJson(userId, songId, JSON.stringify(valid));
  return { ...EMPTY_PREFS, ...valid };
}
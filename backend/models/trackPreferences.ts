import { findTrackPreferencesJson, upsertTrackPreferencesJson } from "../db/userSong.ts";
import { ValidationError } from "./validation.ts";

/** Per-user-per-song in-game preferences: the Tracks panel choices plus the
 *  LEARN/PLAY mode to resume the song in. `backgroundTracks` is the user's
 *  chosen enabled set (overrides the song-level default stored on the
 *  `songs` table). `mainTrackMuted` mutes the sound the web app plays on
 *  live key presses. `playMode` is the mode the song should resume in —
 *  the one the user last played it in. */
export enum PlayMode {
  Play = "play",
  Learn = "learn",
}

export interface TrackPreferences {
  backgroundTracks: number[];
  mainTrackMuted: boolean;
  playMode: PlayMode;
}

const EMPTY_PREFS: TrackPreferences = { backgroundTracks: [], mainTrackMuted: false, playMode: PlayMode.Play };

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

/** Validate that `playMode` is one of the PlayMode values. Throws on
 *  invalid input. */
function validatePlayMode(playMode: unknown): asserts playMode is PlayMode {
  if (playMode !== PlayMode.Play && playMode !== PlayMode.Learn) {
    throw new ValidationError("Invalid playMode");
  }
}

/** Validate raw input as a TrackPreferences DTO. Throws on invalid input
 *  (non-array backgroundTracks, non-number entries, non-boolean
 *  mainTrackMuted, or a playMode outside the PlayMode union). */
export function validateTrackPreferences(input: {
  backgroundTracks?: unknown;
  mainTrackMuted?: unknown;
  playMode?: unknown;
}): TrackPreferences {
  validateBackgroundTracks(input.backgroundTracks);
  validateMainTrackMuted(input.mainTrackMuted);
  validatePlayMode(input.playMode);
  return {
    backgroundTracks: input.backgroundTracks,
    mainTrackMuted: input.mainTrackMuted,
    playMode: input.playMode,
  };
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
      playMode: parsed.playMode === PlayMode.Learn ? PlayMode.Learn : PlayMode.Play,
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
  prefs: { backgroundTracks?: unknown; mainTrackMuted?: unknown; playMode?: unknown },
): TrackPreferences {
  const valid = validateTrackPreferences(prefs);
  upsertTrackPreferencesJson(userId, songId, JSON.stringify(valid));
  return { ...EMPTY_PREFS, ...valid };
}
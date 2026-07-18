import { findTrackPreferencesJson, upsertTrackPreferencesJson } from "../db/userSong.ts";

/** Per-user-per-song in-game Tracks panel preferences.
 *  `backgroundTracks` is the user's chosen enabled set (overrides the
 *  song-level default stored on the `songs` table). `mainTrackMuted` mutes
 *  the sound the web app plays on live key presses. */
export interface TrackPreferences {
  backgroundTracks: number[];
  mainTrackMuted: boolean;
}

const EMPTY_PREFS: TrackPreferences = { backgroundTracks: [], mainTrackMuted: false };

/** Read the saved track preferences for the default user (id=1) and a song.
 *  Returns null when no row exists or no prefs are stored yet. Corrupt JSON
 *  degrades to null (the caller can treat that as "use the song default"). */
export function getTrackPreferences(songId: number): TrackPreferences | null {
  const raw = findTrackPreferencesJson(songId);
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

/** Persist the user's track preferences for a song. Creates the user_songs
 *  row if missing (best_score defaults to 0). Returns the prefs back to the
 *  caller for convenience — they're guaranteed to match what was stored. */
export function saveTrackPreferences(songId: number, prefs: TrackPreferences): TrackPreferences {
  upsertTrackPreferencesJson(songId, JSON.stringify(prefs));
  return { ...EMPTY_PREFS, ...prefs };
}
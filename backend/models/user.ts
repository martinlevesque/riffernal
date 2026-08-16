import { getUserRow, setGameSettingsJson, type UserRow } from "../db/user.ts";

export interface CurrentUser {
  id: number;
}

export interface GameSettings {
  piano_show_used_keys_only?: boolean;
  octave_agnostic?: boolean;
}

/** Parse the user's persisted game settings JSON. Corrupt or missing JSON
 *  degrades to an empty object — never throws. */
export function parseGameSettings(row: UserRow): GameSettings {
  try {
    return JSON.parse(row.game_settings) as GameSettings;
  } catch {
    return {};
  }
}

/** Read a user's game settings. */
export function getGameSettings(userId: number): GameSettings {
  const row = getUserRow(userId);

  if (!row) return {};
  return parseGameSettings(row);
}

/** Merge the given partial settings into the persisted settings and return
 *  the resulting full settings. The merge is shallow. */
export function updateGameSettings(userId: number, patch: Partial<GameSettings>): GameSettings {
  const current = getGameSettings(userId);
  const merged = { ...current, ...patch };
  setGameSettingsJson(userId, JSON.stringify(merged));
  return merged;
}

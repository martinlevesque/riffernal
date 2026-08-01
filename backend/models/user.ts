import { getUserRow, setGameSettingsJson, type UserRow } from "../db/user.ts";

export interface CurrentUser {
  id: number;
}

export function currentUser(): CurrentUser {
  return { id: 1 };
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

/** Read the default user's (id=1) game settings. */
export function getGameSettings(): GameSettings {
  return parseGameSettings(getUserRow());
}

/** Merge the given partial settings into the persisted settings and return
 *  the resulting full settings. The merge is shallow. */
export function updateGameSettings(patch: Partial<GameSettings>): GameSettings {
  const current = getGameSettings();
  const merged = { ...current, ...patch };
  setGameSettingsJson(JSON.stringify(merged));
  return merged;
}
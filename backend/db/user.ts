import { db } from "./connection.ts";

export interface GameSettings {
  piano_show_used_keys_only?: boolean;
}

export interface UserRow {
  id: number;
  game_settings: string;
}

export function getUser(): UserRow {
  return db.query("SELECT * FROM users WHERE id = 1").get() as UserRow;
}

export function getUserGameSettings(): GameSettings {
  const row = getUser();
  try {
    return JSON.parse(row.game_settings) as GameSettings;
  } catch {
    return {};
  }
}

export function updateUserGameSettings(settings: Partial<GameSettings>): void {
  const current = getUserGameSettings();
  const merged = { ...current, ...settings };
  db.run("UPDATE users SET game_settings = ? WHERE id = 1", [JSON.stringify(merged)]);
}

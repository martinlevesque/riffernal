import { db } from "./connection.ts";

export interface UserRow {
  id: number;
  game_settings: string;
}

export function getUserRow(): UserRow {
  return db.query("SELECT * FROM users WHERE id = 1").get() as UserRow;
}

export function setGameSettingsJson(json: string): void {
  db.run("UPDATE users SET game_settings = ? WHERE id = 1", [json]);
}
import { db } from "./connection.ts";

export interface UserRow {
  id: number;
  username: string;
  tagline: string;
  password_hash: string;
  game_settings: string;
}

export function getUserRow(id: number): UserRow | undefined {
  return db.query("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
}

export function getUserByUsername(username: string): UserRow | null {
  return db.query("SELECT * FROM users WHERE username = ?").get(username) as UserRow | null;
}

export function createUser(username: string, tagline: string, passwordHash: string): UserRow {
  const info = db.run(
    "INSERT INTO users (username, tagline, password_hash) VALUES (?, ?, ?)",
    [username, tagline, passwordHash],
  );
  const row = getUserRow(info.lastInsertRowid as number);
  if (!row) throw new Error("Failed to create user");
  return row;
}

export function setGameSettingsJson(userId: number, json: string): void {
  db.run("UPDATE users SET game_settings = ? WHERE id = ?", [json, userId]);
}

export function userNeedsSetup(): boolean {
  const row = db.query("SELECT COUNT(*) as cnt FROM users WHERE password_hash != ''").get() as { cnt: number } | undefined;
  return !row || row.cnt === 0;
}

export function deleteSessionsForUser(userId: number): void {
  db.run("DELETE FROM sessions WHERE user_id = ?", [userId]);
}

export function createSession(token: string, userId: number): void {
  deleteSessionsForUser(userId);
  db.run("INSERT INTO sessions (token, user_id) VALUES (?, ?)", [token, userId]);
}

export function findSession(token: string): { user_id: number } | null {
  return db.query("SELECT user_id FROM sessions WHERE token = ?").get(token) as { user_id: number } | null;
}

export function deleteSession(token: string): void {
  db.run("DELETE FROM sessions WHERE token = ?", [token]);
}

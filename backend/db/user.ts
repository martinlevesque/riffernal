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

/** Basic admin check: the setup admin is the first account ever created
 *  (no role column). Empty user table → nobody is admin. */
export function isAdminUser(userId: number): boolean {
  const row = db.query("SELECT MIN(id) AS admin_id FROM users").get() as
    | { admin_id: number | null }
    | undefined;
  return row?.admin_id != null && userId === row.admin_id;
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

/** Delete a user row and every row that references it. The user's songs must
 *  go first: `songs.imported_by_user_id` is the only user FK without ON
 *  DELETE CASCADE (SQLite cannot alter FK actions without a table rebuild),
 *  and deleting a song already cascades every user's `user_songs` and
 *  `user_song_loops` rows — the same semantics as the per-song delete. The
 *  users delete then cascades sessions, the remaining per-user stats/loops
 *  rows and daily scores. */
export function deleteUserCascade(userId: number): void {
  const remove = db.transaction(() => {
    db.run("DELETE FROM songs WHERE imported_by_user_id = ?", [userId]);
    db.run("DELETE FROM users WHERE id = ?", [userId]);
  });

  remove();
}

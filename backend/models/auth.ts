import {
  getUserRow,
  getUserByUsername,
  createUser,
  userNeedsSetup,
  isAdminUser as dbIsAdminUser,
  createSession,
  findSession,
  deleteSession,
} from "../db/user.ts";
import { ValidationError, UnauthorizedError, ConflictError } from "./validation.ts";

export interface AuthUser {
  id: number;
  username: string;
  tagline: string;
}

/** The setup admin is the first account created (no role column); wrapped
 *  here so controllers ask the model layer, not the db. */
export function isAdminUser(userId: number): boolean {
  return dbIsAdminUser(userId);
}

export function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return Bun.password.verify(password, hash);
}

export function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);

  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function needsSetup(): boolean {
  return userNeedsSetup();
}

/** Validate the username format (length, allowed characters), returning the
 *  trimmed value. Throws a `ValidationError` on invalid input. */
function validateUsername(username: string): string {
  const trimmed = username.trim();

  if (trimmed.length < 2 || trimmed.length > 32) {
    throw new ValidationError("Username must be 2-32 characters");
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    throw new ValidationError("Username can only contain letters, numbers, _ or -");
  }

  return trimmed;
}

/** Validate password length. Throws a `ValidationError` on invalid input. */
function validatePassword(password: string): void {
  if (password.length < 4) {
    throw new ValidationError("Password must be at least 4 characters");
  }
}

export async function setupAdmin(
  username: string,
  tagline: string,
  password: string,
): Promise<{ user: AuthUser; token: string }> {
  if (!userNeedsSetup()) {
    throw new ConflictError("Already set up");
  }

  const trimmed = validateUsername(username);
  validatePassword(password);

  const hash = await hashPassword(password);
  const user = createUser(trimmed, tagline.trim(), hash);
  const token = generateToken();
  createSession(token, user.id);
  return { user: { id: user.id, username: user.username, tagline: user.tagline }, token };
}

export async function register(
  username: string,
  tagline: string,
  password: string,
): Promise<{ user: AuthUser; token: string }> {
  const trimmed = validateUsername(username);
  validatePassword(password);

  if (getUserByUsername(trimmed)) {
    throw new ConflictError("Username already taken");
  }

  const hash = await hashPassword(password);
  const user = createUser(trimmed, tagline.trim(), hash);
  const token = generateToken();
  createSession(token, user.id);
  return { user: { id: user.id, username: user.username, tagline: user.tagline }, token };
}

export async function login(
  username: string,
  password: string,
): Promise<{ user: AuthUser; token: string }> {
  const row = getUserByUsername(username.trim());
  if (!row) {
    throw new UnauthorizedError("Invalid username or password");
  }
  const ok = await verifyPassword(password, row.password_hash);
  if (!ok) {
    throw new UnauthorizedError("Invalid username or password");
  }
  const token = generateToken();
  createSession(token, row.id);
  return {
    user: { id: row.id, username: row.username, tagline: row.tagline },
    token,
  };
}

export function logout(token: string): void {
  deleteSession(token);
}

export function validateSession(token: string): AuthUser | null {
  const session = findSession(token);
  if (!session) return null;
  const user = getUserRow(session.user_id);
  if (!user) return null;
  return { id: user.id, username: user.username, tagline: user.tagline };
}

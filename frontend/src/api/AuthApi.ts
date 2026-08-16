import { parseError } from "./helpers.js";

const TOKEN_KEY = "riffernal_token";
const USER_KEY = "riffernal_user";

export interface AuthUser {
  id: number;
  username: string;
  tagline: string;
}

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function setAuth(token: string, user: AuthUser): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function checkSetup(): Promise<{ needed: boolean }> {
  const res = await fetch("/api/auth/setup");
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<{ needed: boolean }>;
}

export async function setupAdmin(
  username: string,
  tagline: string,
  password: string,
): Promise<{ user: AuthUser; token: string }> {
  const res = await fetch("/api/auth/setup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, tagline, password }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { user: AuthUser; token: string };
  setAuth(data.token, data.user);
  return data;
}

export async function register(
  username: string,
  tagline: string,
  password: string,
): Promise<{ user: AuthUser; token: string }> {
  const res = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, tagline, password }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { user: AuthUser; token: string };
  setAuth(data.token, data.user);
  return data;
}

export async function login(
  username: string,
  password: string,
): Promise<{ user: AuthUser; token: string }> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { user: AuthUser; token: string };
  setAuth(data.token, data.user);
  return data;
}

export async function logout(): Promise<void> {
  const token = getAuthToken();
  if (token) {
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }
  clearAuth();
}

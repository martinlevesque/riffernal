import { parseError, apiFetch } from "./helpers.js";

export interface KeyboardMenuShortcuts {
  prev?: string | null;
  next?: string | null;
  enter?: string | null;
}

export interface GameSettings {
  piano_show_used_keys_only?: boolean;
  octave_agnostic?: boolean;
  keyboard_menu_shortcuts?: KeyboardMenuShortcuts;
}

export async function fetchUserSettings(): Promise<GameSettings> {
  const res = await apiFetch("/api/user");
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<GameSettings>;
}

export async function updateUserSettings(settings: Partial<GameSettings>): Promise<GameSettings> {
  const res = await apiFetch("/api/user/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<GameSettings>;
}

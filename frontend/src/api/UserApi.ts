export interface GameSettings {
  piano_show_used_keys_only?: boolean;
}

async function parseError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return (body as { error?: string }).error ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

export async function fetchUserSettings(): Promise<GameSettings> {
  const res = await fetch("/api/user");
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<GameSettings>;
}

export async function updateUserSettings(settings: Partial<GameSettings>): Promise<GameSettings> {
  const res = await fetch("/api/user/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<GameSettings>;
}

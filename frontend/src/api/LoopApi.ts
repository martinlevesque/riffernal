/** Saved loop DTO mirrored from the backend. */
export interface Loop {
  id: number;
  startTime: number;
  endTime: number;
  enabled: boolean;
}

async function parseError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return (body as { error?: string }).error ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

/** All saved loops for a song, in time order. */
export async function fetchLoops(songId: number): Promise<Loop[]> {
  const res = await fetch(`/api/songs/${songId}/loops`);
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<Loop[]>;
}

export interface CreateLoopInput {
  startTime: number;
  endTime: number;
  enabled?: boolean;
}

/** Persist a new loop. Returns the stored DTO (with assigned id). */
export async function createLoop(songId: number, input: CreateLoopInput): Promise<Loop> {
  const res = await fetch(`/api/songs/${songId}/loops`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      startTime: input.startTime,
      endTime: input.endTime,
      enabled: input.enabled ?? true,
    }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<Loop>;
}

/** Toggle a loop's enabled flag. */
export async function updateLoopEnabled(loopId: number, enabled: boolean): Promise<Loop> {
  const res = await fetch(`/api/loops/${loopId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<Loop>;
}

/** Delete a saved loop. */
export async function deleteLoop(loopId: number): Promise<void> {
  const res = await fetch(`/api/loops/${loopId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await parseError(res));
}
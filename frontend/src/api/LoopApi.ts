import { parseError, apiFetch } from "./helpers.js";

export interface Loop {
  id: number;
  startTime: number;
  endTime: number;
  enabled: boolean;
}

export async function fetchLoops(songId: number): Promise<Loop[]> {
  const res = await apiFetch(`/api/songs/${songId}/loops`);
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<Loop[]>;
}

export async function createLoop(
  songId: number,
  startTime: number,
  endTime: number,
  enabled = true,
): Promise<Loop> {
  const res = await apiFetch(`/api/songs/${songId}/loops`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ startTime, endTime, enabled }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<Loop>;
}

export async function updateLoopEnabled(loopId: number, enabled: boolean): Promise<Loop> {
  const res = await apiFetch(`/api/loops/${loopId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<Loop>;
}

export async function updateLoopEndTime(loopId: number, endTime: number): Promise<Loop> {
  const res = await apiFetch(`/api/loops/${loopId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endTime }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<Loop>;
}

export async function deleteLoop(loopId: number): Promise<void> {
  const res = await apiFetch(`/api/loops/${loopId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await parseError(res));
}

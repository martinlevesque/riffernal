import type { SongFull, SongSummary } from './SongApi.js';
import { parseError, apiFetch } from './helpers.js';

export interface GuestShowcaseResult {
  songs: SongSummary[];
}

/** List the admin-curated songs playable without an account. */
export async function fetchGuestShowcaseSongs(): Promise<GuestShowcaseResult> {
  const res = await apiFetch('/api/guest/showcase');
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<GuestShowcaseResult>;
}

export async function fetchGuestShowcaseSong(id: number): Promise<SongFull> {
  const res = await apiFetch(`/api/guest/showcase/${id}`);
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<SongFull>;
}

import type { Page } from '@playwright/test';
import { wipeDatabase, seedSong, seedSongWithNotes, authHeaders, authJsonHeaders } from './api.js';

export interface StartGameOptions {
  /** Keep the seeded song in the DB (default: false). */
  keepSong?: boolean;
  /** Song title used when keepSong is true. */
  songTitle?: string;
  /** Custom note list. When provided, seeds via seedSongWithNotes instead of
   *  the default seedSong helper. */
  notes?: Array<{ time: number; key: string; duration: number }>;
  /** Saved loops to create for the seeded song (after the song is created). */
  loops?: Array<{ startTime: number; endTime: number; enabled: boolean }>;
}

export async function goToSongList(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('#home-screen').waitFor({ timeout: 5000 });
  await page.locator('[data-mode="freeplay"]').click();
}

export async function startGame(page: Page, options: StartGameOptions = {}): Promise<void> {
  const { keepSong = false, songTitle = 'E2E Seed', notes, loops } = options;
  const request = page.context().request;
  await wipeDatabase(request);
  const id = notes
    ? await seedSongWithNotes(request, songTitle, notes)
    : (await seedSong(request, songTitle)).id;

  if (loops && loops.length > 0) {
    const headers = await authJsonHeaders(request);
    for (const loop of loops) {
      await request.post(`/api/songs/${id}/loops`, {
        data: loop,
        headers,
      });
    }
  }

  await page.goto('/');
  await page.locator('#home-screen').waitFor({ timeout: 5000 });
  await page.locator('[data-mode="freeplay"]').click();
  await page.locator('.song-item').first().waitFor({ timeout: 5000 });
  await page.locator('.song-item').first().dblclick();
  await page.locator('#play-screen').waitFor({ state: 'attached', timeout: 5000 });
  if (!keepSong) {
    const headers = await authHeaders(page.context().request);
    page.context().request.delete(`/api/songs/${id}`, { headers }).catch(() => {});
  }
}

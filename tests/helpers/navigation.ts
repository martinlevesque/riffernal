import type { Page } from '@playwright/test';
import { wipeDatabase, seedSong } from './api.js';

export interface StartGameOptions {
  /** Keep the seeded song in the DB (default: false). */
  keepSong?: boolean;
  /** Song title used when keepSong is true. */
  songTitle?: string;
}

export async function startGame(page: Page, options: StartGameOptions = {}): Promise<void> {
  const { keepSong = false, songTitle = 'E2E Seed' } = options;
  const request = page.context().request;
  await wipeDatabase(request);
  const { id } = await seedSong(request, songTitle);
  await page.goto('/');
  await page.locator('.song-item').first().waitFor({ timeout: 5000 });
  await page.locator('.song-item').first().click();
  await page.locator('#btn-start').click();
  await page.locator('#play-screen').waitFor({ state: 'attached', timeout: 5000 });
  if (!keepSong) {
    // Clean up the seeded song after the page navigates away from the menu.
    page.context().request.delete(`/api/songs/${id}`).catch(() => {});
  }
}

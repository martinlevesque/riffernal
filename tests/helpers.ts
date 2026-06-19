import type { Page } from '@playwright/test';

// -- constants ---------------------------------------------------------------

export const W = 960;
export const H = 800;

// -- navigate to play screen -------------------------------------------------

export async function startGame(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('.song-item').first().waitFor({ timeout: 5000 });
  await page.locator('.song-item').first().click();
  await page.locator('#btn-start').click();
  await page.locator('#play-screen').waitFor({ state: 'attached', timeout: 5000 });
}

// -- song data ---------------------------------------------------------------

export interface NoteSpec {
  time: number;
  key: string;
  duration: number;
}

export interface SongData {
  title: string;
  artist: string;
  bpm: number;
  difficulty: string;
  notes: NoteSpec[];
}

export function makeSong(notes: NoteSpec[], title = 'Test'): SongData {
  return { title, artist: 'Test', bpm: 120, difficulty: 'easy', notes };
}

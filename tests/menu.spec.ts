import { test, expect, type APIRequestContext } from '@playwright/test';
import { wipeDatabase, deleteSong } from './helpers.js';

const SEED_MIDI = Buffer.from([
  0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06,
  0x00, 0x00, 0x00, 0x01, 0x01, 0xe0,
  0x4d, 0x54, 0x72, 0x6b, 0x00, 0x00, 0x00, 0x14,
  0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20,
  0x78, 0x90, 0x3c, 0x64,
  0x78, 0x3c, 0x00,
  0x00, 0xff, 0x2f, 0x00,
]);

async function seedSong(request: APIRequestContext, title: string): Promise<number> {
  const res = await request.post('/api/songs', {
    multipart: {
      title,
      artist: 'Test',
      bpm: '120',
      difficulty: 'easy',
      notes: JSON.stringify([{ time: 0.5, key: 'C4', duration: 1 }]),
      tracks: '[]',
      selected_track_indices: '[]',
      track_hands: '{}',
      background_tracks: '[]',
      category_id: '',
      midi: { name: 'seed.mid', mimeType: 'audio/midi', buffer: SEED_MIDI },
    },
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).id;
}

test.describe('Menu Screen', () => {
  test.beforeEach(async ({ request }: { request: APIRequestContext }) => {
    await wipeDatabase(request);
  });

  test('displays title and subtitle', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.title')).toContainText('IRONKEYS');
    await expect(page.locator('.subtitle')).toContainText('Keyboard Hero');
  });

  test('shows empty state when no songs exist', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.empty-song-list')).toBeVisible({ timeout: 5000 });
  });

  test('shows song list with imported song', async ({ request, page }) => {
    const id = await seedSong(request, 'E2E Menu Song');
    try {
      await page.goto('/');
      await expect(page.locator('.song-item').first()).toBeVisible({ timeout: 5000 });
      await expect(page.locator('.song-item').first()).toContainText('E2E Menu Song');
    } finally {
      await deleteSong(request, id);
    }
  });

  test('shows controls info', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.controls-info')).toBeVisible();
    await expect(page.locator('.controls-info')).toContainText('White keys');
  });

  test('start button is visible', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#btn-start')).toBeVisible();
    await expect(page.locator('#btn-start')).toContainText('START');
  });
});
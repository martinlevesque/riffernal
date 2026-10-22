import { test, expect, type Browser, type BrowserContext, type Page, type APIRequestContext } from '@playwright/test';
import {
  cleanupSongs,
  seedSongWithNotes,
  authJsonHeaders,
  expectMenuScreenActive,
  expectAuthScreenActive,
} from '../helpers/index.js';

const SEED_NOTES = [{ time: 0, key: 'C4', duration: 1 }];

function buildMidiBuffer(): Buffer {
  const header = [
    0x4d, 0x54, 0x68, 0x64,
    0x00, 0x00, 0x00, 0x06,
    0x00, 0x00,
    0x00, 0x01,
    0x01, 0xe0,
  ];

  const trackEvents = [
    0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20,
    0x78, 0x90, 0x3c, 0x64,
    0x78, 0x3c, 0x00,
    0x00, 0xff, 0x2f, 0x00,
  ];

  const trackLength = trackEvents.length;
  const trackHeader = [
    0x4d, 0x54, 0x72, 0x6b,
    (trackLength >> 24) & 0xff,
    (trackLength >> 16) & 0xff,
    (trackLength >> 8) & 0xff,
    trackLength & 0xff,
  ];

  return Buffer.from([...header, ...trackHeader, ...trackEvents]);
}

/** Boot an anonymous visitor: a context with an explicitly empty storage
 *  state — browser.newContext() otherwise inherits the e2e project's
 *  authenticated storageState from the config. */
async function continueAsGuest(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto('/');
  await page.locator('#auth-guest-btn').click();
  await expectMenuScreenActive(page);
  return { context, page };
}

/** Feature a seeded song. The shared e2e user is the setup admin (first
 *  account on the fresh test DB). */
async function featureSong(request: APIRequestContext, id: number): Promise<void> {
  const headers = await authJsonHeaders(request);
  const res = await request.put(`/api/songs/${id}/guest-showcase`, {
    data: { guestShowcase: true },
    headers,
  });
  expect(res.ok()).toBeTruthy();
}

async function publishSong(request: APIRequestContext, id: number): Promise<void> {
  const headers = await authJsonHeaders(request);
  const res = await request.put(`/api/songs/${id}/public-community`, {
    data: { publicCommunity: true },
    headers,
  });
  expect(res.ok()).toBeTruthy();
}

test.describe('Guest mode', () => {
  test('continue as guest boots straight into the freeplay menu', async ({ browser }) => {
    const { context, page } = await continueAsGuest(browser);

    await expect(page.locator('#btn-import-midi')).toBeVisible();
    // Guest chrome: no home screen corner, a Sign in exit instead.
    await expect(page.locator('.brand-corner')).toBeHidden();
    await expect(page.locator('#btn-guest-signin')).toBeVisible();

    await context.close();
  });

  test('guest can import a MIDI, keep it across a refresh, and play it', async ({ browser }) => {
    const { context, page } = await continueAsGuest(browser);

    await page.waitForFunction(() => (document.getElementById('midi-status') as HTMLElement).textContent.length > 0);
    const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 5000 });
    await page.locator('#btn-import-midi').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({ name: 'guest-song.mid', mimeType: 'audio/midi', buffer: buildMidiBuffer() });

    // Single-track file: straight to the metadata form. Guests have no
    // server categories, so the category UI is hidden.
    await page.waitForSelector('#category-select-screen.active', { timeout: 5000 });
    await expect(page.locator('#category-list')).toBeHidden();
    await expect(page.locator('#category-select-skip')).toBeHidden();
    await page.locator('#import-song-title').fill('Guest Song');
    await page.locator('#category-select-confirm').click();

    await expect(page.locator('.song-item.imported')).toHaveCount(1, { timeout: 5000 });
    await expect(page.locator('.song-item.imported')).toContainText('Guest Song');
    await expect(page.locator('.category-section', { hasText: 'My Imports' })).toBeVisible();

    // The shelf is client-side: a refresh re-enters guest mode with the
    // song still on it (raw .mid bytes re-parsed from IndexedDB).
    await page.reload();
    await expectMenuScreenActive(page);
    await expect(page.locator('.song-item.imported')).toHaveCount(1, { timeout: 5000 });
    await expect(page.locator('.song-item.imported')).toContainText('Guest Song');

    // And it is playable without an account.
    await page.locator('.song-item.imported').click();
    const startBtn = page.locator('#btn-start');
    await expect(startBtn).toBeEnabled();
    await startBtn.click();
    await expect(page.locator('#play-screen')).toBeVisible({ timeout: 5000 });

    await context.close();
  });

  test('community rows are locked for guests and the chip leads to auth', async ({ browser, request }) => {
    await cleanupSongs(request, /^E2E-Guest-Comm$/);
    const id = await seedSongWithNotes(request, 'E2E-Guest-Comm', SEED_NOTES);
    await publishSong(request, id);

    const { context, page } = await continueAsGuest(browser);

    const lockedRow = page.locator('.song-item.community-song', { hasText: 'E2E-Guest-Comm' });
    await expect(lockedRow.locator('.sign-in-chip')).toBeVisible({ timeout: 5000 });

    await lockedRow.locator('.sign-in-chip').click();
    await expectAuthScreenActive(page);

    await context.close();
    await cleanupSongs(request, /^E2E-Guest-Comm$/);
  });

  test('guest can play admin-featured showcase songs', async ({ browser, request }) => {
    await cleanupSongs(request, /^E2E-Guest-Feat$/);
    const id = await seedSongWithNotes(request, 'E2E-Guest-Feat', SEED_NOTES);
    await publishSong(request, id);
    await featureSong(request, id);

    const { context, page } = await continueAsGuest(browser);

    const featuredRow = page.locator('.showcase-song', { hasText: 'E2E-Guest-Feat' });
    await expect(featuredRow).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.showcase-section', { hasText: 'Featured' })).toBeVisible();

    // Featured songs are playable in the showcase section, not duplicated
    // as locked rows in the community list.
    await expect(page.locator('.community-section .song-item', { hasText: 'E2E-Guest-Feat' })).toHaveCount(0);

    await featuredRow.click();
    const startBtn = page.locator('#btn-start');
    await expect(startBtn).toBeEnabled();
    await startBtn.click();
    await expect(page.locator('#play-screen')).toBeVisible({ timeout: 5000 });

    await context.close();
    await cleanupSongs(request, /^E2E-Guest-Feat$/);
  });
});

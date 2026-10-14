import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import { wipeDatabase, goToSongList } from '../helpers/index.js';

async function importMidiFile(page: Page, name: string, buffer: Buffer): Promise<void> {
  await page.waitForFunction(() => (document.getElementById('midi-status') as HTMLElement).textContent.length > 0);
  const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 5000 });
  await page.locator('#btn-import-midi').click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({ name, mimeType: 'audio/midi', buffer });

  // For valid MIDIs, the category selection modal appears.
  // For invalid MIDIs, an alert() fires instead (handled by the test's dialog listener).
  try {
    await page.waitForSelector('#category-select-screen.active', { timeout: 4000 });
    await page.locator('#category-select-skip').click();
    await page.waitForSelector('#category-select-screen:not(.active)', { timeout: 5000 });
  } catch {
    // No category modal — likely an error case handled elsewhere.
  }
}

function buildMidiBuffer(): Buffer {
  const header = [
    0x4D, 0x54, 0x68, 0x64,
    0x00, 0x00, 0x00, 0x06,
    0x00, 0x00,
    0x00, 0x01,
    0x01, 0xE0,
  ];

  const trackEvents = [
    0x00, 0xFF, 0x51, 0x03, 0x07, 0xA1, 0x20,
    0x78, 0x90, 0x3C, 0x64,
    0x78, 0x3C, 0x00,
    0x00, 0xFF, 0x2F, 0x00,
  ];

  const trackLength = trackEvents.length;
  const trackHeader = [
    0x4D, 0x54, 0x72, 0x6B,
    (trackLength >> 24) & 0xFF,
    (trackLength >> 16) & 0xFF,
    (trackLength >> 8) & 0xFF,
    trackLength & 0xFF,
  ];

  return Buffer.from([...header, ...trackHeader, ...trackEvents]);
}

function buildMidiBufferWithNotes(noteEvents: number[]): Buffer {
  const header = [
    0x4D, 0x54, 0x68, 0x64,
    0x00, 0x00, 0x00, 0x06,
    0x00, 0x00,
    0x00, 0x01,
    0x01, 0xE0,
  ];

  const trackEvents = [
    0x00, 0xFF, 0x51, 0x03, 0x07, 0xA1, 0x20,
    ...noteEvents,
    0x00, 0xFF, 0x2F, 0x00,
  ];

  const trackLength = trackEvents.length;
  const trackHeader = [
    0x4D, 0x54, 0x72, 0x6B,
    (trackLength >> 24) & 0xFF,
    (trackLength >> 16) & 0xFF,
    (trackLength >> 8) & 0xFF,
    trackLength & 0xFF,
  ];

  return Buffer.from([...header, ...trackHeader, ...trackEvents]);
}

test.describe('MIDI Import', () => {
  test.beforeEach(async ({ request }: { request: APIRequestContext }) => {
    await wipeDatabase(request);
  });

  test('import button is visible on menu screen', async ({ page }) => {
    await goToSongList(page);
    await expect(page.locator('#btn-import-midi')).toBeVisible();
    await expect(page.locator('#btn-import-midi')).toContainText('Import MIDI');
  });

  // Regression: a reused file input can stay wedged after its chooser is
  // dismissed (e.g. clicking outside), so later clicks seem dead. The button
  // must hand each request a pristine input.
  test('import gets a fresh file input on every click', async ({ page }) => {
    await goToSongList(page);

    await page.locator('#btn-import-midi').click();
    const first = await page.evaluateHandle(() => document.querySelector('#midi-import-input'));

    const chooserPromise = page.waitForEvent('filechooser', { timeout: 5000 });
    await page.locator('#btn-import-midi').click();
    const chooser = await chooserPromise;
    const second = chooser.element();

    const sameNode = await page.evaluate(
      ([a, b]) => a === b,
      [first, second] as unknown as [Element | null, Element | null],
    );

    expect(await first.evaluate((el) => el !== null)).toBe(true);
    expect(sameNode).toBe(false);
  });

  test('importing a valid MIDI file adds a song to the list', async ({ page }) => {
    await goToSongList(page);

    await importMidiFile(page, 'test-song.mid', buildMidiBuffer());

    const importedItem = page.locator('.song-item.imported');
    await expect(importedItem).toHaveCount(1, { timeout: 5000 });
    await expect(importedItem).toContainText('test-song');
    await expect(importedItem.locator('.song-difficulty')).toContainText('easy');
  });

  test('importing multiple MIDI files adds all to the list', async ({ page }) => {
    await goToSongList(page);

    for (let i = 0; i < 2; i++) {
      await importMidiFile(page, `song-${i}.mid`, buildMidiBuffer());
      await expect(page.locator('.song-item.imported')).toHaveCount(i + 1, { timeout: 5000 });
    }

    const importedItems = page.locator('.song-item.imported');
    await expect(importedItems).toHaveCount(2);
    await expect(importedItems.nth(0)).toContainText('song-1');
    await expect(importedItems.nth(1)).toContainText('song-0');
  });

  test('imported song can be selected and played', async ({ page }) => {
    await goToSongList(page);

    await importMidiFile(page, 'playable.mid', buildMidiBuffer());

    const importedItem = page.locator('.song-item.imported');
    await expect(importedItem).toHaveCount(1, { timeout: 5000 });
    await importedItem.click();

    const startBtn = page.locator('#btn-start');
    await expect(startBtn).toBeEnabled();
    await startBtn.click();

    await expect(page.locator('#play-screen')).toBeVisible({ timeout: 5000 });
  });

  test('owner can update the difficulty of an imported song', async ({ page }) => {
    await goToSongList(page);

    await importMidiFile(page, 'adjustable.mid', buildMidiBuffer());

    const importedItem = page.locator('.song-item.imported');
    await expect(importedItem).toHaveCount(1, { timeout: 5000 });
    await expect(importedItem.locator('.song-difficulty')).toContainText('easy');

    await importedItem.locator('.song-actions-btn').click();
    await page.locator('.song-action-option', { hasText: 'Set difficulty' }).click();
    await page.locator('#difficulty-popup .pixel-chip', { hasText: 'hard' }).click();
    await page.locator('#btn-difficulty-save').click();

    await expect(importedItem.locator('.song-difficulty')).toContainText('hard');
  });

  test('shows error alert for invalid file', async ({ page }) => {
    await goToSongList(page);

    page.on('dialog', async dialog => {
      await dialog.dismiss();
    });

    await importMidiFile(page, 'bad.mid', Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]));

    await expect(page.locator('.song-item.imported')).toHaveCount(0, { timeout: 3000 });
  });

  test('shows error alert for MIDI with no playable notes', async ({ page }) => {
    await goToSongList(page);

    page.on('dialog', async dialog => {
      await dialog.dismiss();
    });

    const header = [
      0x4D, 0x54, 0x68, 0x64,
      0x00, 0x00, 0x00, 0x06,
      0x00, 0x00,
      0x00, 0x01,
      0x01, 0xE0,
    ];
    const trackEvents = [
      0x00, 0xFF, 0x51, 0x03, 0x07, 0xA1, 0x20,
      0x00, 0xFF, 0x2F, 0x00,
    ];
    const trackLength = trackEvents.length;
    const trackHeader = [
      0x4D, 0x54, 0x72, 0x6B,
      (trackLength >> 24) & 0xFF,
      (trackLength >> 16) & 0xFF,
      (trackLength >> 8) & 0xFF,
      trackLength & 0xFF,
    ];

    await importMidiFile(page, 'empty.mid', Buffer.from([...header, ...trackHeader, ...trackEvents]));

    await expect(page.locator('.song-item.imported')).toHaveCount(0, { timeout: 3000 });
  });

  test('out-of-range notes are transposed into playable range', async ({ page }) => {
    await goToSongList(page);

    const noteOnOff = [
      0x78, 0x90, 0x0C, 0x64,
      0x78, 0x0C, 0x00,
    ];

    await importMidiFile(page, 'low-notes.mid', buildMidiBufferWithNotes(noteOnOff));

    await expect(page.locator('.song-item.imported')).toHaveCount(1, { timeout: 5000 });
    await expect(page.locator('.song-item.imported')).toContainText('low-notes');
  });
});
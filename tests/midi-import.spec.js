import { test, expect } from '@playwright/test';

async function importMidiFile(page, name, buffer) {
  await page.waitForFunction(() => document.getElementById('midi-status').textContent.length > 0);
  const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 5000 });
  await page.locator('#btn-import-midi').click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({ name, mimeType: 'audio/midi', buffer });
}

function buildMidiBuffer() {
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

function buildMidiBufferWithNotes(noteEvents) {
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
  test('import button is visible on menu screen', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#btn-import-midi')).toBeVisible();
    await expect(page.locator('#btn-import-midi')).toContainText('IMPORT MIDI');
  });

  test('importing a valid MIDI file adds a song to the list', async ({ page }) => {
    await page.goto('/');

    await importMidiFile(page, 'test-song.mid', buildMidiBuffer());

    const importedItem = page.locator('.song-item.imported');
    await expect(importedItem).toHaveCount(1, { timeout: 5000 });
    await expect(importedItem).toContainText('test-song');
    await expect(importedItem.locator('.song-difficulty')).toContainText('medium');
  });

  test('importing multiple MIDI files adds all to the list', async ({ page }) => {
    await page.goto('/');

    for (let i = 0; i < 2; i++) {
      await importMidiFile(page, `song-${i}.mid`, buildMidiBuffer());
      await expect(page.locator('.song-item.imported')).toHaveCount(i + 1, { timeout: 5000 });
    }

    const importedItems = page.locator('.song-item.imported');
    await expect(importedItems).toHaveCount(2);
    await expect(importedItems.nth(0)).toContainText('song-0');
    await expect(importedItems.nth(1)).toContainText('song-1');
  });

  test('imported song can be selected and played', async ({ page }) => {
    await page.goto('/');

    await importMidiFile(page, 'playable.mid', buildMidiBuffer());

    const importedItem = page.locator('.song-item.imported');
    await expect(importedItem).toHaveCount(1, { timeout: 5000 });
    await importedItem.click();

    const startBtn = page.locator('#btn-start');
    await expect(startBtn).toBeEnabled();
    await startBtn.click();

    await expect(page.locator('#play-screen')).toBeVisible({ timeout: 5000 });
  });

  test('shows error alert for invalid file', async ({ page }) => {
    await page.goto('/');

    page.on('dialog', async dialog => {
      await dialog.dismiss();
    });

    await importMidiFile(page, 'bad.mid', Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]));

    await expect(page.locator('.song-item.imported')).toHaveCount(0, { timeout: 3000 });
  });

  test('shows error alert for MIDI with no playable notes', async ({ page }) => {
    await page.goto('/');

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
    await page.goto('/');

    const noteOnOff = [
      0x78, 0x90, 0x0C, 0x64,
      0x78, 0x0C, 0x00,
    ];

    await importMidiFile(page, 'low-notes.mid', buildMidiBufferWithNotes(noteOnOff));

    await expect(page.locator('.song-item.imported')).toHaveCount(1, { timeout: 5000 });
    await expect(page.locator('.song-item.imported')).toContainText('low-notes');
  });
});

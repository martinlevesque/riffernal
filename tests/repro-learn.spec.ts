import { test, expect } from '@playwright/test';
import { seedSongWithNotes, expectPlayScreenActive, goToSongList } from './helpers/index.js';

// Repro for user report: "in learn mode, when I press, nothing happens"
test('learn mode: pressing correct key while frozen scores and unfreezes', async ({ page, context }) => {
  const request = context.request;
  const songs = (await (await request.get('/api/songs')).json()) as Array<{ id: number }>;
  for (const s of songs) await request.delete(`/api/songs/${s.id}`);

  const notes = [
    { time: 1.5, key: 'C4', duration: 0.4 },
    { time: 3.0, key: 'E4', duration: 0.4 },
  ];
  await seedSongWithNotes(request, 'LearnReproReal', notes);

  await goToSongList(page);
  await page.locator('.song-item').first().waitFor({ timeout: 5000 });
  await page.locator('.song-item').first().dblclick();
  await page.locator('#play-screen').waitFor({ state: 'attached', timeout: 5000 });
  await expectPlayScreenActive(page);

  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
  });

  // Switch to LEARN mode
  await page.locator('#mode-learn').click();
  await expect(page.locator('#mode-learn')).toHaveClass(/active/);

  // Wait for first note to arrive & freeze
  await page.waitForTimeout(3000);

  // Press C4 = KeyK briefly (Perfect hit expected; game should unfreeze)
  await page.keyboard.press('KeyK');
  await page.waitForTimeout(500);

  const feedback = await page.locator('#hit-feedback').textContent();
  console.log('FEEDBACK after first press:', feedback);

  // Press once more — E4 = KeyO should hit second note
  await page.waitForTimeout(1500);
  await page.keyboard.press('KeyO');
  await page.waitForTimeout(500);

  const feedback2 = await page.locator('#hit-feedback').textContent();
  console.log('FEEDBACK after second press:', feedback2);

  console.log('ERRORS:', errors);

  expect(errors).toEqual([]);
  expect(feedback).toMatch(/Perfect|Great|Good/);
});
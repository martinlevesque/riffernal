import { test, expect } from '@playwright/test';
import {
  startGame,
  expectMode,
  expectPracticeHand,
  toggleLearnMode,
  togglePlayMode,
  expectPlayScreenActive,
  expectMenuScreenActive,
} from '../../../helpers/index.js';

// -- UI tests ----------------------------------------------------------------

test.describe('Practice Hand - UI', () => {
  test('hand-control is hidden in PLAY mode and shown in LEARN mode', async ({ page }) => {
    await startGame(page);
    await expect(page.locator('#hand-control')).not.toHaveClass(/active/);
    await toggleLearnMode(page);
    await expect(page.locator('#hand-control')).toHaveClass(/active/);
  });

  test('clicking LEFT toggles left practice on, then off', async ({ page }) => {
    await startGame(page);
    await toggleLearnMode(page);
    await page.locator('#hand-left').click();
    await expectPracticeHand(page, 'left');
    await page.locator('#hand-left').click();
    await expectPracticeHand(page, 'both');
  });

  test('clicking RIGHT toggles right practice on, then off', async ({ page }) => {
    await startGame(page);
    await toggleLearnMode(page);
    await page.locator('#hand-right').click();
    await expectPracticeHand(page, 'right');
    await page.locator('#hand-right').click();
    await expectPracticeHand(page, 'both');
  });

  test('LEFT and RIGHT are mutually exclusive', async ({ page }) => {
    await startGame(page);
    await toggleLearnMode(page);
    await page.locator('#hand-left').click();
    await expectPracticeHand(page, 'left');
    await page.locator('#hand-right').click();
    await expectPracticeHand(page, 'right');
  });

  test('practice hand is preserved on restart', async ({ page }) => {
    await startGame(page);
    await toggleLearnMode(page);
    await page.locator('#hand-left').click();
    await expectPracticeHand(page, 'left');
    await page.locator('#btn-restart').click();
    await expectMode(page, 'learn');
    await expectPracticeHand(page, 'left');
  });

  test('practice hand is preserved on retry from results', async ({ page }) => {
    await startGame(page);
    await toggleLearnMode(page);
    await page.locator('#hand-right').click();
    await expectPracticeHand(page, 'right');
    await page.evaluate(() => document.getElementById('btn-retry')?.click());
    await expectMode(page, 'learn');
    await expectPracticeHand(page, 'right');
  });

  test('practice hand resets to both when starting fresh from menu', async ({ page }) => {
    await startGame(page, { keepSong: true });
    await toggleLearnMode(page);
    await page.locator('#hand-left').click();
    await expectPracticeHand(page, 'left');
    await page.evaluate(() => document.getElementById('btn-menu')?.click());
    await expectMenuScreenActive(page);
    await page.locator('.song-item').first().click();
    await page.locator('#btn-start').click();
    await expectPlayScreenActive(page);
    await expectPracticeHand(page, 'both');
  });

  test('switching back to PLAY mode hides hand-control', async ({ page }) => {
    await startGame(page);
    await toggleLearnMode(page);
    await expect(page.locator('#hand-control')).toHaveClass(/active/);
    await togglePlayMode(page);
    await expect(page.locator('#hand-control')).not.toHaveClass(/active/);
  });
});

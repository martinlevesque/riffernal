import { test, expect } from '@playwright/test';
import { startGame, expectPlayScreenActive } from '../helpers/index.js';

test.describe('Gameplay', () => {
  test.beforeEach(async ({ page }) => {
    await startGame(page);
    await expectPlayScreenActive(page);
  });

  test('transitions to play screen on start', async ({ page }) => {
    await expectPlayScreenActive(page);
  });

  test('canvas is rendered during play', async ({ page }) => {
    await expect(page.locator('#gameCanvas')).toBeVisible();
  });

  test('score display is visible', async ({ page }) => {
    await expect(page.locator('#score-value')).toBeVisible();
  });

  test('pressing a key shows hit feedback', async ({ page }) => {
    await page.keyboard.press('KeyA');
    await expect(page.locator('#hit-feedback')).toHaveText(/Miss|Wrong|Perfect|Great|Good/, { timeout: 1000 });
  });

  test('speed controls change display value', async ({ page }) => {
    await page.locator('#speed-up').click();
    await expect(page.locator('#speed-value')).not.toHaveText('100%');
  });
});

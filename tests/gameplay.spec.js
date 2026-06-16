import { test, expect } from '@playwright/test';

test.describe('Gameplay', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('.song-item').first().waitFor({ timeout: 5000 });
    await page.locator('.song-item').first().click();
    await page.locator('#btn-start').click();
    await expect(page.locator('#play-screen')).toHaveClass(/active/, { timeout: 5000 });
  });

  test('transitions to play screen on start', async ({ page }) => {
    await expect(page.locator('#play-screen')).toHaveClass(/active/);
  });

  test('canvas is rendered during play', async ({ page }) => {
    await expect(page.locator('#gameCanvas')).toBeVisible();
  });

  test('score display is visible', async ({ page }) => {
    await expect(page.locator('#score-value')).toBeVisible();
  });

  test('pressing a key shows hit feedback', async ({ page }) => {
    await page.waitForTimeout(1800);
    await page.keyboard.press('KeyA');
    await expect(page.locator('#hit-feedback')).not.toBeEmpty({ timeout: 1000 });
  });

  test('speed controls change display value', async ({ page }) => {
    await expect(page.locator('#speed-value')).toHaveText('100%');
    await page.locator('#speed-up').click();
    await expect(page.locator('#speed-value')).toHaveText('110%');
  });
});

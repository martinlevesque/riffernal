import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('retry restarts the game and shows play screen', async ({ page }) => {
    await page.goto('/');
    await page.locator('.song-item').first().waitFor({ timeout: 5000 });
    await page.locator('.song-item').first().click();
    await page.locator('#btn-start').click();
    await expect(page.locator('#play-screen')).toHaveClass(/active/, { timeout: 5000 });
    await page.locator('#btn-restart').click();
    await expect(page.locator('#play-screen')).toHaveClass(/active/, { timeout: 5000 });
  });

  test('back to menu shows menu screen', async ({ page }) => {
    await page.goto('/');
    await page.locator('.song-item').first().waitFor({ timeout: 5000 });
    await page.locator('.song-item').first().click();
    await page.locator('#btn-start').click();
    await expect(page.locator('#play-screen')).toHaveClass(/active/, { timeout: 5000 });

    await page.evaluate(() => {
      const btn = document.getElementById('btn-menu');
      if (btn) btn.click();
    });

    await expect(page.locator('#menu-screen')).toHaveClass(/active/, { timeout: 5000 });
  });
});

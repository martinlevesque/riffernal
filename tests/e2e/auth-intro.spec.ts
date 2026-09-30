import { test, expect } from '@playwright/test';
import { expectAuthScreenActive } from '../helpers/index.js';

test.describe('Auth screen introduction', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem('riffernal_token');
      localStorage.removeItem('riffernal_user');
    });
    await page.goto('/');
  });

  test('shows a short introduction describing the app', async ({ page }) => {
    await expectAuthScreenActive(page);

    const intro = page.locator('.intro');
    await expect(intro).toBeVisible();
    await expect(intro).toContainText('rhythm game');
    await expect(intro).toContainText('Drop in a MIDI');
    await expect(intro).toContainText('community songs');

    const contentCount = await intro.locator('p, li').count();
    expect(contentCount).toBeLessThan(10);
  });

  test('introduction survives toggling to register', async ({ page }) => {
    await page.locator('#auth-toggle-btn').click();
    await expectAuthScreenActive(page);

    const intro = page.locator('.intro');
    await expect(intro).toBeVisible();
  });
});

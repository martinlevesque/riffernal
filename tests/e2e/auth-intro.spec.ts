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

  test('presents the app on login and sells the no-email form on register', async ({ page }) => {
    await expectAuthScreenActive(page);

    const intro = page.locator('.intro');
    await expect(intro).toBeVisible();
    await expect(intro).toContainText('rhythm game');
    await expect(intro).toContainText('Drop in a MIDI');
    await expect(intro).toContainText('from the community');

    const contentCount = await intro.locator('p, li').count();
    expect(contentCount).toBeLessThan(10);

    await page.locator('#auth-toggle-btn').click();
    await expectAuthScreenActive(page);
    await expect(intro).toBeVisible();

    const email = page.locator('#auth-email');
    await expect(email).toBeEnabled();
    await expect(email).toHaveValue('');

    await email.click();
    await expect(email).toBeDisabled();
    await expect(email).toHaveValue(/Just kidding, no email needed/);
  });
});

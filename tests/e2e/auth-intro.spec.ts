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

  test('presents the app on login and keeps email out of the register form', async ({ page }) => {
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

    await expect(page.locator('#auth-email')).toHaveCount(0);
    await expect(page.locator('.auth-card')).not.toContainText('Email');
  });

  test('shows the github corner link on the auth screen and keeps it across re-renders', async ({
    page,
  }) => {
    await expectAuthScreenActive(page);

    const github = page.locator('#auth-screen .home-github');
    await expect(github).toBeVisible();
    await expect(github).toHaveAttribute('href', 'https://github.com/martinlevesque/riffernal');

    await page.locator('#auth-toggle-btn').click();
    await expectAuthScreenActive(page);
    await expect(github).toBeVisible();
  });
});

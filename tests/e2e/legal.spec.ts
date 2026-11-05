import { test, expect } from '@playwright/test';
import { expectAuthScreenActive, expectHomeScreenActive } from '../helpers/index.js';

test.describe('Legal pages', () => {
  test('home screen shows footer links to both pages', async ({ page }) => {
    await page.goto('/');
    await expectHomeScreenActive(page);

    const terms = page.locator('.home-legal a[href="/terms.html"]');
    const privacy = page.locator('.home-legal a[href="/privacy.html"]');
    await expect(terms).toBeVisible();
    await expect(privacy).toBeVisible();
  });

  test('home screen shows a github link to the source repo', async ({ page }) => {
    await page.goto('/');
    await expectHomeScreenActive(page);

    const github = page.locator('#home-screen .home-github');
    await expect(github).toBeVisible();
    await expect(github).toHaveAttribute('href', 'https://github.com/riffernal/riffernal');
    await expect(github).toHaveAttribute('target', '_blank');
    await expect(github.locator('svg')).toBeVisible();
  });

  test('terms page opens from the home footer and back returns home', async ({ page }) => {
    await page.goto('/');
    await expectHomeScreenActive(page);

    await page.locator('.home-legal a[href="/terms.html"]').click();
    await expect(page).toHaveURL(/\/terms\.html$/);
    await expect(page.locator('.legal-title')).toHaveText('TERMS');

    await page.locator('.legal-back').click();
    await expectHomeScreenActive(page);
  });

  test('privacy page opens from the home footer and back returns home', async ({ page }) => {
    await page.goto('/');
    await expectHomeScreenActive(page);

    await page.locator('.home-legal a[href="/privacy.html"]').click();
    await expect(page).toHaveURL(/\/privacy\.html$/);
    await expect(page.locator('.legal-title')).toHaveText('PRIVACY');

    await page.locator('.legal-back').click();
    await expectHomeScreenActive(page);
  });

  test('auth screen shows footer links to both pages', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await expectAuthScreenActive(page);

    const terms = page.locator('.auth-legal a[href="/terms.html"]');
    const privacy = page.locator('.auth-legal a[href="/privacy.html"]');
    await expect(terms).toBeVisible();
    await expect(privacy).toBeVisible();
  });

  test('both pages are viewable without logging in', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());

    await page.goto('/terms.html');
    await expect(page.locator('.legal-title')).toHaveText('TERMS');

    await page.goto('/privacy.html');
    await expect(page.locator('.legal-title')).toHaveText('PRIVACY');
  });
});

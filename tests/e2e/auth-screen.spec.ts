import { test, expect } from '@playwright/test';

test.describe('Auth Screen', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  // The brand sits outside the card, above it. Assert the rendered text
  // stays within the column it shares with the card down to the narrowest
  // phone-class widths (375px: iPhone, 320px: iPhone SE 1st gen, 280px:
  // foldable cover).
  test('brand fits above the card on phone-width viewports', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await expect(page.locator('.auth-card')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    for (const width of [375, 320, 280]) {
      await page.setViewportSize({ width, height: 667 });

      const fits = await page.locator('.auth-brand').evaluate((brand) => {
        const panel = brand.closest('.auth-panel')!;
        const panelRect = panel.getBoundingClientRect();

        const range = document.createRange();
        range.selectNodeContents(brand);
        const textRect = range.getBoundingClientRect();

        return textRect.left >= panelRect.left && textRect.right <= panelRect.right;
      });

      expect(fits, `brand overflows the panel at ${width}px viewport`).toBe(true);
    }
  });
});

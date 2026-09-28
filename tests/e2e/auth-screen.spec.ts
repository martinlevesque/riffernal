import { test, expect } from '@playwright/test';

test.describe('Auth Screen', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  // The brand previously spilled past the card border on phones, where the
  // card shrinks with the viewport. Assert the rendered text stays inside
  // the card's content box down to the narrowest phone-class widths
  // (375px: iPhone, 320px: iPhone SE 1st gen, 280px: foldable cover).
  test('brand fits inside the card on phone-width viewports', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await expect(page.locator('.auth-card')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    for (const width of [375, 320, 280]) {
      await page.setViewportSize({ width, height: 667 });

      const fits = await page.locator('.auth-brand').evaluate((brand) => {
        const card = brand.closest('.auth-card')!;
        const cardStyle = getComputedStyle(card);
        const cardRect = card.getBoundingClientRect();
        const contentLeft = cardRect.left + parseFloat(cardStyle.borderLeftWidth) + parseFloat(cardStyle.paddingLeft);
        const contentRight = cardRect.right - parseFloat(cardStyle.borderRightWidth) - parseFloat(cardStyle.paddingRight);

        const range = document.createRange();
        range.selectNodeContents(brand);
        const textRect = range.getBoundingClientRect();

        return textRect.left >= contentLeft && textRect.right <= contentRight;
      });

      expect(fits, `brand overflows the card at ${width}px viewport`).toBe(true);
    }
  });
});

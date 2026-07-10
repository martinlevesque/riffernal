import { expect, type Page } from '@playwright/test';

// -- screen state ------------------------------------------------------------

/** Assert that the menu screen is active. */
export async function expectMenuScreenActive(page: Page): Promise<void> {
  await expect(page.locator('#menu-screen')).toHaveClass(/active/, { timeout: 5000 });
}

// -- navigation --------------------------------------------------------------

/** Click the back-to-menu button and wait for the menu screen. */
export async function clickBackToMenu(page: Page): Promise<void> {
  await page.locator('#btn-menu').click();
  await expectMenuScreenActive(page);
}

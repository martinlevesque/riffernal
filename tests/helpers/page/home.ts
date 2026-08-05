import { expect, type Page } from '@playwright/test';

// -- screen state ------------------------------------------------------------

/** Assert that the home screen is active. */
export async function expectHomeScreenActive(page: Page): Promise<void> {
  await expect(page.locator('#home-screen')).toHaveClass(/active/, { timeout: 5000 });
}

/** Assert that the menu (song list) screen is active. */
export async function expectMenuScreenActive(page: Page): Promise<void> {
  await expect(page.locator('#freeplay-screen')).toHaveClass(/active/, { timeout: 5000 });
}

// -- navigation --------------------------------------------------------------

/** Navigate from the home screen to the song list via the Freeplay button. */
export async function clickFreeplay(page: Page): Promise<void> {
  await page.locator('[data-mode="freeplay"]').click();
  await expectMenuScreenActive(page);
}

/** Click the game's MENU button without asserting a screen transition.
 *  The destination depends on the currentMode (e.g. freeplay → freeplay screen). */
export async function clickBackToHome(page: Page): Promise<void> {
  await page.locator('#btn-menu').click();
}

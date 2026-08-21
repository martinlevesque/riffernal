import { expect, type Page, type Locator } from '@playwright/test';

// -- screen state ------------------------------------------------------------

/** Assert that the home screen is active. */
export async function expectHomeScreenActive(page: Page): Promise<void> {
  await expect(page.locator('#home-screen')).toHaveClass(/active/, { timeout: 5000 });
}

/** Assert the MIDI status text on the home screen. */
export async function expectHomeMidiStatus(page: Page, text: string): Promise<void> {
  const status = page.locator('#midi-status-home');
  await expect(status).toBeVisible();
  await expect(status).toContainText(text);
}

/** Assert that the home MIDI status shows connected (green). */
export async function expectHomeMidiConnected(page: Page): Promise<void> {
  await expect(page.locator('#midi-status-home')).toHaveClass(/connected/);
}

/** Assert that the home MIDI status shows disconnected. */
export async function expectHomeMidiDisconnected(page: Page): Promise<void> {
  await expect(page.locator('#midi-status-home')).not.toHaveClass(/connected/);
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
 *  The destination depends on the currentMode (e.g. freeplay → freeplay screen).
 *  Uses page.evaluate because #btn-menu lives inside #results-screen which
 *  may not be visible (display:none) when clicked from gameplay state. */
export async function clickBackToHome(page: Page): Promise<void> {
  await page.evaluate(() => document.getElementById('btn-menu')?.click());
}

// -- auth / settings ----------------------------------------------------------

/** Assert that the home screen is inactive (e.g. after logging out). */
export async function expectHomeScreenInactive(page: Page): Promise<void> {
  await expect(page.locator('#home-screen')).not.toHaveClass(/active/);
}

/** Assert that the auth screen is active. */
export async function expectAuthScreenActive(page: Page, timeout = 5000): Promise<void> {
  await expect(page.locator('#auth-screen')).toHaveClass(/active/, { timeout });
}

/** Click the LOGOUT card on the home screen. */
export async function clickLogout(page: Page): Promise<void> {
  await page.locator('[data-mode="logout"]').click();
}

/** Open the settings popup via the home screen SETTINGS card. */
export async function openSettings(page: Page): Promise<void> {
  await page.locator('[data-mode="settings"]').click();
  await expect(page.locator('#settings-popup')).toBeVisible();
}

/** Locator for all theme option buttons in the settings popup. */
export function themeOptions(page: Page): Locator {
  return page.locator('#settings-theme-list .theme-option');
}

/** Locator for a single (0-indexed) theme option button. */
export function themeOption(page: Page, index: number): Locator {
  return themeOptions(page).nth(index);
}

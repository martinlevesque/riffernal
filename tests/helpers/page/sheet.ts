import { expect, type Page } from '@playwright/test';
import { CLOSE_SHEET_BTN, OPEN_SHEET_BTN, SHEET_SCREEN } from '../constants.js';

// -- screen state ------------------------------------------------------------

/** Assert that the sheet screen is active. */
export async function expectSheetScreenActive(page: Page): Promise<void> {
  await expect(page.locator(SHEET_SCREEN)).toHaveClass(/active/);
}

/** Assert that the sheet screen is NOT active. */
export async function expectSheetScreenInactive(page: Page): Promise<void> {
  await expect(page.locator(SHEET_SCREEN)).not.toHaveClass(/active/);
}

// -- actions -----------------------------------------------------------------

/** Open the sheet view. */
export async function openSheet(page: Page): Promise<void> {
  await page.locator(OPEN_SHEET_BTN).click();
  await expectSheetScreenActive(page);
}

/** Close the sheet view. */
export async function closeSheet(page: Page): Promise<void> {
  await page.locator(CLOSE_SHEET_BTN).click();
  await expectSheetScreenInactive(page);
}

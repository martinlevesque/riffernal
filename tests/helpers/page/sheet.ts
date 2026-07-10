import { expect, type Page } from '@playwright/test';

// -- screen state ------------------------------------------------------------

/** Assert that the sheet screen is active. */
export async function expectSheetScreenActive(page: Page): Promise<void> {
  await expect(page.locator('#sheet-screen')).toHaveClass(/active/);
}

/** Assert that the sheet screen is NOT active. */
export async function expectSheetScreenInactive(page: Page): Promise<void> {
  await expect(page.locator('#sheet-screen')).not.toHaveClass(/active/);
}

// -- actions -----------------------------------------------------------------

/** Open the sheet view. */
export async function openSheet(page: Page): Promise<void> {
  await page.locator('#btn-open-sheet').click();
  await expectSheetScreenActive(page);
}

/** Close the sheet view. */
export async function closeSheet(page: Page): Promise<void> {
  await page.locator('#btn-close-sheet').click();
  await expectSheetScreenInactive(page);
}

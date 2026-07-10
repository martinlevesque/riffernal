import { test } from '@playwright/test';
import { startGame, expectPlayScreenActive, clickRestart, expectMenuScreenActive } from './helpers/index.js';

test.describe('Navigation', () => {
  test('retry restarts the game and shows play screen', async ({ page }) => {
    await startGame(page);
    await expectPlayScreenActive(page);
    await clickRestart(page);
    await expectPlayScreenActive(page);
  });

  test('back to menu shows menu screen', async ({ page }) => {
    await startGame(page);
    await expectPlayScreenActive(page);

    await page.evaluate(() => {
      const btn = document.getElementById('btn-menu');
      if (btn) btn.click();
    });

    await expectMenuScreenActive(page);
  });
});

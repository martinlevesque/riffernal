import { test } from '@playwright/test';
import { startGame, expectPlayScreenActive, clickRestart, clickBackToHome, expectHomeScreenActive } from './helpers/index.js';

test.describe('Navigation', () => {
  test('retry restarts the game and shows play screen', async ({ page }) => {
    await startGame(page);
    await expectPlayScreenActive(page);
    await clickRestart(page);
    await expectPlayScreenActive(page);
  });

  test('back to menu shows home screen', async ({ page }) => {
    await startGame(page);
    await expectPlayScreenActive(page);

    await clickBackToHome(page);

    await expectHomeScreenActive(page);
  });
});

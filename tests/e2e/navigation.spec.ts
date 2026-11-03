import { test } from '@playwright/test';
import {
  startGame,
  expectPlayScreenActive,
  clickRestart,
  clickBackToHome,
  expectMenuScreenActive,
} from '../helpers/index.js';

test.describe('Navigation', () => {
  test('retry restarts the game and shows play screen', async ({ page }) => {
    await startGame(page);
    await expectPlayScreenActive(page);
    await clickRestart(page);
    await expectPlayScreenActive(page);
  });

  test('back to menu shows freeplay screen when started from freeplay', async ({ page }) => {
    await startGame(page);
    await expectPlayScreenActive(page);

    await clickBackToHome(page);

    await expectMenuScreenActive(page);
  });
});

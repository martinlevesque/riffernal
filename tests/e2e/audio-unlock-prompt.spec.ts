import { expect, test } from '@playwright/test';
import { startGame, wipeDatabase } from '../helpers/index.js';

// Headless Chromium starts with audio unlocked, so emulate the browser's
// autoplay block: the context stays suspended until a keydown of the key `u`
// (clicks used by the navigation helpers must not unlock it).
async function emulateLockedAudio(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(() => {
    let unlocked = false;

    // the real flag turns true on the navigation clicks; emulate the block
    Object.defineProperty(Navigator.prototype, 'userActivation', {
      get: () => ({ hasBeenActive: unlocked, isActive: unlocked }),
    });
    const stateGetter = Object.getOwnPropertyDescriptor(BaseAudioContext.prototype, 'state')!.get!;
    const realResume = AudioContext.prototype.resume;

    Object.defineProperty(BaseAudioContext.prototype, 'state', {
      get() {
        return unlocked ? stateGetter.call(this) : 'suspended';
      },
    });
    AudioContext.prototype.resume = function () {
      return unlocked ? realResume.call(this) : new Promise<void>(() => {});
    };
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'u') unlocked = true;
      },
      true,
    );
  });
}

test.describe('Song start audio unlock prompt', () => {
  test.beforeEach(async ({ request }) => {
    await wipeDatabase(request);
  });

  test('asks for a key press or click and holds the song start while audio is blocked', async ({
    page,
  }) => {
    await emulateLockedAudio(page);
    await startGame(page, { keepSong: true, songTitle: 'AudioLockTest' });

    const popup = page.locator('#song-info-popup');
    const hint = page.locator('#song-info-sound-hint');

    await expect(popup).not.toHaveClass(/hidden/);
    await expect(hint).toBeVisible();

    // normally the popup closes itself after 4s
    await page.waitForTimeout(4500);
    await expect(popup).not.toHaveClass(/hidden/);

    await page.keyboard.press('u');
    await expect(popup).toHaveClass(/hidden/);
    await expect(hint).toBeHidden();
  });

  test('does not show the prompt when the page was clicked but audio starts slowly', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      let running = false;
      const stateGetter = Object.getOwnPropertyDescriptor(BaseAudioContext.prototype, 'state')!
        .get!;

      Object.defineProperty(BaseAudioContext.prototype, 'state', {
        get() {
          return running ? stateGetter.call(this) : 'suspended';
        },
      });
      AudioContext.prototype.resume = () =>
        new Promise<void>((resolve) =>
          setTimeout(() => {
            running = true;
            resolve();
          }, 1500),
        );
    });
    await startGame(page, { keepSong: true, songTitle: 'AudioSlowTest' });

    await expect(page.locator('#song-info-popup')).not.toHaveClass(/hidden/);
    await page.waitForTimeout(800);
    await expect(page.locator('#song-info-sound-hint')).toBeHidden();
  });

  test('does not show the prompt when audio is already allowed', async ({ page }) => {
    await startGame(page, { keepSong: true, songTitle: 'AudioOkTest' });

    await expect(page.locator('#song-info-popup')).not.toHaveClass(/hidden/);
    await expect(page.locator('#song-info-sound-hint')).toBeHidden();
  });
});

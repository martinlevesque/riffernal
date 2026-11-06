import { expect, type Page, test } from '@playwright/test';
import { startGame, seedSongWithNotes, wipeDatabase } from '../../helpers/index.js';

// Headless Chromium starts with audio unlocked, so emulate the browser's
// autoplay block: the context stays suspended until a trusted keydown of
// the key `u`. The app tracks user gestures itself from trusted events, so
// no emulation of navigator.userActivation is needed here.
async function emulateLockedAudio(page: Page): Promise<void> {
  await page.addInitScript(() => {
    let unlocked = false;

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
    document.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'u') unlocked = true;
      },
      true,
    );
  });
}

// Navigate to the song list and start the first song using synthetic events
// only: models a session that reached gameplay without any mouse key,
// keyboard key or touch (MIDI-only navigation).
async function startSongWithoutUserGesture(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('#home-screen').waitFor();
  await page.evaluate(() =>
    (document.querySelector('[data-mode="freeplay"]') as HTMLElement).click(),
  );
  await page.locator('.song-item').first().waitFor();
  await page.evaluate(() => {
    const el = document.querySelector('.song-item') as HTMLElement;
    el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  });
  await page.locator('#play-screen').waitFor({ state: 'attached' });
}

test.describe('Song start audio unlock prompt', () => {
  test.beforeEach(async ({ request }) => {
    await wipeDatabase(request);
    const notes = [];
    const keys = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'];
    for (let i = 0; i < 16; i++)
      notes.push({ time: 5.0 + i * 0.75, key: keys[i % keys.length], duration: 0.4 });
    await seedSongWithNotes(request, 'AudioPromptTest', notes);
  });

  test('shows the prompt for a session that used no mouse key or keyboard key', async ({
    page,
  }) => {
    await emulateLockedAudio(page);
    await startSongWithoutUserGesture(page);

    const popup = page.locator('#song-info-popup');
    const hint = page.locator('#song-info-sound-hint');

    await expect(hint).toBeVisible();

    // the hold suspends the normal 4s auto-hide
    await page.waitForTimeout(4500);
    await expect(popup).not.toHaveClass(/hidden/);

    await page.keyboard.press('u');
    await expect(popup).toHaveClass(/hidden/);
    await expect(hint).toBeHidden();
  });

  test('does not show the prompt when the mouse was used in previous menus', async ({ page }) => {
    // Emulate a browser whose Web Audio stays blocked even though clicks
    // happened, and that has no navigator.userActivation to consult: the
    // decision must come from the app's own gesture tracking.
    await emulateLockedAudio(page);
    await page.addInitScript(() => {
      delete (Navigator.prototype as any).userActivation;
    });

    await page.goto('/');
    await page.locator('#home-screen').waitFor();
    await page.locator('[data-mode="freeplay"]').click();
    await page.locator('.song-item').first().waitFor();
    await page.locator('.song-item').first().dblclick();
    await page.locator('#play-screen').waitFor({ state: 'attached' });

    await page.waitForTimeout(800);
    await expect(page.locator('#song-info-sound-hint')).toBeHidden();
    await expect(page.locator('#song-info-popup')).not.toHaveClass(/hidden/);

    // no hold engaged, so the normal 4s auto-hide still runs
    await page.waitForTimeout(3800);
    await expect(page.locator('#song-info-popup')).toHaveClass(/hidden/);
  });

  test('does not show the prompt when a key is pressed while audio is being probed', async ({
    page,
  }) => {
    await emulateLockedAudio(page);
    await startSongWithoutUserGesture(page);

    // trusted keydown right after the start, inside the ~500ms audio probe
    // window; it must be caught and count as a gesture
    await page.keyboard.press('Shift');

    await page.waitForTimeout(800);
    await expect(page.locator('#song-info-sound-hint')).toBeHidden();

    await page.waitForTimeout(3800);
    await expect(page.locator('#song-info-popup')).toHaveClass(/hidden/);
  });

  test('hides the prompt on a mouse click even when the context reports slowly', async ({
    page,
  }) => {
    await emulateLockedAudio(page);
    await startSongWithoutUserGesture(page);

    const hint = page.locator('#song-info-sound-hint');
    await expect(hint).toBeVisible();

    // the emulated context still reports suspended; the click is a gesture,
    // which is what unlocks audio in real browsers
    await page.mouse.click(640, 400);
    await expect(page.locator('#song-info-popup')).toHaveClass(/hidden/);
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

  test('does not show the prompt when a trusted click happened while the app was still booting', async ({
    page,
  }) => {
    await emulateLockedAudio(page);

    // main.js installs the gesture tracker when it evaluates. Stalling it
    // makes the trusted click below land after page load but before the
    // tracker exists: the browser counts it (sticky activation), the app's
    // own tracking misses it. Mirrors clicking during a slow page load.
    await page.route('**/js/main.js', async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });

    await page.goto('/', { waitUntil: 'commit' });

    // #home-screen is static HTML parsed ahead of the stalled module, so
    // its attach proves the head's inline gesture-tracking script is live.
    await page.locator('#home-screen').waitFor({ state: 'attached' });
    await page.mouse.click(512, 300);

    await page.locator('#home-screen').waitFor();
    await page.evaluate(() =>
      (document.querySelector('[data-mode="freeplay"]') as HTMLElement).click(),
    );
    await page.locator('.song-item').first().waitFor();
    await page.evaluate(() => {
      const el = document.querySelector('.song-item') as HTMLElement;
      el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });
    await page.locator('#play-screen').waitFor({ state: 'attached' });

    await expect(page.locator('#song-info-popup')).not.toHaveClass(/hidden/);
    await expect(page.locator('#song-info-sound-hint')).toBeHidden();

    // no hold engaged, so the normal 4s auto-hide still runs
    await page.waitForTimeout(3800);
    await expect(page.locator('#song-info-popup')).toHaveClass(/hidden/);
  });
});

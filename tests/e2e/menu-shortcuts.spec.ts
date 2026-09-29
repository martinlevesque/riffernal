import { test, expect, type APIRequestContext } from '@playwright/test';
import {
  authJsonHeaders,
  deleteSong,
  goToSongList,
  openSettings,
  seedSongWithNotes,
  wipeDatabase,
} from '../helpers/index.js';

// Computer-keyboard stand-ins for piano notes (see KEYBOARD_MAP):
// 'a' -> C3, 's' -> D3, 'd' -> E3, 'k' -> C4.

async function resetShortcuts(request: APIRequestContext): Promise<void> {
  const headers = await authJsonHeaders(request);
  await request.put('/api/user/settings', {
    data: { keyboard_menu_shortcuts: { prev: null, next: null, enter: null } },
    headers,
  });
}

async function bindShortcuts(
  request: APIRequestContext,
  shortcuts: { prev?: string; next?: string; enter?: string },
): Promise<void> {
  const headers = await authJsonHeaders(request);
  await request.put('/api/user/settings', {
    data: { keyboard_menu_shortcuts: shortcuts },
    headers,
  });
}

test.describe('Song list keyboard shortcuts', () => {
  test.beforeEach(async ({ request }: { request: APIRequestContext }) => {
    await wipeDatabase(request);
    await resetShortcuts(request);
  });

  test.afterEach(async ({ request }: { request: APIRequestContext }) => {
    await resetShortcuts(request);
  });

  test('navigates and starts songs with bound piano keys', async ({ request, page }) => {
    const idA = await seedSongWithNotes(request, 'Key Nav A', [{ time: 0.5, key: 'C4', duration: 1 }]);
    const idB = await seedSongWithNotes(request, 'Key Nav B', [{ time: 0.5, key: 'D4', duration: 1 }]);

    try {
      await bindShortcuts(request, { prev: 'C3', next: 'D3', enter: 'E3' });
      await goToSongList(page);

      const selected = page.locator('.song-item.selected');
      await expect(selected).toHaveCount(1, { timeout: 5000 });
      const initialTitle = await selected.textContent();

      // next (D3) moves the selection to the other song
      await page.keyboard.press('s');
      await expect(selected).not.toHaveText(initialTitle!);

      // prev (C3) moves it back
      await page.keyboard.press('a');
      await expect(selected).toHaveText(initialTitle!);

      // next twice with two songs wraps around to the start
      await page.keyboard.press('s');
      await page.keyboard.press('s');
      await expect(selected).toHaveText(initialTitle!);

      // enter (E3) starts the selected song like a double-click
      await page.keyboard.press('d');
      await expect(page.locator('#song-info-popup')).toBeVisible({ timeout: 5000 });
    } finally {
      await deleteSong(request, idA);
      await deleteSong(request, idB);
    }
  });

  test('rebinds a shortcut from the settings popup and persists it', async ({ request, page }) => {
    const idA = await seedSongWithNotes(request, 'Rebind A', [{ time: 0.5, key: 'C4', duration: 1 }]);
    const idB = await seedSongWithNotes(request, 'Rebind B', [{ time: 0.5, key: 'D4', duration: 1 }]);

    try {
      await page.goto('/');
      await openSettings(page);
      await page.locator('#btn-menu-shortcuts').click();
      await expect(page.locator('#shortcuts-popup')).toBeVisible();

      const nextRow = page.locator('.shortcut-row', { hasText: 'Right — next song' });
      await nextRow.click();
      await expect(nextRow.locator('.shortcut-key')).toHaveText('Play a key…');

      // bind 'k' (C4) as the next-song shortcut
      await page.keyboard.press('k');
      await expect(nextRow.locator('.shortcut-key')).toHaveText('C4');

      await page.locator('#btn-close-shortcuts').click();
      await page.locator('#btn-close-settings').click();

      // the new binding drives the song list
      await page.locator('[data-mode="freeplay"]').click();
      const selected = page.locator('.song-item.selected');
      await expect(selected).toHaveCount(1, { timeout: 5000 });
      const initialTitle = await selected.textContent();
      await page.keyboard.press('k');
      await expect(selected).not.toHaveText(initialTitle!);

      // persisted server-side: after reload the binding is still there
      await page.reload();
      await openSettings(page);
      await page.locator('#btn-menu-shortcuts').click();
      await expect(
        page.locator('.shortcut-row', { hasText: 'Right — next song' }).locator('.shortcut-key'),
      ).toHaveText('C4');
    } finally {
      await deleteSong(request, idA);
      await deleteSong(request, idB);
    }
  });

  test('rejects a note already bound to another shortcut', async ({ request, page }) => {
    await bindShortcuts(request, { prev: 'C3' });

    await page.goto('/');
    await openSettings(page);
    await page.locator('#btn-menu-shortcuts').click();

    const nextRow = page.locator('.shortcut-row', { hasText: 'Right — next song' });
    await nextRow.click();
    // 'a' is C3 — already bound to previous song
    await page.keyboard.press('a');
    await expect(nextRow.locator('.shortcut-key')).toHaveText('—');
  });
});

import { test } from '@playwright/test';
import {
  expectHomeScreenActive,
  expectHomeMidiStatus,
  expectHomeMidiDisconnected,
} from '../../helpers/index.js';

test.describe('Input device state (issue #114)', () => {
  test('home shows computer keyboard fallback when no MIDI device present', async ({ page }) => {
    await page.goto('/');
    await expectHomeScreenActive(page);
    await expectHomeMidiDisconnected(page);
    await expectHomeMidiStatus(page, 'Computer keyboard (no MIDI keyboard detected)');
  });
});

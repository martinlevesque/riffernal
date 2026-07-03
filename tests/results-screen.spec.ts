import { test, expect } from '@playwright/test';
import { startGame, makeSong, H } from './helpers.js';

async function speedUp(page: import('@playwright/test').Page): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await page.locator('#speed-up').click();
  }
}

async function waitForResults(page: import('@playwright/test').Page): Promise<void> {
  await expect(page.locator('#results-screen')).toHaveClass(/active/, { timeout: 120000 });
  await expect(page.locator('#result-grade')).not.toBeEmpty();
}

test.describe('Results Screen', () => {
  test('long missed note does not block game completion', async ({ page }) => {
    await page.goto('/');
    const songData = makeSong([
      { time: 1.0, key: 'C3', duration: 5.0 },
      { time: 2.0, key: 'E3', duration: 0.25 },
    ], 'Long Miss');

    const result = await page.evaluate(async ({ song, H }) => {
      // @ts-expect-error browser-side dynamic import
      const { NoteManager } = await import('/js/game/NoteManager.js');

      const nm = new NoteManager();
      nm.loadSong(song);

      // Activate both notes
      nm.update(0.5, H);
      // Both notes now missed (failing, NOT resolved)
      nm.update(1.2, H);
      nm.update(2.2, H);

      // Short note (E3) should resolve at 2.25 — before long note ends at 6.0
      nm.update(2.3, H);

      const afterShortResolves = {
        isComplete: nm.isComplete(),
        totalNotes: nm.notes.length,
        longNoteResolved: nm.notes[0].resolved,
        longNoteFailing: nm.notes[0].failing,
        shortNoteResolved: nm.notes[1].resolved,
      };

      // Intermediate frame — this is where _nextNoteIndex advances past
      // the unresolved long note (index 0) because the short note (index 1)
      // is already resolved, causing _nextNoteIndex to skip it
      nm.update(4.0, H);

      // Run past the long note's end
      nm.update(6.5, H);

      const afterLongEnds = {
        isComplete: nm.isComplete(),
        longNoteResolved: nm.notes[0].resolved,
      };

      return { afterShortResolves, afterLongEnds };
    }, { song: songData, H });

    // After the short note resolves, the long note should still be unresolved
    expect(result.afterShortResolves.shortNoteResolved).toBe(true);
    expect(result.afterShortResolves.longNoteResolved).toBe(false);
    expect(result.afterShortResolves.isComplete).toBe(false);

    // After the long note's duration ends, it should resolve and game should complete
    expect(result.afterLongEnds.longNoteResolved).toBe(true);
    expect(result.afterLongEnds.isComplete).toBe(true);
  });

  test('results screen appears after game completes naturally', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await startGame(page);
    await expect(page.locator('#play-screen')).toHaveClass(/active/, { timeout: 5000 });

    await speedUp(page);

    await waitForResults(page);
    expect(errors).toEqual([]);
  });

  test('results screen appears after retry', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await startGame(page);
    await expect(page.locator('#play-screen')).toHaveClass(/active/, { timeout: 5000 });

    await speedUp(page);
    await waitForResults(page);

    await page.locator('#btn-retry').click();
    await expect(page.locator('#play-screen')).toHaveClass(/active/, { timeout: 5000 });

    await waitForResults(page);
    expect(errors).toEqual([]);
  });

  test('results screen appears after multiple retries', async ({ page }) => {
    test.setTimeout(120000);
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await startGame(page);
    await expect(page.locator('#play-screen')).toHaveClass(/active/, { timeout: 5000 });

    await speedUp(page);

    for (let attempt = 0; attempt < 3; attempt++) {
      await waitForResults(page);
      await page.locator('#btn-retry').click();
      await expect(page.locator('#play-screen')).toHaveClass(/active/, { timeout: 5000 });
    }

    await waitForResults(page);
    expect(errors).toEqual([]);
  });

  test('play button is hidden after PLAY mode completion', async ({ page }) => {
    await startGame(page);
    await expect(page.locator('#play-screen')).toHaveClass(/active/, { timeout: 5000 });

    await speedUp(page);
    await waitForResults(page);

    await expect(page.locator('#btn-play')).not.toBeVisible();
  });

  test('play button is visible after LEARN mode completion', async ({ page }) => {
    await startGame(page);
    await expect(page.locator('#play-screen')).toHaveClass(/active/, { timeout: 5000 });

    await page.locator('#mode-learn').click();
    await expect(page.locator('#mode-learn')).toHaveClass(/active/);
    await page.locator('#mode-play').click();
    await expect(page.locator('#mode-play')).toHaveClass(/active/);

    await speedUp(page);
    await waitForResults(page);

    await expect(page.locator('#btn-play')).toBeVisible();
  });

  test('clicking play button restarts in PLAY mode', async ({ page }) => {
    await startGame(page);
    await expect(page.locator('#play-screen')).toHaveClass(/active/, { timeout: 5000 });

    await page.locator('#mode-learn').click();
    await expect(page.locator('#mode-learn')).toHaveClass(/active/);
    await page.locator('#mode-play').click();
    await expect(page.locator('#mode-play')).toHaveClass(/active/);

    await speedUp(page);
    await waitForResults(page);

    await expect(page.locator('#btn-play')).toBeVisible();
    await page.locator('#btn-play').click();

    await expect(page.locator('#play-screen')).toHaveClass(/active/, { timeout: 5000 });
    await expect(page.locator('#mode-play')).toHaveClass(/active/);
    await expect(page.locator('#mode-learn')).not.toHaveClass(/active/);
  });

  test('practice mode results show accuracy and note breakdown', async ({ page }) => {
    await startGame(page);
    await expect(page.locator('#play-screen')).toHaveClass(/active/, { timeout: 5000 });

    await page.locator('#mode-learn').click();
    await expect(page.locator('#mode-learn')).toHaveClass(/active/);
    await page.locator('#mode-play').click();
    await expect(page.locator('#mode-play')).toHaveClass(/active/);

    await speedUp(page);
    await waitForResults(page);

    await expect(page.locator('#result-grade')).toHaveText('PRACTICE');
    const stats = page.locator('#result-stats');
    await expect(stats).toContainText('Accuracy');
    await expect(stats).toContainText('%');
    await expect(stats).toContainText('Perfect');
    await expect(stats).toContainText('/');
    await expect(stats).toContainText('Great');
    await expect(stats).toContainText('Good');
    await expect(stats).toContainText('Miss');
    await expect(stats).toContainText('Max Combo');
    await expect(stats).toContainText('Score');
  });

  test('play mode results show stats without practice label', async ({ page }) => {
    await startGame(page);
    await expect(page.locator('#play-screen')).toHaveClass(/active/, { timeout: 5000 });

    await speedUp(page);
    await waitForResults(page);

    const grade = page.locator('#result-grade');
    await expect(grade).not.toHaveText('PRACTICE');
    const gradeText = await grade.textContent();
    expect(['S', 'A', 'B', 'C', 'D']).toContain(gradeText);

    const stats = page.locator('#result-stats');
    await expect(stats).toContainText('Score');
    await expect(stats).toContainText('Accuracy');
  });
});

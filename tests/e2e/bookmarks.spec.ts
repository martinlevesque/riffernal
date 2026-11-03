import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import {
  wipeDatabase,
  authHeaders,
  authJsonHeaders,
  uniqueUsername,
  registerUser,
  goToSongList,
} from '../helpers/index.js';

const MIDI_HEADER = [
  0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x01, 0x01, 0xe0,
];
const MIDI_TRACK = [
  0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20, 0x78, 0x90, 0x3c, 0x64, 0x78, 0x3c, 0x00, 0x00, 0xff,
  0x2f, 0x00,
];

function buildMidi(): Buffer {
  const len = MIDI_TRACK.length;
  const trackHeader = [
    0x4d,
    0x54,
    0x72,
    0x6b,
    (len >> 24) & 0xff,
    (len >> 16) & 0xff,
    (len >> 8) & 0xff,
    len & 0xff,
  ];
  return Buffer.from([...MIDI_HEADER, ...trackHeader, ...MIDI_TRACK]);
}

const FORM_FIELDS: Record<string, string> = {
  artist: 'Test',
  bpm: '120',
  difficulty: 'easy',
  notes: JSON.stringify([{ time: 0, key: 'C4', duration: 1 }]),
  tracks: '[]',
  selected_track_indices: '[]',
  track_hands: '{}',
  background_tracks: '[]',
};

async function createCategory(request: APIRequestContext, name: string): Promise<number> {
  const headers = await authJsonHeaders(request);
  const res = await request.post('/api/categories', { data: { name }, headers });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).id;
}

async function seedOwnSongInCategory(
  request: APIRequestContext,
  title: string,
  categoryId: number,
): Promise<number> {
  const headers = await authHeaders(request);
  const res = await request.post('/api/songs', {
    multipart: {
      ...FORM_FIELDS,
      title,
      category_id: String(categoryId),
      midi: { name: 'seed.mid', mimeType: 'audio/midi', buffer: buildMidi() },
    },
    headers,
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).id;
}

async function uploadAndPublishWith(
  request: APIRequestContext,
  token: string,
  title: string,
  categoryId: number,
): Promise<number> {
  const res = await request.post('/api/songs', {
    multipart: {
      ...FORM_FIELDS,
      title,
      category_id: String(categoryId),
      midi: { name: 'seed.mid', mimeType: 'audio/midi', buffer: buildMidi() },
    },
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.ok()).toBeTruthy();
  const id = (await res.json()).id;
  await request.put(`/api/songs/${id}/public-community`, {
    data: { publicCommunity: true },
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  return id;
}

async function deleteWith(request: APIRequestContext, token: string, id: number): Promise<void> {
  await request.delete(`/api/songs/${id}`, { headers: { Authorization: `Bearer ${token}` } });
}

async function categorySectionByTitle(
  page: Page,
  title: string,
): Promise<import('@playwright/test').Locator> {
  const headers = page.locator('.category-section:not(.community-section) .category-header');
  const count = await headers.count();
  for (let i = 0; i < count; i++) {
    const h = headers.nth(i);
    if ((await h.textContent())?.includes(title)) {
      return h.locator('..');
    }
  }
  return page.locator('.__not_found__');
}

test.describe('Bookmarked songs in categories', () => {
  test.beforeEach(async ({ request }: { request: APIRequestContext }) => {
    await wipeDatabase(request);
  });

  test('bookmarked community song appears in its category with Community label', async ({
    request,
    page,
  }) => {
    const publisher = await registerUser(request, uniqueUsername('bm_uicat'));
    let publishedId = -1;

    try {
      const catId = await createCategory(request, 'Metal');
      await seedOwnSongInCategory(request, 'E2E-BM-Own-Metal', catId);
      publishedId = await uploadAndPublishWith(
        request,
        publisher.token,
        'E2E-BM-Comm-Metal',
        catId,
      );

      await goToSongList(page);

      const communitySong = page.locator(
        `.community-section .community-song[data-song-id="${publishedId}"]`,
      );
      await expect(communitySong).toBeVisible({ timeout: 5000 });

      const bookmarkBtn = communitySong.locator('.bookmark-btn');
      await bookmarkBtn.click({ force: true });

      await expect(communitySong).toHaveCount(0, { timeout: 5000 });

      const metalSection = await categorySectionByTitle(page, 'Metal');
      await expect(metalSection).toBeVisible();
      const metalSongs = metalSection.locator('.song-item');
      await expect(metalSongs).toHaveCount(2, { timeout: 5000 });

      const movedSong = metalSection.locator(`.community-song[data-song-id="${publishedId}"]`);
      await expect(movedSong).toBeVisible();
      await expect(movedSong.locator('.song-community-label')).toBeVisible();
      await expect(movedSong.locator('.song-community-label')).toContainText('Community');
    } finally {
      if (publishedId !== -1) await deleteWith(request, publisher.token, publishedId);
    }
  });

  test('un-bookmarking moves the song back to the Community section', async ({ request, page }) => {
    const publisher = await registerUser(request, uniqueUsername('bm_uiunbm'));
    let publishedId = -1;

    try {
      const catId = await createCategory(request, 'Jazz');
      await seedOwnSongInCategory(request, 'E2E-BM-Own-Jazz', catId);
      publishedId = await uploadAndPublishWith(request, publisher.token, 'E2E-BM-Comm-Jazz', catId);

      await goToSongList(page);

      const communitySong = page.locator(
        `.community-section .community-song[data-song-id="${publishedId}"]`,
      );
      await expect(communitySong).toBeVisible({ timeout: 5000 });

      await communitySong.locator('.bookmark-btn').click({ force: true });
      await expect(communitySong).toHaveCount(0, { timeout: 5000 });

      const jazzSection = await categorySectionByTitle(page, 'Jazz');
      const movedSong = jazzSection.locator(`.community-song[data-song-id="${publishedId}"]`);
      await expect(movedSong).toBeVisible({ timeout: 5000 });

      await movedSong.locator('.bookmark-btn').click({ force: true });

      await expect(movedSong).toHaveCount(0, { timeout: 5000 });

      const backInCommunity = page.locator(
        `.community-section .community-song[data-song-id="${publishedId}"]`,
      );
      await expect(backInCommunity).toBeVisible({ timeout: 5000 });
    } finally {
      if (publishedId !== -1) await deleteWith(request, publisher.token, publishedId);
    }
  });
});

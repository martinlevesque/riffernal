import { test, expect, type APIRequestContext } from '@playwright/test';
import {
  wipeDatabase,
  cleanupSongs,
  seedSongWithNotes,
  publishSong,
  featureSong,
} from '../../helpers/index.js';

const SEED_NOTES = [{ time: 0, key: 'C4', duration: 1 }];

test.beforeAll(async ({ request }: { request: APIRequestContext }) => {
  await wipeDatabase(request);
});

test.describe('API: guest showcase', () => {
  test('GET /api/guest/showcase lists only featured songs, without auth', async ({ request }) => {
    // Matches both seeded titles; the first test here used to leak
    // E2E-Guest-Show-Plain because the pattern was anchored to full titles.
    await cleanupSongs(request, /^E2E-Guest-Show(-Plain)?$/);

    const featured = await seedSongWithNotes(request, 'E2E-Guest-Show', SEED_NOTES);
    const plain = await seedSongWithNotes(request, 'E2E-Guest-Show-Plain', SEED_NOTES);
    await publishSong(request, plain);
    await featureSong(request, featured);

    const res = await request.get('/api/guest/showcase');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const titles: string[] = body.songs.map((s: { title: string }) => s.title);
    expect(titles).toContain('E2E-Guest-Show');
    expect(titles).not.toContain('E2E-Guest-Show-Plain');

    const listed = body.songs.find((s: { title: string }) => s.title === 'E2E-Guest-Show');
    expect(listed.guestShowcase).toBe(true);
    expect(listed.bestScore).toBeNull();
    expect(listed.lastPlayedAt).toBeNull();

    await cleanupSongs(request, /^E2E-Guest-Show/);
  });

  test('GET /api/guest/showcase/:id returns the full song without auth', async ({ request }) => {
    await cleanupSongs(request, /^E2E-Guest-Show-Full$/);

    const id = await seedSongWithNotes(request, 'E2E-Guest-Show-Full', SEED_NOTES);
    await featureSong(request, id);

    const res = await request.get(`/api/guest/showcase/${id}`);
    expect(res.ok()).toBeTruthy();
    const song = await res.json();
    expect(song.id).toBe(id);
    expect(song.title).toBe('E2E-Guest-Show-Full');
    expect(song.guestShowcase).toBe(true);
    expect(Array.isArray(song.notes)).toBe(true);
    expect(song.notes.length).toBeGreaterThan(0);

    await cleanupSongs(request, /^E2E-Guest-Show-Full$/);
  });

  test('GET /api/guest/showcase/:id 404s for public community songs that are not featured', async ({
    request,
  }) => {
    await cleanupSongs(request, /^E2E-Guest-Show-Locked$/);

    // Public in the community sense, but not curated for guests.
    const id = await seedSongWithNotes(request, 'E2E-Guest-Show-Locked', SEED_NOTES);
    await publishSong(request, id);

    const res = await request.get(`/api/guest/showcase/${id}`);
    expect(res.status()).toBe(404);

    await cleanupSongs(request, /^E2E-Guest-Show-Locked$/);
  });

  test('GET /api/guest/showcase/:id 404s for unknown ids', async ({ request }) => {
    const res = await request.get('/api/guest/showcase/999999');
    expect(res.status()).toBe(404);
  });

  test('GET /api/guest/showcase/:id 400s for invalid ids', async ({ request }) => {
    const res = await request.get('/api/guest/showcase/abc');
    expect(res.status()).toBe(400);
  });
});

import { describe, test, expect, beforeEach } from 'bun:test';
import {
  setGuestSongStorage,
  MemoryGuestSongStorage,
  loadGuestSongs,
  addGuestSong,
  removeGuestSong,
  recordToSong,
  GUEST_SONG_LIMIT,
  type GuestSongInput,
  type GuestSongRecord,
} from '../../../../frontend/src/utils/guestStore.ts';
import { HandSide } from '../../../../frontend/src/utils/notes.ts';

const MIDI_HEADER = [0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x01, 0x01, 0xe0];

const MIDI_TRACK = [
  0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20,
  0x78, 0x90, 0x3c, 0x64,
  0x78, 0x3c, 0x00,
  0x00, 0xff, 0x2f, 0x00,
];

function midiBytes(): ArrayBuffer {
  const len = MIDI_TRACK.length;
  const trackHeader = [
    0x4d, 0x54, 0x72, 0x6b,
    (len >> 24) & 0xff, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff,
  ];
  return new Uint8Array([...MIDI_HEADER, ...trackHeader, ...MIDI_TRACK]).buffer;
}

function input(title: string): GuestSongInput {
  return {
    filename: `${title.toLowerCase().replace(/\s+/g, '-')}.mid`,
    midiBytes: midiBytes(),
    title,
    artist: 'Guest Artist',
    difficulty: 'hard',
    selectedTrackIndices: [0],
    trackHands: { 0: HandSide.Left },
    backgroundTracks: [],
  };
}

function record(inputData: GuestSongInput, key = 'gs_test', createdAt = 1): GuestSongRecord {
  return { ...inputData, key, createdAt };
}

describe('guestStore', () => {
  let storage: MemoryGuestSongStorage;

  beforeEach(() => {
    storage = new MemoryGuestSongStorage();
    setGuestSongStorage(storage);
  });

  test('add assigns negative ids in insertion order', async () => {
    const a = await addGuestSong(input('First'));
    const b = await addGuestSong(input('Second'));

    expect(a.id).toBe(-1);
    expect(b.id).toBe(-2);
    expect(a.title).toBe('First');
    expect(b.title).toBe('Second');
  });

  test('load rebuilds songs with deterministic negative ids', async () => {
    await addGuestSong(input('First'));
    await addGuestSong(input('Second'));

    // Simulate a fresh session (refresh): re-inject the same backend so the
    // persisted shelf is re-read while the session mapping is reset.
    setGuestSongStorage(storage);
    const songs = await loadGuestSongs();

    expect(songs.map((s) => s.id)).toEqual([-1, -2]);
    expect(songs.map((s) => s.title)).toEqual(['First', 'Second']);
    // Notes come from re-parsing the stored bytes, not from a cached DTO.
    expect(songs[0].notes.length).toBeGreaterThan(0);
  });

  test('load keeps insertion (createdAt) order regardless of storage order', async () => {
    await storage.add(record(input('Late'), 'gs_late', 200));
    await storage.add(record(input('Early'), 'gs_early', 100));

    setGuestSongStorage(storage);
    const songs = await loadGuestSongs();

    expect(songs.map((s) => s.title)).toEqual(['Early', 'Late']);
    expect(songs.map((s) => s.id)).toEqual([-1, -2]);
  });

  test('remove deletes by negative id and reload reassigns ids', async () => {
    await addGuestSong(input('First'));
    const second = await addGuestSong(input('Second'));
    await addGuestSong(input('Third'));

    expect(await removeGuestSong(second.id!)).toBe(true);
    expect(await removeGuestSong(-999)).toBe(false);

    setGuestSongStorage(storage);
    const songs = await loadGuestSongs();

    expect(songs.map((s) => s.title)).toEqual(['First', 'Third']);
    expect(songs.map((s) => s.id)).toEqual([-1, -2]);
  });

  test('add throws when the shelf is full', async () => {
    for (let i = 0; i < GUEST_SONG_LIMIT; i++) {
      await addGuestSong(input(`Song ${i}`));
    }

    await expect(addGuestSong(input('One Too Many'))).rejects.toThrow(/Guest shelf is full/);
    expect((await storage.list()).length).toBe(GUEST_SONG_LIMIT);
  });

  test('add counts what earlier sessions left behind', async () => {
    await storage.add(record(input('Old Import'), 'gs_old', 1));

    const fresh = await addGuestSong(input('New Import'));

    expect(fresh.id).toBe(-2);
    const songs = await loadGuestSongs();
    expect(songs.map((s) => s.title)).toEqual(['Old Import', 'New Import']);
  });

  test('recordToSong applies stored choices over the parse', () => {
    const song = recordToSong(record(input('Custom Title')), -3);

    expect(song.id).toBe(-3);
    expect(song.title).toBe('Custom Title');
    expect(song.artist).toBe('Guest Artist');
    expect(song.difficulty).toBe('hard');
    expect(song.selectedTrackIndices).toEqual([0]);
    expect(song.trackHands).toEqual({ 0: HandSide.Left });
    expect(song.imported).toBe(true);
    expect(song.publicCommunity).toBe(false);
    expect(song.guestShowcase).toBe(false);
    // The parse itself still drives the playable data.
    expect(song.notes.length).toBeGreaterThan(0);
    expect(song.bpm).toBeGreaterThan(0);
  });

  test('recordToSong copies arrays so song mutations cannot corrupt records', () => {
    const rec = record(input('Protected'));
    const song = recordToSong(rec, -1);

    song.selectedTrackIndices!.push(99);
    song.backgroundTracks!.push(5);

    expect(rec.selectedTrackIndices).toEqual([0]);
    expect(rec.backgroundTracks).toEqual([]);
  });

  test('recordToSong keeps the filename-derived title when the stored title is empty', () => {
    const rec = record({ ...input(''), filename: 'from-filename.mid' });
    const song = recordToSong(rec, -1);

    expect(song.title).toBe('from-filename');
  });
});

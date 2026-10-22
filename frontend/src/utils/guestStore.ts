// Guest library persistence: raw .mid bytes + import choices in IndexedDB,
// re-parsed into playable songs on boot. Guests never touch the server, so
// nothing here makes API calls. Songs get stable negative ids so the Menu's
// numeric-id plumbing (selection, keyboard nav, stats updates) works
// unchanged; the negative id maps back to the IndexedDB record key.

import { parseMidi, type Song } from './MidiParser.js';
import type { HandSide } from './notes.js';
import type { Difficulty } from '../game/difficulty.js';

/** Cap on stored guest songs: the guest shelf is a try-out, not a vault —
 *  registering is the way to keep a real library. */
export const GUEST_SONG_LIMIT = 20;

/** Mirror of the server's upload cap for guest-imported files. */
export const GUEST_MIDI_MAX_BYTES = 500 * 1024;

export interface GuestSongInput {
  filename: string;
  midiBytes: ArrayBuffer;
  title: string;
  artist: string;
  difficulty: Difficulty;
  selectedTrackIndices: number[];
  trackHands: Record<number, HandSide>;
  backgroundTracks: number[];
}

export interface GuestSongRecord extends GuestSongInput {
  key: string;
  createdAt: number;
}

/** Storage seam so the mapping logic is unit-testable without a browser:
 *  IndexedDB in the app, an in-memory fake under bun:test. */
export interface GuestSongStorage {
  list(): Promise<GuestSongRecord[]>;
  add(record: GuestSongRecord): Promise<void>;
  remove(key: string): Promise<void>;
}

export class MemoryGuestSongStorage implements GuestSongStorage {
  private _records: GuestSongRecord[] = [];

  async list(): Promise<GuestSongRecord[]> {
    return [...this._records];
  }

  async add(record: GuestSongRecord): Promise<void> {
    this._records.push(record);
  }

  async remove(key: string): Promise<void> {
    this._records = this._records.filter((r) => r.key !== key);
  }
}

const DB_NAME = 'riffernal-guest';
const STORE = 'songs';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function runTx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = run(tx.objectStore(STORE));

        tx.oncomplete = () => {
          db.close();
          resolve(request.result as T);
        };

        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      }),
  );
}

class IndexedDbGuestSongStorage implements GuestSongStorage {
  list(): Promise<GuestSongRecord[]> {
    return runTx<GuestSongRecord[]>('readonly', (store) => store.getAll());
  }

  add(record: GuestSongRecord): Promise<void> {
    return runTx('readwrite', (store) => store.add(record));
  }

  remove(key: string): Promise<void> {
    return runTx('readwrite', (store) => store.delete(key));
  }
}

let _storage: GuestSongStorage | null = null;
let _records: GuestSongRecord[] = [];
let _idToKey = new Map<number, string>();
let _lastId = 0;
let _loaded = false;

function storage(): GuestSongStorage {
  if (!_storage) {
    // Importable outside the browser (bun unit tests): fall back to memory
    // instead of throwing on a missing global.
    _storage =
      typeof indexedDB === 'undefined'
        ? new MemoryGuestSongStorage()
        : new IndexedDbGuestSongStorage();
  }

  return _storage;
}

/** Swap the storage backend and reset the in-session mapping (tests).
 *  Passing null restores the IndexedDB backend. */
export function setGuestSongStorage(storage: GuestSongStorage | null): void {
  _storage = storage;
  _records = [];
  _idToKey = new Map<number, string>();
  _lastId = 0;
  _loaded = false;
}

/** Build the playable Song for one record: parse the raw bytes fresh (notes,
 *  tracks, bpm all derive from the file), then apply the importer's stored
 *  choices. The negative id is the Menu-facing key. */
export function recordToSong(record: GuestSongRecord, id: number): Song {
  const song = parseMidi(record.midiBytes, record.filename);
  song.id = id;
  song.title = record.title || song.title;
  song.artist = record.artist || song.artist;
  song.difficulty = record.difficulty;
  song.selectedTrackIndices = [...record.selectedTrackIndices];
  song.trackHands = { ...record.trackHands };
  song.backgroundTracks = [...record.backgroundTracks];
  song.imported = true;
  song.trackPreferences = null;
  song.publicCommunity = false;
  song.guestShowcase = false;
  return song;
}

/** Read the guest shelf and rebuild the session mapping. Must run before
 *  addGuestSong/removeGuestSong so ids stay aligned with storage. Ids are
 *  reassigned deterministically on every load — callers get a fresh set of
 *  Song objects at the same time, so no stale references survive. */
export async function loadGuestSongs(): Promise<Song[]> {
  _records = (await storage().list()).sort((a, b) => a.createdAt - b.createdAt);
  _idToKey = new Map<number, string>();
  _lastId = 0;

  const songs: Song[] = [];

  for (const record of _records) {
    const id = _lastId - 1;
    _lastId = id;
    _idToKey.set(id, record.key);
    songs.push(recordToSong(record, id));
  }

  _loaded = true;
  return songs;
}

async function ensureLoaded(): Promise<void> {
  if (!_loaded) await loadGuestSongs();
}

/** Store a new guest import. Returns the playable song with its assigned
 *  negative id, or throws when the shelf is full. */
export async function addGuestSong(input: GuestSongInput): Promise<Song> {
  await ensureLoaded();

  if (_records.length >= GUEST_SONG_LIMIT) {
    throw new Error(
      `Guest shelf is full (${GUEST_SONG_LIMIT} songs) — create an account to keep more`,
    );
  }

  const record: GuestSongRecord = {
    ...input,
    key: `gs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
  };

  await storage().add(record);
  _records.push(record);

  const id = _lastId - 1;
  _lastId = id;
  _idToKey.set(id, record.key);
  return recordToSong(record, id);
}

/** Remove a guest song by its negative id. Returns false when no record
 *  matches (unknown/stale id). */
export async function removeGuestSong(id: number): Promise<boolean> {
  await ensureLoaded();

  const key = _idToKey.get(id);

  if (!key) return false;

  await storage().remove(key);
  _records = _records.filter((r) => r.key !== key);
  _idToKey.delete(id);
  return true;
}

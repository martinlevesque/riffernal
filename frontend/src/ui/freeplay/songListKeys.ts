import type { GameSettings } from "../../api/UserApi.js";

/** Piano note names (e.g. "C3", "F#4") bound to song-list menu actions.
 *  A binding is a set of notes played together as a chord; a single-note
 *  binding is just a chord of one. null means unbound. */
export type NoteBinding = string[] | null;

export interface SongListKeys {
  prev: NoteBinding;
  next: NoteBinding;
  enter: NoteBinding;
}

export type ShortcutAction = keyof SongListKeys;

const DEFAULT_SONG_LIST_KEYS: SongListKeys = { prev: null, next: null, enter: null };

let current: SongListKeys = { ...DEFAULT_SONG_LIST_KEYS };

export function getSongListKeys(): SongListKeys {
  return current;
}

export function setSongListKeys(patch: Partial<SongListKeys>): void {
  current = { ...current, ...patch };
}

export function resetSongListKeys(): void {
  current = { ...DEFAULT_SONG_LIST_KEYS };
}

/** Stable identity for a binding, used for equality between actions. */
export function bindingId(binding: NoteBinding): string {
  return [...(binding ?? [])].sort().join("+");
}

/** Deduplicate notes within one binding (sort order comes from bindingId). */
export function normalizeBinding(notes: Array<string | null | undefined>): NoteBinding {
  const seen = new Set<string>();

  for (const note of notes) {
    if (note) seen.add(note);
  }

  return seen.size > 0 ? [...seen].sort() : null;
}

/** Map persisted settings to bindings. Legacy values (a bare note string,
 *  e.g. "C3") degrade to a one-note chord; anything else falsy or
 *  non-array/empty degrades to unbound. */
export function resolveSongListKeys(settings: GameSettings): SongListKeys {
  const shortcuts = settings.keyboard_menu_shortcuts;

  const resolve = (value: string | string[] | null | undefined): NoteBinding => {
    if (typeof value === "string") return normalizeBinding([value]);
    if (Array.isArray(value)) return normalizeBinding(value);
    return null;
  };

  return {
    prev: resolve(shortcuts?.prev),
    next: resolve(shortcuts?.next),
    enter: resolve(shortcuts?.enter),
  };
}

const NOTE_ACTIONS: readonly ShortcutAction[] = ["prev", "next", "enter"];

/** Which shortcut action (if any) the held chord matches. Order-independent. */
export function matchSongListAction(keys: SongListKeys, heldNotes: string[]): ShortcutAction | null {
  const chord = bindingId(heldNotes);

  for (const action of NOTE_ACTIONS) {
    if (bindingId(keys[action]) === chord) return action;
  }

  return null;
}

/** Human-readable combo label, e.g. "C3 + D3" or "—" when unbound. */
export function formatBinding(binding: NoteBinding): string {
  return binding ? binding.join(" + ") : "—";
}

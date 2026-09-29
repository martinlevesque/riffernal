import type { GameSettings } from "../../api/UserApi.js";

/** Piano note names (e.g. "C3", "F#4") bound to song-list menu actions.
 *  null means unbound — the action has no shortcut. */
export interface SongListKeys {
  prev: string | null;
  next: string | null;
  enter: string | null;
}

const DEFAULT_SONG_LIST_KEYS: SongListKeys = { prev: null, next: null, enter: null };

let current: SongListKeys = { ...DEFAULT_SONG_LIST_KEYS };

export function getSongListKeys(): SongListKeys {
  return current;
}

export function setSongListKeys(patch: Partial<SongListKeys>): void {
  current = { ...current, ...patch };
}

/** Map persisted settings to bindings; anything falsy degrades to unbound. */
export function resolveSongListKeys(settings: GameSettings): SongListKeys {
  const shortcuts = settings.keyboard_menu_shortcuts;

  return {
    prev: shortcuts?.prev || null,
    next: shortcuts?.next || null,
    enter: shortcuts?.enter || null,
  };
}

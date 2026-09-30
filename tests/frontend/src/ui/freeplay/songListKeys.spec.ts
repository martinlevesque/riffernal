import { beforeEach, expect, test } from 'bun:test';
import {
  bindingId,
  formatBinding,
  getSongListKeys,
  matchSongListAction,
  resolveSongListKeys,
  resetSongListKeys,
  setSongListKeys,
} from '../../../../../frontend/src/ui/freeplay/songListKeys.ts';

beforeEach(() => {
  resetSongListKeys();
});

test('resolveSongListKeys defaults to unbound when no settings exist', () => {
  expect(resolveSongListKeys({})).toEqual({ prev: null, next: null, enter: null });
});

test('resolveSongListKeys passes bound notes through', () => {
  const resolved = resolveSongListKeys({
    keyboard_menu_shortcuts: { prev: ['C3'], next: ['D3'], enter: ['E3'] },
  });

  expect(resolved).toEqual({ prev: ['C3'], next: ['D3'], enter: ['E3'] });
});

test('resolveSongListKeys degrades falsy values to unbound', () => {
  const resolved = resolveSongListKeys({
    keyboard_menu_shortcuts: { prev: '', next: ['D3'] },
  });

  expect(resolved).toEqual({ prev: null, next: ['D3'], enter: null });
});

test('resolveSongListKeys accepts legacy single-note strings as one-note chords', () => {
  const resolved = resolveSongListKeys({
    keyboard_menu_shortcuts: { prev: 'C3', next: ['C3', 'D3'] },
  });

  expect(resolved).toEqual({ prev: ['C3'], next: ['C3', 'D3'], enter: null });
});

test('resolveSongListKeys dedupes and sorts chord notes', () => {
  const resolved = resolveSongListKeys({
    keyboard_menu_shortcuts: { next: ['D3', 'C3', 'D3'] },
  });

  expect(resolved.next).toEqual(['C3', 'D3']);
});

test('resolveSongListKeys treats empty arrays as unbound', () => {
  expect(resolveSongListKeys({ keyboard_menu_shortcuts: { next: [] } }).next).toBeNull();
});

test('setSongListKeys merges partial patches', () => {
  setSongListKeys({ next: ['D3'] });
  setSongListKeys({ enter: ['E3'] });

  expect(getSongListKeys()).toEqual({ prev: null, next: ['D3'], enter: ['E3'] });
});

test('bindingId is order-independent', () => {
  expect(bindingId(['D3', 'C3'])).toBe(bindingId(['C3', 'D3']));
});

test('bindingId treats unbound as empty', () => {
  expect(bindingId(null)).toBe('');
});

test('formatBinding renders a chord and the unbound placeholder', () => {
  expect(formatBinding(['C3', 'D3'])).toBe('C3 + D3');
  expect(formatBinding(null)).toBe('—');
});

test('matchSongListAction resolves the matching shortcut chord', () => {
  const keys = { prev: ['C3'], next: ['C3', 'D3'], enter: null };

  expect(matchSongListAction(keys, ['C3'])).toBe('prev');
  expect(matchSongListAction(keys, ['C3', 'D3'])).toBe('next');
  expect(matchSongListAction(keys, ['D3', 'C3'])).toBe('next');
  expect(matchSongListAction(keys, ['E3'])).toBeNull();
});

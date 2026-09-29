import { beforeEach, expect, test } from 'bun:test';
import {
  getSongListKeys,
  resolveSongListKeys,
  setSongListKeys,
} from '../../../../../frontend/src/ui/freeplay/songListKeys.ts';

beforeEach(() => {
  setSongListKeys({ prev: null, next: null, enter: null });
});

test('resolveSongListKeys defaults to unbound when no settings exist', () => {
  expect(resolveSongListKeys({})).toEqual({ prev: null, next: null, enter: null });
});

test('resolveSongListKeys passes bound notes through', () => {
  const resolved = resolveSongListKeys({
    keyboard_menu_shortcuts: { prev: 'C3', next: 'D3', enter: 'E3' },
  });

  expect(resolved).toEqual({ prev: 'C3', next: 'D3', enter: 'E3' });
});

test('resolveSongListKeys degrades falsy values to unbound', () => {
  const resolved = resolveSongListKeys({
    keyboard_menu_shortcuts: { prev: '', next: 'D3' },
  });

  expect(resolved).toEqual({ prev: null, next: 'D3', enter: null });
});

test('setSongListKeys merges partial patches', () => {
  setSongListKeys({ next: 'D3' });
  setSongListKeys({ enter: 'E3' });

  expect(getSongListKeys()).toEqual({ prev: null, next: 'D3', enter: 'E3' });
});

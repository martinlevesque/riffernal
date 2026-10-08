/** Shared focus model for shortcut-driven menus (home cards, song list,
 *  results buttons): one element carries FOCUS_CLASS at a time, and styling
 *  lives in pixel.css under `.nav-item.focused`. */

import { playMenuSound } from '../audio/MenuSounds.js';

export const NAV_ITEM_CLASS = 'nav-item';
export const FOCUS_CLASS = 'focused';

// Song items only get selected on click (double-click starts them), so their
// enter sound is played by the song list itself.
if (typeof document !== 'undefined') {
  document.addEventListener(
    'click',
    (e) => {
      const item = (e.target as Element | null)?.closest?.(`.${NAV_ITEM_CLASS}`);

      if (item && !item.classList.contains('song-item')) {
        playMenuSound('enter');
      }
    },
    true,
  );
}

export type NavAction = 'prev' | 'next' | 'enter';

export function focusedItem(items: HTMLElement[]): HTMLElement | undefined {
  return items.find((el) => el.classList.contains(FOCUS_CLASS));
}

export function setFocused(items: Iterable<HTMLElement>, target: HTMLElement | null): void {
  for (const el of items) {
    el.classList.toggle(FOCUS_CLASS, el === target);
  }
}

/** Move the focus by `delta` with wrap-around; returns the newly focused item. */
export function stepFocus(items: HTMLElement[], delta: number): HTMLElement | null {
  if (items.length === 0) return null;

  const current = items.findIndex((el) => el.classList.contains(FOCUS_CLASS));
  const next = items[(current + delta + items.length) % items.length];

  if (next !== items[current]) {
    playMenuSound(delta > 0 ? 'next' : 'prev');
  }

  setFocused(items, next);

  return next;
}

/** prev/next move the focus; enter clicks the focused item. */
export function runNavAction(items: HTMLElement[], action: NavAction): void {
  if (action === 'enter') {
    focusedItem(items)?.click();
    return;
  }

  stepFocus(items, action === 'next' ? 1 : -1);
}

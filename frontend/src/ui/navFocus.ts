/** Shared focus model for shortcut-driven menus (home cards, song list,
 *  results buttons): one element carries FOCUS_CLASS at a time, and styling
 *  lives in pixel.css under `.nav-item.focused`. */

export const NAV_ITEM_CLASS = 'nav-item';
export const FOCUS_CLASS = 'focused';

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

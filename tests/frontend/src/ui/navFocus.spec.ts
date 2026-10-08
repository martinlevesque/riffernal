import { beforeEach, expect, mock, test } from 'bun:test';

const played: string[] = [];

mock.module('../../../../frontend/src/audio/MenuSounds.js', () => ({
  playMenuSound: (sound: string) => played.push(sound),
}));

let clickListener: ((e: unknown) => void) | undefined;

(globalThis as any).document = {
  addEventListener: (type: string, fn: (e: unknown) => void) => {
    if (type === 'click') clickListener = fn;
  },
};

const { FOCUS_CLASS, runNavAction, stepFocus } = await import(
  '../../../../frontend/src/ui/navFocus.js'
);

interface FakeItem {
  classList: { contains(c: string): boolean; toggle(c: string, on: boolean): void };
  clicked: number;
  click(): void;
}

function makeItem(focused = false): FakeItem {
  let on = focused;

  return {
    classList: {
      contains: (c) => c === FOCUS_CLASS && on,
      toggle: (c, force) => {
        if (c === FOCUS_CLASS) on = force;
      },
    },
    clicked: 0,
    click() {
      this.clicked++;
    },
  };
}

const asEls = (items: FakeItem[]) => items as any[];

beforeEach(() => {
  played.length = 0;
});

test('stepFocus ticks with direction when focus moves', () => {
  const items = [makeItem(true), makeItem(), makeItem()];

  stepFocus(asEls(items), 1);
  stepFocus(asEls(items), -1);

  expect(played).toEqual(['next', 'prev']);
});

test('stepFocus is silent when there is nowhere to move', () => {
  const items = [makeItem(true)];

  stepFocus(asEls(items), 1);

  expect(played).toEqual([]);
});

test('enter clicks the focused item', () => {
  const items = [makeItem(), makeItem(true)];

  runNavAction(asEls(items), 'enter');

  expect(items[1].clicked).toBe(1);
  expect(items[0].clicked).toBe(0);
});

function clickOn(classes: string[]): void {
  clickListener?.({
    target: { closest: () => ({ classList: { contains: (c: string) => classes.includes(c) } }) },
  });
}

test('clicking a nav item plays the enter sound', () => {
  clickOn(['nav-item']);

  expect(played).toEqual(['enter']);
});

test('clicking a song item does not play the enter sound (selection only)', () => {
  clickOn(['nav-item', 'song-item']);

  expect(played).toEqual([]);
});

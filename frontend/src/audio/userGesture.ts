/** Tracks whether the user ever interacted with the page using an input
 *  device the browser accepts for unlocking audio (mouse button, keyboard
 *  key, touch). MIDI input does not count.
 *
 *  `navigator.userActivation` exposes the same sticky state, but it is
 *  missing in some browsers and untrue in automation runtimes, so the app
 *  tracks it from the same trusted events that actually unblock audio.
 *  Synthetic events (`isTrusted === false`, e.g. scripted clicks) are
 *  ignored to mirror real browser activation semantics. */

const GESTURE_EVENTS = ['pointerdown', 'mousedown', 'keydown', 'touchstart'] as const;

let gestured = false;
let installed = false;

export function installUserGestureTracking(): void {
  if (installed) return;
  installed = true;

  const mark = (e: Event) => {
    if (!e.isTrusted) return;
    gestured = true;
  };

  for (const type of GESTURE_EVENTS) {
    document.addEventListener(type, mark, true);
  }
}

export function hasUserGestured(): boolean {
  return gestured;
}

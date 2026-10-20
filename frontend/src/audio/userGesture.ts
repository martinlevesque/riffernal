/** Tracks whether the user ever interacted with the page using an input
 *  device the browser accepts for unlocking audio (mouse button, keyboard
 *  key, touch). MIDI input does not count.
 *
 *  These listeners install when the app boots; index.html installs a twin
 *  writer that sets the same flag before any deferred script runs, so
 *  gestures landing during page load still count. `navigator.userActivation`
 *  would skip all of that, but it is missing in some browsers and untrue in
 *  automation runtimes.
 *  Synthetic events (`isTrusted === false`, e.g. scripted clicks) are
 *  ignored to mirror real browser activation semantics. */

declare global {
  interface Window {
    __userGestured?: boolean;
  }
}

const GESTURE_EVENTS = ['pointerdown', 'mousedown', 'keydown', 'touchstart'] as const;

let gestured = false;
let installed = false;

export function installUserGestureTracking(): void {
  if (installed) return;
  installed = true;

  const mark = (e: Event) => {
    if (!e.isTrusted) return;
    gestured = true;
    window.__userGestured = true;
  };

  for (const type of GESTURE_EVENTS) {
    document.addEventListener(type, mark, true);
  }
}

export function hasUserGestured(): boolean {
  return gestured || window.__userGestured === true;
}

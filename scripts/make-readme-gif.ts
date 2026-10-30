import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Locator, type Page } from '@playwright/test';
import { applyPalette, GIFEncoder, quantize } from 'gifenc';
import { PNG } from 'pngjs';

/** 1440×800 is the smallest common desktop size where the play screen's
 *  top HUD fits on one row and the piano key labels stay readable. */
const VIEW_WIDTH = 1440;

const VIEW_HEIGHT = 800;

const APP_URL = 'https://localhost:3000/';

const TYPE_DELAY_MS = 45;

const HOME_SETTLE_MS = 1400;

/** Time on screen before toggling "Show only keys used in song" so the
 *  settings card and its theme list have rendered. */
const SETTINGS_SETTLE_MS = 1000;

/** Frames between the toggle and its close so the checked state is caught
 *  by the capture loop. */
const SETTING_TOGGLE_HOLD_MS = 700;

const MENU_HOLD_MS = 2200;

const SONG_INFO_SETTLE_MS = 1300;

const GAMEPLAY_HOLD_MS = 5500;

const BACH_MENU_SETTLE_MS = 1500;

const BACH_HOLD_MS = 15000;

/** Presses land within this game-time difference of the note (seconds). */
const PRESS_LOOKAHEAD_S = 0.01;

/** Skip pressing once the note is missed past this game-time difference. */
const LATE_PRESS_WINDOW_S = 0.15;

/** Hold-key releases fire this far past the note end so the game clock has
 *  crossed the boundary before the release lands. */
const KEYUP_GRACE_MS = 40;

/** Seconds of pressing past the gameplay hold, while the capture winds
 *  down, so the notes still on screen do not scroll out unpressed. */
const PRESS_TAIL_S = 0.45;

const CAPTURE_INTERVAL_MS = 150;

const MIN_DELAY_MS = 40;

const MAX_COLORS = 255;

/** Title fragments matching the two demo songs. The library menu sorts
 *  categories by last play time, which every run updates, so picking rows
 *  positionally flips which song is first between runs. */
const FIRST_SONG_MATCH = 'Where is my mind?';
const SECOND_SONG_MATCH = 'BWV menuet in c';

const OUTPUT_PATH = path.resolve(import.meta.dir, '..', 'public', 'images', 'demo.gif');

interface Capture {
  png: Buffer;
  shown: number;
}

interface KeptFrame {
  data: Buffer;
  delayMs: number;
}

/* Serialized into the browser, so every constant it needs lives inside. */
function installCursor(page: Page): void {
  page.addInitScript(() => {
    const boot = () => {
      const style = document.createElement('style');
      style.textContent = `
        .gif-cursor {
          position: fixed;
          width: 14px;
          height: 14px;
          background: #f5f5ff;
          border: 3px solid #10101a;
          box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.25);
          z-index: 2147483647;
          pointer-events: none;
          transform: translate(-50%, -50%);
          opacity: 0;
          transition: opacity 0.12s ease-out;
        }
        .gif-ripple {
          position: fixed;
          width: 44px;
          height: 44px;
          border: 4px solid #f5f5ff;
          outline: 2px solid #10101a;
          box-sizing: border-box;
          z-index: 2147483646;
          pointer-events: none;
          transform: translate(-50%, -50%) scale(0.2);
          opacity: 0.9;
          animation: gif-ripple 400ms ease-out forwards;
        }
        @keyframes gif-ripple {
          to {
            transform: translate(-50%, -50%) scale(1.35);
            opacity: 0;
          }
        }
      `;
      document.head.appendChild(style);

      const dot = document.createElement('div');
      dot.className = 'gif-cursor';
      document.body.appendChild(dot);

      const place = (x: number, y: number) => {
        dot.style.left = `${x}px`;
        dot.style.top = `${y}px`;
        dot.style.opacity = '1';
      };

      document.addEventListener('mousemove', (e) => place(e.clientX, e.clientY), true);

      document.addEventListener(
        'mousedown',
        (e) => {
          const ripple = document.createElement('div');
          ripple.className = 'gif-ripple';
          ripple.style.left = `${e.clientX}px`;
          ripple.style.top = `${e.clientY}px`;
          document.body.appendChild(ripple);
          setTimeout(() => ripple.remove(), 450);
        },
        true,
      );
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  });
}

function readFlag(args: string[], flag: string): string | null {
  const index = args.indexOf(flag);

  if (index === -1 || index + 1 >= args.length) return null;

  return args[index + 1] as string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Presses the song's own note schedule against the live game clock. The
 *  whole driver runs in-page (string evaluate, plain JS) so press timing is
 *  immune to the concurrent capture loop: Node-side CDP presses land far
 *  too late while page.screenshot is hogging the CDP channel. Dispatching
 *  window KeyboardEvents reaches KeyboardInput the same way a physical key
 *  does. The driver rides requestAnimationFrame — the game's own frame
 *  scheduler keeps ticking through the capture screenshots, while
 *  setInterval timers are silently throttled under the CDP load, which
 *  pushes presses past the timing window and the song fills with Miss.
 *
 *  The computer-keyboard map covers C2–E4 and C5–B5, so notes between
 *  E4 and C5 (F4–B4) have no key. The game's own octave-agnostic option
 *  resolves presses by pitch class, which lets the demo press the nearest
 *  free octave for such notes instead of dropping them. Once every note in
 *  the window is down, the driver freezes the clock so the capture's last
 *  frames cannot paint an unpressed note's Miss. */
async function autoPlay(page: Page, holdMs: number): Promise<void> {
  const presses = (await page.evaluate(
    `(async () => {
      const game = window._game;
      if (!game || !game.noteManager) return 0;

      game.octaveAgnostic = false;

      const map = (await import('/js/input/KeyboardInput.js')).KEYBOARD_MAP;
      const codeFor = new Map();

      for (const [code, note] of Object.entries(map)) codeFor.set(note, code);

      const SEMITONES = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
      const NOTE_RE = /^([A-G]#?)(\\d)$/;
      const pitchClass = (note) => NOTE_RE.exec(note)?.[1] ?? null;
      const perClass = new Map();
      const laneOfCode = new Map();

      for (const note of codeFor.keys()) {
        const cls = pitchClass(note);

        if (!cls) continue;

        const match = NOTE_RE.exec(note);
        const midi = SEMITONES[cls] + (Number(match[2]) + 1) * 12;

        if (!perClass.has(cls)) perClass.set(cls, []);

        perClass.get(cls).push({ code: codeFor.get(note), midi });
        /* NOTE_NAMES starts with A0, so a note's piano lane index is
         * 3 + (octave - 1) * 12 + its semitone offset. */
        laneOfCode.set(codeFor.get(note), 3 + (Number(match[2]) - 1) * 12 + SEMITONES[cls]);
      }

      /* Keys currently down (code → { end: note end in game time, fold:
       * whether the press rides octave-agnostic matching }). A physical
       * key can only be pressed once at a time, so neither the direct key
       * nor a fold may reuse one while its hold is still down — a second
       * keydown on the same code is dropped by KeyboardInput. */
      const held = new Map();

      const codeForNote = (note) => {
        const direct = codeFor.get(note);
        const cls = pitchClass(note);
        const match = NOTE_RE.exec(note);

        if (!cls) return { code: direct ?? null, fold: false };

        const midi = SEMITONES[cls] + (Number(match[2]) + 1) * 12;
        let best = null;
        let bestDist = Infinity;

        for (const option of perClass.get(cls) ?? []) {
          if (held.has(option.code)) continue;

          const dist = Math.abs(option.midi - midi);

          if (dist < bestDist) {
            bestDist = dist;
            best = option.code;
          }
        }

        if (!best) return { code: null, fold: false };

        return { code: best, fold: !direct || best !== direct };
      };

      const start = game.currentTime;
      const horizon = start + ${holdMs} / 1000 + ${PRESS_TAIL_S};
      const pending = new Set(
        game.noteManager.notes.filter(
          (note) =>
            note.selected
            && !note.autoPlayed
            && note.lane >= 0
            && pitchClass(note.key)
            && note.time > start - ${LATE_PRESS_WINDOW_S}
            && note.time <= horizon,
        ),
      );
      let pressed = 0;

      await new Promise((resolve) => {
        const stroke = () => {
          const now = game.currentTime;

          /* Keyups go out with agnostic matching off, so a release can
           * only ever cut a hold sitting on the released key's own lane —
           * including a fold's hold registered on the same lane as the
           * direct note — so every release waits until that lane holds
           * nothing. Fold holds resolve on their own at their note end. */
          for (const [code, info] of [...held]) {
            if (now < info.end) continue;

            const lane = laneOfCode.get(code);

            const onLane = game.noteManager.notes.some(
              (n) => n.holding && !n.resolved && n.lane === lane && n.time + n.duration > now,
            );

            if (onLane) continue;

            game.octaveAgnostic = false;

            window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
            held.delete(code);
          }

          for (const note of pending) {
            if (note.time - now > ${PRESS_LOOKAHEAD_S}) continue;
            if (note.hit || note.missed || note.resolved) {
              pending.delete(note);
              continue;
            }

            const pick = codeForNote(note.key);

            if (pick.code === null) {
              pending.delete(note);
              continue;
            }

            game.octaveAgnostic = pick.fold;

            window.dispatchEvent(new KeyboardEvent('keydown', { code: pick.code, bubbles: true }));
            held.set(pick.code, { end: note.time + note.duration + ${KEYUP_GRACE_MS} / 1000 });
            pressed++;
            pending.delete(note);
          }

          if (pending.size === 0 || now > horizon) {
            /* Freeze the clock the moment the last note is pressed:
             * whatever still scrolls in explodes into Miss otherwise, and
             * freezing keeps the capture tail on a clean mid-song frame. */
            game.pause();
            resolve(undefined);
            return;
          }

          if (now > horizon + 3) {
            game.pause();
            resolve(undefined);
            return;
          }

          requestAnimationFrame(stroke);
        };

        requestAnimationFrame(stroke);
      });

      return pressed;
    })()`,
  )) as number;

  if (presses === 0) {
    console.error('autoplay: no notes were pressed');
  } else {
    console.log(`autoplay: ${presses} notes pressed`);
  }
}

function buildFrames(captures: Capture[]): KeptFrame[] {
  const frames: KeptFrame[] = [];
  const spans = new Array<number>(captures.length).fill(0);

  for (let i = 0; i < captures.length - 1; i++) spans[i] = captures[i + 1]!.shown - captures[i]!.shown;

  if (captures.length > 1) spans[captures.length - 1] = spans[captures.length - 2]!;

  for (let i = 0; i < captures.length; i++) {
    const png = PNG.sync.read(captures[i]!.png);
    const data = png.data;

    if (frames.length > 0 && frames[frames.length - 1]!.data.equals(data)) {
      frames[frames.length - 1]!.delayMs += spans[i]!;
      continue;
    }

    frames.push({ data, delayMs: spans[i]! });
  }

  return frames;
}

function buildGlobalPalette(frames: KeptFrame[]): number[][] {
  const step = Math.max(1, Math.floor(frames.length / 12));
  const samples: Uint8Array[] = [];

  for (let i = 0; i < frames.length; i += step) samples.push(frames[i]!.data);

  return quantize(Buffer.concat(samples), MAX_COLORS, { format: 'rgb565' });
}

function encodeGif(frames: KeptFrame[], width: number, height: number): Uint8Array {
  const gif = GIFEncoder();
  const palette = buildGlobalPalette(frames);
  const transparentIndex = palette.length;

  if (transparentIndex > 255) {
    console.error('palette overflow: no spare slot for the transparency index');
    process.exit(1);
  }

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i]!;
    const index = applyPalette(frame.data, palette, 'rgb565');
    const delay = Math.max(MIN_DELAY_MS, frame.delayMs);

    if (i === 0) {
      gif.writeFrame(index, width, height, { palette, delay, repeat: 0 });
      continue;
    }

    const previous = frames[i - 1]!.data;
    pixel: for (let px = 0; px < index.length; px++) {
      const offset = px * 4;
      for (let channel = 0; channel < 4; channel++) {
        if (previous[offset + channel] !== frame.data[offset + channel]) continue pixel;
      }
      index[px] = transparentIndex;
    }

    gif.writeFrame(index, width, height, {
      delay,
      transparent: true,
      transparentIndex,
      dispose: 1,
    });
  }

  gif.finish();
  return gif.bytes();
}

function songLocator(page: Page, title: string): Locator {
  return page.locator('.song-item', { hasText: title }).first();
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const user = readFlag(args, '--user');
  const password = readFlag(args, '--password');

  if (!user || !password) {
    console.error('usage: bun run scripts/make-readme-gif.ts --user <username> --password <password>');
    process.exit(1);
  }

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: VIEW_WIDTH, height: VIEW_HEIGHT },
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  installCursor(page);

  const captures: Capture[] = [];
  let stop = false;

  await page.goto(APP_URL, { waitUntil: 'load' });
  await page.locator('#auth-username').waitFor({ state: 'visible' });
  await sleep(600);

  const captureLoop = (async () => {
    while (!stop) {
      const shown = performance.now();

      try {
        const png = await page.screenshot({ type: 'png' });
        captures.push({ png, shown });
      } catch (err) {
        if (!stop) {
          console.error('capture failed:', err);
          await sleep(60);
        }
      }

      const elapsed = performance.now() - shown;
      if (elapsed < CAPTURE_INTERVAL_MS) await sleep(CAPTURE_INTERVAL_MS - elapsed);
    }
  })();

  try {
    await page.locator('#auth-username').hover();
    await sleep(400);

    await page.locator('#auth-username').pressSequentially(user, { delay: TYPE_DELAY_MS });
    await sleep(200);

    await page.locator('#auth-password').pressSequentially(password, { delay: TYPE_DELAY_MS });
    await sleep(400);

    await page.locator('#auth-submit').click();
    await page.locator('#home-screen').waitFor({ state: 'visible' });
    await sleep(HOME_SETTLE_MS);

    /* Enable "Show only keys used in song": the demo's piano then zooms in
     * on the pieces' own ranges, which reads much better at arm's length. */
    await page.locator('[data-mode="settings"]').click();
    const settingsPopup = page.locator('#settings-popup');
    await settingsPopup.waitFor({ state: 'visible', timeout: 6000 });
    await sleep(SETTINGS_SETTLE_MS);
    await page.locator('#show-used-keys').check();
    await sleep(SETTING_TOGGLE_HOLD_MS);
    await page.locator('#btn-close-settings').click();
    await settingsPopup.waitFor({ state: 'hidden', timeout: 6000 });

    await page.locator('[data-mode="freeplay"]').click();
    await page.locator('#freeplay-screen').waitFor({ state: 'visible' });
    await songLocator(page, FIRST_SONG_MATCH).waitFor({ state: 'visible', timeout: 6000 }).catch(() => {});
    await sleep(MENU_HOLD_MS);

    await songLocator(page, FIRST_SONG_MATCH).dblclick();
    await page.locator('#song-info-popup').waitFor({ state: 'visible', timeout: 6000 });
    await sleep(SONG_INFO_SETTLE_MS);

    await page.locator('#btn-close-song-info').click();
    await page.locator('#song-info-popup').waitFor({ state: 'hidden', timeout: 6000 });
    await autoPlay(page, GAMEPLAY_HOLD_MS);

    // Back to the song list in-app (game.backToMenu re-opens freeplay for a
    // song started from the same list), so the second song reads as one
    // continuous session: a full page reload would reboot through the home
    // screen and make the demo look like it logs in twice.
    await page.evaluate(`window._game?.backToMenu()`);
    await page.locator('#freeplay-screen').waitFor({ state: 'visible' });
    await songLocator(page, SECOND_SONG_MATCH).waitFor({ state: 'visible', timeout: 6000 }).catch(() => {});
    await sleep(BACH_MENU_SETTLE_MS);

    await songLocator(page, SECOND_SONG_MATCH).dblclick();
    await page.locator('#song-info-popup').waitFor({ state: 'visible', timeout: 6000 });
    await sleep(SONG_INFO_SETTLE_MS);

    await page.locator('#btn-close-song-info').click();
    await page.locator('#song-info-popup').waitFor({ state: 'hidden', timeout: 6000 });
    await autoPlay(page, BACH_HOLD_MS);
  } finally {
    stop = true;
    await captureLoop;
    await browser.close();
  }

  if (captures.length < 2) {
    console.error('not enough captures to build a gif');
    process.exit(1);
  }

  const frames = buildFrames(captures);
  const first = PNG.sync.read(captures[0]!.png);
  const bytes = encodeGif(frames, first.width, first.height);

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, bytes);

  let durationMs = 0;

  for (const frame of frames) durationMs += Math.max(MIN_DELAY_MS, frame.delayMs);

  console.log(`captures: ${captures.length}`);
  console.log(`frames:   ${frames.length}`);
  console.log(`duration: ${(durationMs / 1000).toFixed(1)}s`);
  console.log(`size:     ${(bytes.length / 1024 / 1024).toFixed(2)}MB`);
  console.log(`output:   ${OUTPUT_PATH}`);
}

main();

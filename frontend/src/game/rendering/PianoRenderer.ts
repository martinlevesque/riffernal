// Piano keyboard and hit-zone indicator rendering with off-screen
// cache. The static layer (keys, borders, labels, idle indicator bars)
// is cached and only rebuilt on resize/range/theme changes; pressed-key
// feedback is drawn live per frame over it, so key presses cost a few
// rects instead of a full piano repaint.

import { NOTE_NAMES, handColor, getPianoKeyLayout, BLACK_KEY_WIDTH_RATIO, NOTE_SHORT_NAMES, whiteKeyWidth } from '../../utils/notes.js';
import type { VisibleRange } from '../../utils/notes.js';
import { HIT_ZONE_Y_RATIO } from '../NoteManager.js';
import { themeManager } from '../../themes/ThemeManager.js';
import { velocityIntensity } from '../../utils/helpers.js';
import { NOTE_TO_KEY_LABEL } from '../../input/KeyboardInput.js';

const PIANO_REGION_OFFSET = 30;
const BLACK_KEY_HEIGHT_RATIO = 0.56;
const PIANO_HEIGHT_RATIO = 0.16;
const INDICATOR_REGION_H = 34;

/** How long a wrong-key flash stays lit (fading to 0) after the press. */
const WRONG_KEY_FLASH_MS = 500;

/** Gap between the indicator bar's bottom edge and the hit line. The
 *  falling note docks its visible bottom edge onto the bar's bottom edge,
 *  so the note renderer needs the same value. */
export const INDICATOR_BAR_OFFSET = 4;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

export class PianoRenderer {
  private _cache: HTMLCanvasElement | null = null;
  private _cachedKey = '';
  showComputerKeys = false;
  /** Lane -> flash start (ms). Wrong presses (learn mode) light the key
   *  red; entries fade out and are pruned during the draw passes. */
  private _wrongFlashes = new Map<number, number>();

  flashWrongKey(lane: number, nowMs: number = performance.now()): void {
    this._wrongFlashes.set(lane, nowMs);
  }

  private _wrongFlashAlpha(nowMs: number, startMs: number): number {
    const age = nowMs - startMs;

    if (age < 0) return 0;

    return Math.max(0, 1 - age / WRONG_KEY_FLASH_MS);
  }

  private _pruneWrongFlashes(nowMs: number): void {
    for (const [lane, startMs] of this._wrongFlashes) {
      if (nowMs - startMs > WRONG_KEY_FLASH_MS) this._wrongFlashes.delete(lane);
    }
  }

  private _inRange(i: number, visibleRange?: VisibleRange | null): boolean {
    return !visibleRange || (i >= visibleRange.minNoteIdx && i <= visibleRange.maxNoteIdx);
  }

  drawHitZone(ctx: CanvasRenderingContext2D, width: number, height: number, pressedLanes: Map<number, number>, visibleRange?: VisibleRange | null, nowMs: number = performance.now()): void {
    const hitZoneY = height * HIT_ZONE_Y_RATIO;
    const offsetY = hitZoneY - PIANO_REGION_OFFSET;
    this._ensureCache(width, height, visibleRange);
    if (this._cache) {
      ctx.drawImage(this._cache, 0, 0, width, INDICATOR_REGION_H, 0, offsetY, width, INDICATOR_REGION_H);
    }
    this._drawPressedIndicators(ctx, pressedLanes, hitZoneY, width, height, visibleRange);
    this._drawWrongIndicatorFlashes(ctx, nowMs, hitZoneY, width, visibleRange);
  }

  drawPiano(ctx: CanvasRenderingContext2D, width: number, height: number, pressedLanes: Map<number, number>, visibleRange?: VisibleRange | null, nowMs: number = performance.now()): void {
    const hitZoneY = height * HIT_ZONE_Y_RATIO;
    const offsetY = hitZoneY - PIANO_REGION_OFFSET;
    this._ensureCache(width, height, visibleRange);
    if (this._cache) {
      // The indicator strip (top rows) is blitted by drawHitZone; skip it
      // here so live pressed-key indicators survive on top.
      const srcY = INDICATOR_REGION_H;
      const restH = this._cache.height - srcY;
      if (restH > 0) {
        ctx.drawImage(this._cache, 0, srcY, width, restH, 0, offsetY + srcY, width, restH);
      }
    }

    this._drawPressedKeys(ctx, pressedLanes, width, height, visibleRange);
    this._drawWrongKeyFlashes(ctx, nowMs, width, height, visibleRange);

    // Octave labels stay on top of pressed-key fills.
    const c = themeManager.canvas;
    const pianoTop = height - height * PIANO_HEIGHT_RATIO;
    const OCTAVE_NOTES = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8'];
    ctx.fillStyle = c.keyLabel;
    const keyWidth = whiteKeyWidth(width, visibleRange);
    ctx.font = `${Math.max(16, keyWidth * 0.4)}px ${themeManager.fonts.mono}`;
    ctx.textAlign = 'center';
    for (const noteName of OCTAVE_NOTES) {
      const layout = getPianoKeyLayout(noteName, width, visibleRange);
      if (layout.width === 0) continue;
      ctx.fillText(noteName, layout.x + layout.width / 2, pianoTop + 14);
    }
  }

  private _ensureCache(width: number, height: number, visibleRange?: VisibleRange | null): void {
    const rangeKey = visibleRange ? `${visibleRange.minNoteIdx}:${visibleRange.maxNoteIdx}` : '';
    const key = `${themeManager.current.id}|${width}|${height}|${rangeKey}|${this.showComputerKeys ? 'ck' : ''}`;
    if (key === this._cachedKey && this._cache) return;
    this._cachedKey = key;

    const hitZoneY = height * HIT_ZONE_Y_RATIO;
    const pianoTop = height - height * PIANO_HEIGHT_RATIO;
    const pianoH = height * PIANO_HEIGHT_RATIO;
    const totalH = height - hitZoneY + PIANO_REGION_OFFSET;
    const offsetY = hitZoneY - PIANO_REGION_OFFSET;

    if (!this._cache || this._cache.width !== width || this._cache.height !== Math.ceil(totalH)) {
      this._cache = document.createElement('canvas');
      this._cache.width = width;
      this._cache.height = Math.ceil(totalH);
    }
    const ctx = this._cache.getContext('2d')!;
    ctx.clearRect(0, 0, width, totalH);

    const wKeyWidth = whiteKeyWidth(width, visibleRange);
    const blackKeyWidth = wKeyWidth * BLACK_KEY_WIDTH_RATIO;
    const blackKeyHeight = pianoH * BLACK_KEY_HEIGHT_RATIO;

    this._drawIdleIndicators(ctx, hitZoneY, offsetY, width, visibleRange);
    this._drawWhiteKeys(ctx, pianoTop, offsetY, width, pianoH, wKeyWidth, visibleRange);
    this._drawBlackKeys(ctx, pianoTop, offsetY, width, blackKeyWidth, blackKeyHeight, visibleRange);
  }

  private _drawIdleIndicators(ctx: CanvasRenderingContext2D, hitZoneY: number, offsetY: number, width: number, visibleRange?: VisibleRange | null): void {
    const c = themeManager.canvas;
    const indicatorBarHeight = 8;

    for (let i = 0; i < NOTE_NAMES.length; i++) {
      if (!this._inRange(i, visibleRange)) continue;
      const layout = getPianoKeyLayout(NOTE_NAMES[i], width, visibleRange);
      if (layout.width === 0) continue;

      ctx.globalAlpha = 0.8;
      ctx.fillStyle = c.keyIndicatorUnpressed;
      ctx.fillRect(layout.x, hitZoneY - INDICATOR_BAR_OFFSET - offsetY, layout.width, indicatorBarHeight);
    }
    ctx.globalAlpha = 1;
  }

  /** Pressed-key indicator bars and their velocity glow, over the cached
   *  idle bars. Live draws use screen coordinates (no `- offsetY`): the
   *  cache blit already lands at offsetY. The glow clips above the piano
   *  body, matching the old cache layering where the piano background
   *  painted over its lower part. */
  private _drawPressedIndicators(ctx: CanvasRenderingContext2D, pressedLanes: Map<number, number>, hitZoneY: number, width: number, height: number, visibleRange?: VisibleRange | null): void {
    if (pressedLanes.size === 0) return;

    const indicatorBarHeight = 8;
    const basePressedGlowHeight = 60;
    const pianoTop = height - height * PIANO_HEIGHT_RATIO;
    if (pianoTop <= 2) return;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, width, pianoTop - 2);
    ctx.clip();
    for (const [lane, velocity] of pressedLanes) {
      if (!this._inRange(lane, visibleRange)) continue;
      const noteName = NOTE_NAMES[lane];
      if (!noteName) continue;
      const layout = getPianoKeyLayout(noteName, width, visibleRange);
      if (layout.width === 0) continue;
      const color = handColor(noteName);

      ctx.globalAlpha = 1;
      ctx.fillStyle = color;
      ctx.fillRect(layout.x, hitZoneY - INDICATOR_BAR_OFFSET, layout.width, indicatorBarHeight);

      const intensity = velocityIntensity(velocity);
      ctx.globalAlpha = 0.05 + 0.6 * intensity;
      ctx.fillStyle = color;
      const pressedGlowHeight = basePressedGlowHeight * (0.25 + 1.6 * intensity);
      ctx.fillRect(layout.x, hitZoneY - PIANO_REGION_OFFSET, layout.width, pressedGlowHeight);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** Red indicator-bar flash over a wrongly pressed key's indicator
   *  (learn mode), drawn after the pressed indicators so a wrong press
   *  reads red at the hit zone. Screen coordinates, like the pressed
   *  indicators. */
  private _drawWrongIndicatorFlashes(ctx: CanvasRenderingContext2D, nowMs: number, hitZoneY: number, width: number, visibleRange?: VisibleRange | null): void {
    if (this._wrongFlashes.size === 0) return;

    const indicatorBarHeight = 8;

    for (const [lane, startMs] of this._wrongFlashes) {
      const alpha = this._wrongFlashAlpha(nowMs, startMs);
      if (alpha <= 0) continue;
      if (!this._inRange(lane, visibleRange)) continue;
      const noteName = NOTE_NAMES[lane];
      if (!noteName) continue;
      const layout = getPianoKeyLayout(noteName, width, visibleRange);
      if (layout.width === 0) continue;

      ctx.globalAlpha = alpha;
      ctx.fillStyle = themeManager.css.accentRed;
      ctx.fillRect(layout.x, hitZoneY - INDICATOR_BAR_OFFSET, layout.width, indicatorBarHeight);
    }
    ctx.globalAlpha = 1;
    this._pruneWrongFlashes(nowMs);
  }

  /** Red overlay on wrongly pressed keys (learn mode): solid red fill
   *  with a hard border on the exact key — white or black — plus the
   *  key's short name so it stays identifiable. Drawn after the
   *  pressed-key pass so a still-held wrong key reads red; white
   *  flashes run first and redraw their lane's black key (idle), then
   *  black flashes, mirroring the pressed-key layering. Screen
   *  coordinates. */
  private _drawWrongKeyFlashes(ctx: CanvasRenderingContext2D, nowMs: number, width: number, height: number, visibleRange?: VisibleRange | null): void {
    if (this._wrongFlashes.size === 0) return;

    const c = themeManager.canvas;
    const wrongRed = themeManager.css.accentRed;
    const pianoTop = height - height * PIANO_HEIGHT_RATIO;
    const pianoH = height * PIANO_HEIGHT_RATIO;
    const wKeyWidth = whiteKeyWidth(width, visibleRange);
    const blackKeyWidth = wKeyWidth * BLACK_KEY_WIDTH_RATIO;
    const blackKeyHeight = pianoH * BLACK_KEY_HEIGHT_RATIO;
    const keyInset = 1;
    const labelBottomOffset = 16;
    const whiteLabelFont = `bold ${Math.max(16, wKeyWidth * 0.55)}px ${themeManager.fonts.mono}`;
    const blackLabelFont = `bold ${Math.max(11, blackKeyWidth * 0.6)}px ${themeManager.fonts.mono}`;

    ctx.textAlign = 'center';
    for (const [lane, startMs] of this._wrongFlashes) {
      const alpha = this._wrongFlashAlpha(nowMs, startMs);
      if (alpha <= 0) continue;
      if (!this._inRange(lane, visibleRange)) continue;
      const noteName = NOTE_NAMES[lane];
      if (!noteName || noteName.includes('#')) continue;
      const layout = getPianoKeyLayout(noteName, width, visibleRange);
      if (layout.width === 0) continue;

      ctx.globalAlpha = alpha;
      ctx.fillStyle = wrongRed;
      ctx.fillRect(layout.x + keyInset, pianoTop + keyInset, wKeyWidth - keyInset * 2, pianoH - keyInset * 2);

      ctx.strokeStyle = wrongRed;
      ctx.lineWidth = 2;
      ctx.strokeRect(layout.x + keyInset, pianoTop + keyInset, wKeyWidth - keyInset * 2, pianoH - keyInset * 2);

      const labelY = pianoTop + pianoH * 0.82;
      ctx.fillStyle = '#fff';
      ctx.font = whiteLabelFont;
      ctx.textBaseline = 'middle';
      ctx.save();
      ctx.beginPath();
      ctx.rect(layout.x, pianoTop, wKeyWidth, pianoH);
      ctx.clip();
      this._fillTextStrong(ctx, NOTE_SHORT_NAMES[noteName] ?? noteName, layout.x + wKeyWidth / 2, labelY);
      ctx.restore();
      ctx.textBaseline = 'alphabetic';

      // The red fill covered this lane's black key — redraw it (idle) so
      // its label stays visible, like the pressed-white-key pass does.
      ctx.globalAlpha = 1;
      const sharp = NOTE_NAMES[lane + 1];
      if (sharp?.includes('#') && this._inRange(lane + 1, visibleRange)) {
        this._drawBlackKey(ctx, layout.x + wKeyWidth * 0.2, pianoTop, blackKeyWidth, blackKeyHeight, sharp);
      }
    }

    for (const [lane, startMs] of this._wrongFlashes) {
      const alpha = this._wrongFlashAlpha(nowMs, startMs);
      if (alpha <= 0) continue;
      if (!this._inRange(lane, visibleRange)) continue;
      const noteName = NOTE_NAMES[lane];
      if (!noteName?.includes('#')) continue;
      const layout = getPianoKeyLayout(noteName, width, visibleRange);
      if (layout.width === 0) continue;

      ctx.globalAlpha = alpha;
      ctx.fillStyle = wrongRed;
      roundRect(ctx, layout.x, pianoTop, blackKeyWidth, blackKeyHeight, 2);
      ctx.fill();

      ctx.strokeStyle = c.blackKeyBorder;
      ctx.lineWidth = 1;
      roundRect(ctx, layout.x, pianoTop, blackKeyWidth, blackKeyHeight, 2);
      ctx.stroke();

      const blkLabelY = pianoTop + blackKeyHeight - labelBottomOffset;
      ctx.fillStyle = '#fff';
      ctx.font = blackLabelFont;
      ctx.textBaseline = 'middle';
      ctx.save();
      ctx.beginPath();
      roundRect(ctx, layout.x, pianoTop, blackKeyWidth, blackKeyHeight, 2);
      ctx.clip();
      this._fillTextStrong(ctx, NOTE_SHORT_NAMES[noteName] ?? noteName, layout.x + blackKeyWidth / 2, blkLabelY);
      ctx.restore();
      ctx.textBaseline = 'alphabetic';
    }
    ctx.globalAlpha = 1;
  }

  private _drawWhiteKeys(ctx: CanvasRenderingContext2D, pianoTop: number, offsetY: number, width: number, pianoH: number, whiteKeyWidth: number, visibleRange?: VisibleRange | null): void {
    const c = themeManager.canvas;
    const pianoBgPadding = 2;
    const keyInset = 1;
    const labelYRatio = 0.82;

    ctx.fillStyle = c.bg;
    ctx.fillRect(0, pianoTop - pianoBgPadding - offsetY, width, pianoH + pianoBgPadding);

    for (let i = 0; i < NOTE_NAMES.length; i++) {
      if (!this._inRange(i, visibleRange)) continue;
      const noteName = NOTE_NAMES[i];
      if (noteName.includes('#')) continue;
      const layout = getPianoKeyLayout(noteName, width, visibleRange);
      if (layout.width === 0) continue;

      ctx.fillStyle = c.whiteKeyBg;
      ctx.fillRect(layout.x + keyInset, pianoTop + keyInset - offsetY, whiteKeyWidth - keyInset * 2, pianoH - keyInset * 2);

      ctx.strokeStyle = c.whiteKeyBorder;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(layout.x, pianoTop - offsetY);
      ctx.lineTo(layout.x, pianoTop + pianoH - offsetY);
      ctx.stroke();

      const labelY = pianoTop - offsetY + pianoH * labelYRatio;
      const shortName = NOTE_SHORT_NAMES[noteName] ?? noteName;
      ctx.fillStyle = c.keyLabelWhite;
      ctx.font = `bold ${Math.max(16, whiteKeyWidth * 0.55)}px ${themeManager.fonts.mono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // Labels stay inside their key rectangle, even on narrow keys.
      ctx.save();
      ctx.beginPath();
      ctx.rect(layout.x, pianoTop - offsetY, whiteKeyWidth, pianoH);
      ctx.clip();
      this._fillTextStrong(ctx, shortName, layout.x + whiteKeyWidth / 2, labelY);
      ctx.textBaseline = 'alphabetic';
      this._drawComputerKeyLabel(ctx, noteName, layout.x + whiteKeyWidth / 2, pianoTop - offsetY + pianoH * 0.65, `${Math.max(13, whiteKeyWidth * 0.45)}px`, c.keyLabelWhite);
      ctx.restore();
    }
  }

  private _drawBlackKeys(ctx: CanvasRenderingContext2D, pianoTop: number, offsetY: number, width: number, blackKeyWidth: number, blackKeyHeight: number, visibleRange?: VisibleRange | null): void {
    for (let i = 0; i < NOTE_NAMES.length; i++) {
      if (!this._inRange(i, visibleRange)) continue;
      const noteName = NOTE_NAMES[i];
      if (!noteName.includes('#')) continue;
      const layout = getPianoKeyLayout(noteName, width, visibleRange);
      if (layout.width === 0) continue;

      this._drawBlackKey(ctx, layout.x, pianoTop - offsetY, blackKeyWidth, blackKeyHeight, noteName);
    }
  }

  /** One idle black key with its labels. Shared by the static cache layer
   *  and the live pressed overlay: a black key sits inside its natural's
   *  lane, so a pressed white fill would paint it away — the overlay
   *  redraws it (idle or pressed) on top. */
  private _drawBlackKey(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, noteName: string): void {
    const c = themeManager.canvas;
    const ctxR = ctx as CanvasRenderingContext2D;

    ctx.fillStyle = c.blackKeyBg;
    roundRect(ctxR, x, y, w, h, 2);
    ctx.fill();

    ctx.strokeStyle = c.blackKeyBorder;
    ctx.lineWidth = 1;
    roundRect(ctxR, x, y, w, h, 2);
    ctx.stroke();

    const blkLabelY = y + h - 16;
    ctx.fillStyle = c.keyLabelBlack;
    ctx.font = `bold ${Math.max(11, w * 0.6)}px ${themeManager.fonts.mono}`;
    ctx.textAlign = 'center';
    ctx.save();
    ctx.beginPath();
    roundRect(ctxR, x, y, w, h, 2);
    ctx.clip();
    this._fillTextStrong(ctx, NOTE_SHORT_NAMES[noteName] ?? noteName, x + w / 2, blkLabelY);
    this._drawComputerKeyLabel(ctx, noteName, x + w / 2, blkLabelY - w * 0.9, `${Math.max(10, w * 0.5)}px`, c.keyLabelBlack);
    ctx.restore();
  }

  /** Live pressed-key feedback: fills, glow strokes, and pressed label
   *  colors for just the held lanes. Drawn in screen coordinates. */
  private _drawPressedKeys(ctx: CanvasRenderingContext2D, pressedLanes: Map<number, number>, width: number, height: number, visibleRange?: VisibleRange | null): void {
    if (pressedLanes.size === 0) return;

    const c = themeManager.canvas;
    const pianoTop = height - height * PIANO_HEIGHT_RATIO;
    const pianoH = height * PIANO_HEIGHT_RATIO;
    const wKeyWidth = whiteKeyWidth(width, visibleRange);
    const blackKeyWidth = wKeyWidth * BLACK_KEY_WIDTH_RATIO;
    const blackKeyHeight = pianoH * BLACK_KEY_HEIGHT_RATIO;
    const keyInset = 1;
    const labelBottomOffset = 16;
    // Constant for a given geometry/theme: hoisted so the font shorthand
    // isn't re-parsed per pressed key per frame.
    const whiteLabelFont = `bold ${Math.max(16, wKeyWidth * 0.55)}px ${themeManager.fonts.mono}`;
    const blackLabelFont = `bold ${Math.max(11, blackKeyWidth * 0.6)}px ${themeManager.fonts.mono}`;
    const whiteCkFontSize = `${Math.max(13, wKeyWidth * 0.45)}px`;
    const blackCkFontSize = `${Math.max(10, blackKeyWidth * 0.5)}px`;

    for (const [lane, velocity] of pressedLanes) {
      if (!this._inRange(lane, visibleRange)) continue;
      const noteName = NOTE_NAMES[lane];
      if (!noteName || noteName.includes('#')) continue;
      const layout = getPianoKeyLayout(noteName, width, visibleRange);
      if (layout.width === 0) continue;
      const color = handColor(noteName);
      const intensity = velocityIntensity(velocity);

      ctx.fillStyle = c.whiteKeyBgPressed;
      ctx.fillRect(layout.x + keyInset, pianoTop + keyInset, wKeyWidth - keyInset * 2, pianoH - keyInset * 2);

      ctx.save();
      ctx.beginPath();
      ctx.rect(layout.x, pianoTop, wKeyWidth, pianoH);
      ctx.clip();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1 + 6 * intensity;
      ctx.strokeRect(layout.x + keyInset, pianoTop + keyInset, wKeyWidth - keyInset * 2, pianoH - keyInset * 2);
      ctx.restore();

      const labelY = pianoTop + pianoH * 0.82;
      ctx.fillStyle = c.keyLabelPressedWhite;
      ctx.font = whiteLabelFont;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.save();
      ctx.beginPath();
      ctx.rect(layout.x, pianoTop, wKeyWidth, pianoH);
      ctx.clip();
      this._fillTextStrong(ctx, NOTE_SHORT_NAMES[noteName] ?? noteName, layout.x + wKeyWidth / 2, labelY);
      ctx.textBaseline = 'alphabetic';
      this._drawComputerKeyLabel(ctx, noteName, layout.x + wKeyWidth / 2, pianoTop + pianoH * 0.65, whiteCkFontSize, c.keyLabelWhite);
      ctx.restore();

      // The pressed white fill covered this lane's black key — redraw it
      // (idle) so its label stays visible.
      const sharp = NOTE_NAMES[lane + 1];
      if (sharp?.includes('#') && this._inRange(lane + 1, visibleRange)) {
        this._drawBlackKey(ctx, layout.x + wKeyWidth * 0.2, pianoTop, blackKeyWidth, blackKeyHeight, sharp);
      }
    }

    for (const [lane, velocity] of pressedLanes) {
      if (!this._inRange(lane, visibleRange)) continue;
      const noteName = NOTE_NAMES[lane];
      if (!noteName?.includes('#')) continue;
      const layout = getPianoKeyLayout(noteName, width, visibleRange);
      if (layout.width === 0) continue;
      const color = handColor(noteName);
      const intensity = velocityIntensity(velocity);
      const ctxR = ctx as CanvasRenderingContext2D;

      ctx.fillStyle = c.blackKeyBgPressed;
      roundRect(ctxR, layout.x, pianoTop, blackKeyWidth, blackKeyHeight, 2);
      ctx.fill();

      ctx.save();
      ctx.beginPath();
      ctx.rect(layout.x, pianoTop, blackKeyWidth, blackKeyHeight);
      ctx.clip();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1 + 5 * intensity;
      roundRect(ctxR, layout.x + keyInset, pianoTop + keyInset, blackKeyWidth - keyInset * 2, blackKeyHeight - keyInset * 2, 1);
      ctx.stroke();
      ctx.restore();

      ctx.strokeStyle = c.blackKeyBorder;
      ctx.lineWidth = 1;
      roundRect(ctxR, layout.x, pianoTop, blackKeyWidth, blackKeyHeight, 2);
      ctx.stroke();

      const blkLabelY = pianoTop + blackKeyHeight - labelBottomOffset;
      ctx.fillStyle = c.keyLabelPressedBlack;
      ctx.font = blackLabelFont;
      ctx.textAlign = 'center';
      ctx.save();
      ctx.beginPath();
      roundRect(ctxR, layout.x, pianoTop, blackKeyWidth, blackKeyHeight, 2);
      ctx.clip();
      this._fillTextStrong(ctx, NOTE_SHORT_NAMES[noteName] ?? noteName, layout.x + blackKeyWidth / 2, blkLabelY);
      this._drawComputerKeyLabel(ctx, noteName, layout.x + blackKeyWidth / 2, blkLabelY - blackKeyWidth * 0.9, blackCkFontSize, c.keyLabelBlack);
      ctx.restore();
    }
  }

  /** VT323's synthesized bold renders thin at canvas scale; a 1px-offset
   *  second pass thickens the glyphs into the pixel look. */
  private _fillTextStrong(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
    ctx.fillText(text, x, y);
    ctx.fillText(text, x + 1, y);
  }

  private _drawComputerKeyLabel(
    ctx: CanvasRenderingContext2D,
    noteName: string,
    x: number,
    y: number,
    fontSize: string,
    color: string,
  ): void {
    if (!this.showComputerKeys) return;

    const keyLabel = NOTE_TO_KEY_LABEL.get(noteName);
    if (!keyLabel) return;

    ctx.fillStyle = color;
    ctx.font = `${fontSize} ${themeManager.fonts.mono}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(keyLabel, x, y);
    ctx.textBaseline = 'alphabetic';
  }
}

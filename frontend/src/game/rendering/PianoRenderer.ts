// Piano keyboard and hit-zone indicator rendering with off-screen
// cache. Draws white/black keys, labels, and press feedback.

import { NOTE_NAMES, NOTE_COLORS, getPianoKeyLayout, BLACK_KEY_WIDTH_RATIO, NOTE_SHORT_NAMES, whiteKeyWidth } from '../../utils/notes.js';
import type { VisibleRange } from '../../utils/notes.js';
import { HIT_ZONE_Y_RATIO } from '../NoteManager.js';
import { themeManager } from '../../themes/ThemeManager.js';

const PIANO_REGION_OFFSET = 30;
const BLACK_KEY_HEIGHT_RATIO = 0.56;
const PIANO_HEIGHT_RATIO = 0.16;

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
  private _cachedState = '';
  private _cachedWidth = -1;

  drawHitZone(ctx: CanvasRenderingContext2D, width: number, height: number, pressedLanes: Set<number>, visibleRange?: VisibleRange | null): void {
    const hitZoneY = height * HIT_ZONE_Y_RATIO;
    const offsetY = hitZoneY - PIANO_REGION_OFFSET;
    this._ensureCache(width, height, pressedLanes, visibleRange);
    if (this._cache) {
      const regionH = 34;
      ctx.drawImage(this._cache, 0, 0, width, regionH, 0, offsetY, width, regionH);
    }
  }

  drawPiano(ctx: CanvasRenderingContext2D, width: number, height: number, pressedLanes: Set<number>, visibleRange?: VisibleRange | null): void {
    const hitZoneY = height * HIT_ZONE_Y_RATIO;
    const offsetY = hitZoneY - PIANO_REGION_OFFSET;
    this._ensureCache(width, height, pressedLanes, visibleRange);
    if (this._cache) {
      ctx.drawImage(this._cache, 0, offsetY);
    }

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

  private _ensureCache(width: number, height: number, pressedLanes: Set<number>, visibleRange?: VisibleRange | null): void {
    const rangeKey = visibleRange ? `${visibleRange.minNoteIdx}:${visibleRange.maxNoteIdx}` : '';
    const stateKey = pressedLanes.size > 0
      ? `${rangeKey}|${[...pressedLanes].sort((a, b) => a - b).join(',')}`
      : rangeKey;
    if (stateKey === this._cachedState && width === this._cachedWidth && this._cache) return;
    this._cachedState = stateKey;
    this._cachedWidth = width;

    const hitZoneY = height * HIT_ZONE_Y_RATIO;
    const pianoTop = height - height * PIANO_HEIGHT_RATIO;
    const pianoH = height * PIANO_HEIGHT_RATIO;
    const totalH = height - hitZoneY + PIANO_REGION_OFFSET;
    const offsetY = hitZoneY - PIANO_REGION_OFFSET;

    if (!this._cache || this._cache.width !== width || this._cache.height !== totalH) {
      this._cache = document.createElement('canvas');
      this._cache.width = width;
      this._cache.height = Math.ceil(totalH);
    }
    const ctx = this._cache.getContext('2d')!;
    ctx.clearRect(0, 0, width, totalH);

    const wKeyWidth = whiteKeyWidth(width, visibleRange);
    const blackKeyWidth = wKeyWidth * BLACK_KEY_WIDTH_RATIO;
    const blackKeyHeight = pianoH * BLACK_KEY_HEIGHT_RATIO;

    this._drawKeyIndicators(ctx, pressedLanes, hitZoneY, offsetY, width, visibleRange);
    this._drawWhiteKeys(ctx, pressedLanes, pianoTop, offsetY, width, pianoH, wKeyWidth, visibleRange);
    this._drawBlackKeys(ctx, pressedLanes, pianoTop, offsetY, width, blackKeyWidth, blackKeyHeight, visibleRange);
  }

  private _drawKeyIndicators(ctx: CanvasRenderingContext2D, pressedLanes: Set<number>, hitZoneY: number, offsetY: number, width: number, visibleRange?: VisibleRange | null): void {
    const c = themeManager.canvas;
    const indicatorBarOffset = 4;
    const indicatorBarHeight = 8;
    const pressedGlowHeight = 60;

    for (let i = 0; i < NOTE_NAMES.length; i++) {
      if (visibleRange && (i < visibleRange.minNoteIdx || i > visibleRange.maxNoteIdx)) continue;
      const noteName = NOTE_NAMES[i];
      const layout = getPianoKeyLayout(noteName, width, visibleRange);
      if (layout.width === 0) continue;
      const isPressed = pressedLanes.has(i);
      const color = NOTE_COLORS[noteName] || c.noteFallbackColor;

      ctx.globalAlpha = isPressed ? 0.5 : 0.8;
      ctx.fillStyle = isPressed ? color : c.keyIndicatorUnpressed;
      ctx.fillRect(layout.x, hitZoneY - indicatorBarOffset - offsetY, layout.width, indicatorBarHeight);

      if (isPressed) {
        ctx.globalAlpha = 0.15;
        ctx.fillStyle = color;
        ctx.fillRect(layout.x, hitZoneY - PIANO_REGION_OFFSET - offsetY, layout.width, pressedGlowHeight);
      }
    }
    ctx.globalAlpha = 1;
  }

  private _drawWhiteKeys(ctx: CanvasRenderingContext2D, pressedLanes: Set<number>, pianoTop: number, offsetY: number, width: number, pianoH: number, whiteKeyWidth: number, visibleRange?: VisibleRange | null): void {
    const c = themeManager.canvas;
    const pianoBgPadding = 2;
    const keyInset = 1;
    const labelYRatio = 0.82;

    ctx.fillStyle = c.bg;
    ctx.fillRect(0, pianoTop - pianoBgPadding - offsetY, width, pianoH + pianoBgPadding);

    for (let i = 0; i < NOTE_NAMES.length; i++) {
      if (visibleRange && (i < visibleRange.minNoteIdx || i > visibleRange.maxNoteIdx)) continue;
      const noteName = NOTE_NAMES[i];
      const isBlack = noteName.includes('#');
      if (isBlack) continue;
      const layout = getPianoKeyLayout(noteName, width, visibleRange);
      if (layout.width === 0) continue;
      const isPressed = pressedLanes.has(i);
      const color = NOTE_COLORS[noteName] || c.noteFallbackColor;

      ctx.fillStyle = isPressed ? c.whiteKeyBgPressed : c.whiteKeyBg;
      ctx.fillRect(layout.x + keyInset, pianoTop + keyInset - offsetY, whiteKeyWidth - keyInset * 2, pianoH - keyInset * 2);

      if (isPressed) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(layout.x + keyInset, pianoTop + keyInset - offsetY, whiteKeyWidth - keyInset * 2, pianoH - keyInset * 2);
      }

      ctx.strokeStyle = c.whiteKeyBorder;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(layout.x, pianoTop - offsetY);
      ctx.lineTo(layout.x, pianoTop + pianoH - offsetY);
      ctx.stroke();

      const labelY = pianoTop - offsetY + pianoH * labelYRatio;
      const shortName = NOTE_SHORT_NAMES[noteName] ?? noteName;
      ctx.fillStyle = isPressed ? c.keyLabelPressedWhite : c.keyLabel;
      ctx.font = `bold ${Math.max(14, whiteKeyWidth * 0.42)}px ${themeManager.fonts.mono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(shortName, layout.x + whiteKeyWidth / 2, labelY);
      ctx.textBaseline = 'alphabetic';
    }
  }

  private _drawBlackKeys(ctx: CanvasRenderingContext2D, pressedLanes: Set<number>, pianoTop: number, offsetY: number, width: number, blackKeyWidth: number, blackKeyHeight: number, visibleRange?: VisibleRange | null): void {
    const c = themeManager.canvas;
    const keyInset = 1;
    const labelBottomOffset = 16;

    for (let i = 0; i < NOTE_NAMES.length; i++) {
      if (visibleRange && (i < visibleRange.minNoteIdx || i > visibleRange.maxNoteIdx)) continue;
      const noteName = NOTE_NAMES[i];
      const isBlack = noteName.includes('#');
      if (!isBlack) continue;
      const layout = getPianoKeyLayout(noteName, width, visibleRange);
      if (layout.width === 0) continue;
      const isPressed = pressedLanes.has(i);

      ctx.fillStyle = isPressed ? c.blackKeyBgPressed : c.blackKeyBg;
      const ctxR = ctx as CanvasRenderingContext2D;
      roundRect(ctxR, layout.x, pianoTop - offsetY, blackKeyWidth, blackKeyHeight, 2);
      ctx.fill();

      if (isPressed) {
        const bcolor = NOTE_COLORS[noteName] || c.noteFallbackColor;
        ctx.strokeStyle = bcolor;
        ctx.lineWidth = 1.5;
        roundRect(ctxR, layout.x + keyInset, pianoTop + keyInset - offsetY, blackKeyWidth - keyInset * 2, blackKeyHeight - keyInset * 2, 1);
        ctx.stroke();
      }

      ctx.strokeStyle = c.blackKeyBorder;
      ctx.lineWidth = 1;
      roundRect(ctxR, layout.x, pianoTop - offsetY, blackKeyWidth, blackKeyHeight, 2);
      ctx.stroke();

      const blkLabelY = pianoTop - offsetY + blackKeyHeight - labelBottomOffset;
      const blkShort = NOTE_SHORT_NAMES[noteName] ?? noteName;
      ctx.fillStyle = isPressed ? c.keyLabelPressedBlack : c.keyLabel;
      ctx.font = `bold ${Math.max(10, blackKeyWidth * 0.5)}px ${themeManager.fonts.mono}`;
      ctx.textAlign = 'center';
      ctx.fillText(blkShort, layout.x + blackKeyWidth / 2, blkLabelY);
    }
  }
}

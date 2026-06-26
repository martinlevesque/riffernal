// Piano keyboard and hit-zone indicator rendering with off-screen
// cache. Draws white/black keys, labels, and press feedback.

import { NOTE_NAMES, NOTE_COLORS, getPianoKeyLayout, WHITE_KEY_COUNT, BLACK_KEY_WIDTH_RATIO, NOTE_SHORT_NAMES, countWhiteKeysInRange } from '../../utils/notes.js';
import type { VisibleRange } from '../../utils/notes.js';
import { HIT_ZONE_Y_RATIO } from '../NoteManager.js';

const CANVAS_BG = '#0a0a0a';
const PIANO_REGION_OFFSET = 30;
const BLACK_KEY_HEIGHT_RATIO = 0.56;

const KEY_INDICATOR_UNPRESSED = '#222';
const WHITE_KEY_BG = '#2a2a2a';
const WHITE_KEY_BG_PRESSED = '#555';
const WHITE_KEY_BORDER = '#333';
const BLACK_KEY_BG = '#111';
const BLACK_KEY_BG_PRESSED = '#666';
const BLACK_KEY_BORDER = '#000';

const KEY_LABEL = '#666';
const KEY_LABEL_PRESSED_WHITE = '#fff';
const KEY_LABEL_PRESSED_BLACK = '#ddd';
const KB_LABEL = '#444';
const KB_LABEL_PRESSED_WHITE = '#aaa';
const KB_LABEL_PRESSED_BLACK = '#999';
const NOTE_FALLBACK_COLOR = '#ffffff';

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
  private _cachedState = 0;
  private _cachedWidth = -1;
  private _cachedRangeKey = '';
  private _keyDisplayMap: Record<string, string>;

  constructor(keyDisplayMap: Record<string, string>) {
    this._keyDisplayMap = keyDisplayMap;
  }

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

    const pianoBottomY = height;
    const OCTAVE_NOTES = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8'];
    ctx.fillStyle = '#555';
    const keyWidth = visibleRange
      ? width / countWhiteKeysInRange(visibleRange)
      : width / WHITE_KEY_COUNT;
    ctx.font = `${Math.max(8, keyWidth * 0.22)}px Courier New`;
    ctx.textAlign = 'center';
    for (const noteName of OCTAVE_NOTES) {
      const layout = getPianoKeyLayout(noteName, width, visibleRange);
      if (layout.width === 0) continue;
      ctx.fillText(noteName, layout.x + layout.width / 2, pianoBottomY - 2);
    }
  }

  private _ensureCache(width: number, height: number, pressedLanes: Set<number>, visibleRange?: VisibleRange | null): void {
    let state = 0;
    for (const lane of pressedLanes) state |= 1 << lane;
    const rangeKey = visibleRange ? `${visibleRange.minNoteIdx}:${visibleRange.maxNoteIdx}` : '';
    if (state === this._cachedState && width === this._cachedWidth && rangeKey === this._cachedRangeKey && this._cache) return;
    this._cachedState = state;
    this._cachedWidth = width;
    this._cachedRangeKey = rangeKey;

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

    const whiteKeyWidth = visibleRange
      ? width / countWhiteKeysInRange(visibleRange)
      : width / WHITE_KEY_COUNT;
    const blackKeyWidth = whiteKeyWidth * BLACK_KEY_WIDTH_RATIO;
    const blackKeyHeight = pianoH * BLACK_KEY_HEIGHT_RATIO;

    this._drawKeyIndicators(ctx, pressedLanes, hitZoneY, offsetY, width, visibleRange);
    this._drawWhiteKeys(ctx, pressedLanes, pianoTop, offsetY, width, pianoH, whiteKeyWidth, visibleRange);
    this._drawBlackKeys(ctx, pressedLanes, pianoTop, offsetY, width, blackKeyWidth, blackKeyHeight, visibleRange);
  }

  private _drawKeyIndicators(ctx: CanvasRenderingContext2D, pressedLanes: Set<number>, hitZoneY: number, offsetY: number, width: number, visibleRange?: VisibleRange | null): void {
    const indicatorBarOffset = 4;
    const indicatorBarHeight = 8;
    const pressedGlowHeight = 60;

    for (let i = 0; i < NOTE_NAMES.length; i++) {
      if (visibleRange && (i < visibleRange.minNoteIdx || i > visibleRange.maxNoteIdx)) continue;
      const noteName = NOTE_NAMES[i];
      const layout = getPianoKeyLayout(noteName, width, visibleRange);
      if (layout.width === 0) continue;
      const isPressed = pressedLanes.has(i);
      const color = NOTE_COLORS[noteName] || NOTE_FALLBACK_COLOR;

      ctx.globalAlpha = isPressed ? 0.5 : 0.8;
      ctx.fillStyle = isPressed ? color : KEY_INDICATOR_UNPRESSED;
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
    const pianoBgPadding = 2;
    const keyInset = 1;
    const pressedShadowBlur = 15;
    const labelYRatio = 0.72;
    const kbLabelOffset = 13;

    ctx.fillStyle = CANVAS_BG;
    ctx.fillRect(0, pianoTop - pianoBgPadding - offsetY, width, pianoH + pianoBgPadding);

    for (let i = 0; i < NOTE_NAMES.length; i++) {
      if (visibleRange && (i < visibleRange.minNoteIdx || i > visibleRange.maxNoteIdx)) continue;
      const noteName = NOTE_NAMES[i];
      const isBlack = noteName.includes('#');
      if (isBlack) continue;
      const layout = getPianoKeyLayout(noteName, width, visibleRange);
      if (layout.width === 0) continue;
      const isPressed = pressedLanes.has(i);
      const color = NOTE_COLORS[noteName] || NOTE_FALLBACK_COLOR;

      ctx.fillStyle = isPressed ? WHITE_KEY_BG_PRESSED : WHITE_KEY_BG;
      ctx.fillRect(layout.x + keyInset, pianoTop + keyInset - offsetY, whiteKeyWidth - keyInset * 2, pianoH - keyInset * 2);

      if (isPressed) {
        ctx.shadowColor = color;
        ctx.shadowBlur = pressedShadowBlur;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(layout.x + keyInset, pianoTop + keyInset - offsetY, whiteKeyWidth - keyInset * 2, pianoH - keyInset * 2);
        ctx.shadowBlur = 0;
      }

      ctx.strokeStyle = WHITE_KEY_BORDER;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(layout.x, pianoTop - offsetY);
      ctx.lineTo(layout.x, pianoTop + pianoH - offsetY);
      ctx.stroke();

      const labelY = pianoTop - offsetY + pianoH * labelYRatio;
      const shortName = NOTE_SHORT_NAMES[noteName] ?? noteName;
      ctx.fillStyle = isPressed ? KEY_LABEL_PRESSED_WHITE : KEY_LABEL;
      ctx.font = `${Math.max(11, whiteKeyWidth * 0.3)}px Courier New`;
      ctx.textAlign = 'center';
      ctx.fillText(shortName, layout.x + whiteKeyWidth / 2, labelY);

      const kbKey = this._keyDisplayMap[noteName] || '';
      if (kbKey) {
        ctx.fillStyle = isPressed ? KB_LABEL_PRESSED_WHITE : KB_LABEL;
        ctx.font = `bold ${Math.max(9, whiteKeyWidth * 0.22)}px Courier New`;
        ctx.fillText(`[${kbKey}]`, layout.x + whiteKeyWidth / 2, labelY + kbLabelOffset);
      }
    }
  }

  private _drawBlackKeys(ctx: CanvasRenderingContext2D, pressedLanes: Set<number>, pianoTop: number, offsetY: number, width: number, blackKeyWidth: number, blackKeyHeight: number, visibleRange?: VisibleRange | null): void {
    const keyInset = 1;
    const pressedShadowBlur = 12;
    const labelBottomOffset = 13;
    const kbLabelOffset = 7;

    for (let i = 0; i < NOTE_NAMES.length; i++) {
      if (visibleRange && (i < visibleRange.minNoteIdx || i > visibleRange.maxNoteIdx)) continue;
      const noteName = NOTE_NAMES[i];
      const isBlack = noteName.includes('#');
      if (!isBlack) continue;
      const layout = getPianoKeyLayout(noteName, width, visibleRange);
      if (layout.width === 0) continue;
      const isPressed = pressedLanes.has(i);

      ctx.fillStyle = isPressed ? BLACK_KEY_BG_PRESSED : BLACK_KEY_BG;
      const ctxR = ctx as CanvasRenderingContext2D;
      roundRect(ctxR, layout.x, pianoTop - offsetY, blackKeyWidth, blackKeyHeight, 2);
      ctx.fill();

      if (isPressed) {
        const bcolor = NOTE_COLORS[noteName] || NOTE_FALLBACK_COLOR;
        ctx.shadowColor = bcolor;
        ctx.shadowBlur = pressedShadowBlur;
        ctx.strokeStyle = bcolor;
        ctx.lineWidth = 1.5;
        roundRect(ctxR, layout.x + keyInset, pianoTop + keyInset - offsetY, blackKeyWidth - keyInset * 2, blackKeyHeight - keyInset * 2, 1);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      ctx.strokeStyle = BLACK_KEY_BORDER;
      ctx.lineWidth = 1;
      roundRect(ctxR, layout.x, pianoTop - offsetY, blackKeyWidth, blackKeyHeight, 2);
      ctx.stroke();

      ctx.save();
      roundRect(ctxR, layout.x + keyInset, pianoTop + keyInset - offsetY, blackKeyWidth - keyInset * 2, blackKeyHeight - keyInset * 2, 1);
      ctx.clip();

      const blkLabelY = pianoTop - offsetY + blackKeyHeight - labelBottomOffset;
      const blkShort = NOTE_SHORT_NAMES[noteName] ?? noteName;
      ctx.fillStyle = isPressed ? KEY_LABEL_PRESSED_BLACK : KEY_LABEL;
      ctx.font = `${Math.max(6, blackKeyWidth * 0.35)}px Courier New`;
      ctx.textAlign = 'center';
      ctx.fillText(blkShort, layout.x + blackKeyWidth / 2, blkLabelY);

      const blkKb = this._keyDisplayMap[noteName] || '';
      if (blkKb) {
        ctx.fillStyle = isPressed ? KB_LABEL_PRESSED_BLACK : KB_LABEL;
        ctx.font = `bold ${Math.max(5, blackKeyWidth * 0.25)}px Courier New`;
        ctx.fillText(`[${blkKb}]`, layout.x + blackKeyWidth / 2, blkLabelY + kbLabelOffset);
      }

      ctx.restore();
    }
  }
}

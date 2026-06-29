// Main canvas renderer: highway, notes, sheet music, particles,
// and playback cursor. Delegates piano rendering to PianoRenderer.

import { NOTE_NAMES, getPianoKeyLayout, WHITE_KEY_COUNT, handForKey, handColor, HandSide, NOTE_SHORT_NAMES, whiteKeyWidth, countWhiteKeysInRange } from '../../utils/notes.js';
import type { VisibleRange } from '../../utils/notes.js';
import { HIT_ZONE_Y_RATIO } from '../NoteManager.js';
import { LoopDefinitionState } from '../Loop.js';
import { PianoRenderer } from './PianoRenderer.js';
import type { SongNote } from '../NoteManager.js';
import { isLowEndDevice } from '../../utils/device.js';

export const SHEET_TOP_OFFSET = 84;

const BACKING_COLOR = '#555566';

export const FAIL_COLOR_LEFT = '#aa2266';
export const FAIL_COLOR_RIGHT = '#aa3322';
export const FAIL_COLOR_SHEET_LEFT = '#662244';
export const FAIL_COLOR_SHEET_RIGHT = '#882222';

export const FAIL_PARTICLE_LEFT = '#ff44aa';
export const FAIL_PARTICLE_RIGHT = '#ff8822';

const CANVAS_BG = '#0a0a0a';
const HIGHWAY_BG = '#0e0e0e';
const HIGHWAY_LANE_COLOR = '#1a1a1a';

const NOTE_HEAD_LABEL_COLOR = '#000';

const NOTE_HIGHLIGHT_COLOR = '#fff';

const STAFF_LINE_COLOR = '#444';
const CLEF_COLOR = '#888';
const MEASURE_LINE_COLOR = '#555';
const BEAT_LINE_COLOR = '#222';
const SHEET_BORDER_COLOR = '#333';
const HIT_NOTE_COLOR = '#555';

const PLAYBACK_CURSOR_COLOR = '#ff2244';
const LOOP_MARKER_COLOR = '#aa66ff';
const LOOP_OVERLAY_ACTIVE = 'rgba(170, 102, 255, 0.20)';
const LOOP_OVERLAY_INACTIVE = 'rgba(120, 90, 180, 0.10)';
const LOOP_DEFINING_PREVIEW = 'rgba(170, 102, 255, 0.07)';

const HIGHWAY_BELOW_HIT_ZONE = 10;
const CLEF_WIDTH = 25;
const SHEET_MARGIN = 8;
const STAFF_TOP_PADDING = 5;
const STAFF_GAP = 8;
const STAFF_BOTTOM_PADDING = 5;

export const CLEF_TYPES = {
  BASS: 'bass',
  TREBLE: 'treble',
} as const;

export const BASS_STAFF_POSITIONS: Record<string, number> = {
  'A0': -12, 'A#0': -12, 'B0': -11,
  'C1': -10, 'C#1': -10, 'D1': -9, 'D#1': -9, 'E1': -8, 'F1': -7, 'F#1': -7,
  'G1': -6, 'G#1': -6, 'A1': -5, 'A#1': -5, 'B1': -4,
  'C2': -3, 'C#2': -3, 'D2': -2, 'D#2': -2, 'E2': -1, 'F2': 0, 'F#2': 0,
  'G2': 1, 'G#2': 1, 'A2': 2, 'A#2': 2, 'B2': 3,
  'C3': 4, 'C#3': 4, 'D3': 5, 'D#3': 5, 'E3': 6, 'F3': 7, 'F#3': 7,
  'G3': 8, 'G#3': 8, 'A3': 9, 'A#3': 9, 'B3': 10,
};

export const TREBLE_STAFF_POSITIONS: Record<string, number> = {
  'C4': 1, 'C#4': 1, 'D4': 2, 'D#4': 2, 'E4': 3, 'F4': 4, 'F#4': 4,
  'G4': 5, 'G#4': 5, 'A4': 6, 'A#4': 6, 'B4': 7,
  'C5': 8, 'C#5': 8, 'D5': 9, 'D#5': 9, 'E5': 10, 'F5': 11, 'F#5': 11,
  'G5': 12, 'G#5': 12, 'A5': 13, 'A#5': 13, 'B5': 14,
  'C6': 15, 'C#6': 15, 'D6': 16, 'D#6': 16, 'E6': 17, 'F6': 18, 'F#6': 18,
  'G6': 19, 'G#6': 19, 'A6': 20, 'A#6': 20, 'B6': 21,
  'C7': 22, 'C#7': 22, 'D7': 23, 'D#7': 23, 'E7': 24, 'F7': 25, 'F#7': 25,
  'G7': 26, 'G#7': 26, 'A7': 27, 'A#7': 27, 'B7': 28,
  'C8': 29,
};

export const NOTE_TO_CLEF: Record<string, string> = {
  'A0': CLEF_TYPES.BASS, 'A#0': CLEF_TYPES.BASS, 'B0': CLEF_TYPES.BASS,
  'C1': CLEF_TYPES.BASS, 'C#1': CLEF_TYPES.BASS, 'D1': CLEF_TYPES.BASS, 'D#1': CLEF_TYPES.BASS,
  'E1': CLEF_TYPES.BASS, 'F1': CLEF_TYPES.BASS, 'F#1': CLEF_TYPES.BASS, 'G1': CLEF_TYPES.BASS,
  'G#1': CLEF_TYPES.BASS, 'A1': CLEF_TYPES.BASS, 'A#1': CLEF_TYPES.BASS, 'B1': CLEF_TYPES.BASS,
  'C2': CLEF_TYPES.BASS, 'C#2': CLEF_TYPES.BASS, 'D2': CLEF_TYPES.BASS, 'D#2': CLEF_TYPES.BASS,
  'E2': CLEF_TYPES.BASS, 'F2': CLEF_TYPES.BASS, 'F#2': CLEF_TYPES.BASS, 'G2': CLEF_TYPES.BASS,
  'G#2': CLEF_TYPES.BASS, 'A2': CLEF_TYPES.BASS, 'A#2': CLEF_TYPES.BASS, 'B2': CLEF_TYPES.BASS,
  'C3': CLEF_TYPES.BASS, 'C#3': CLEF_TYPES.BASS, 'D3': CLEF_TYPES.BASS, 'D#3': CLEF_TYPES.BASS,
  'E3': CLEF_TYPES.BASS, 'F3': CLEF_TYPES.BASS, 'F#3': CLEF_TYPES.BASS, 'G3': CLEF_TYPES.BASS,
  'G#3': CLEF_TYPES.BASS, 'A3': CLEF_TYPES.BASS, 'A#3': CLEF_TYPES.BASS, 'B3': CLEF_TYPES.BASS,
  'C4': CLEF_TYPES.TREBLE, 'C#4': CLEF_TYPES.TREBLE, 'D4': CLEF_TYPES.TREBLE, 'D#4': CLEF_TYPES.TREBLE,
  'E4': CLEF_TYPES.TREBLE, 'F4': CLEF_TYPES.TREBLE, 'F#4': CLEF_TYPES.TREBLE, 'G4': CLEF_TYPES.TREBLE,
  'G#4': CLEF_TYPES.TREBLE, 'A4': CLEF_TYPES.TREBLE, 'A#4': CLEF_TYPES.TREBLE, 'B4': CLEF_TYPES.TREBLE,
  'C5': CLEF_TYPES.TREBLE, 'C#5': CLEF_TYPES.TREBLE, 'D5': CLEF_TYPES.TREBLE, 'D#5': CLEF_TYPES.TREBLE,
  'E5': CLEF_TYPES.TREBLE, 'F5': CLEF_TYPES.TREBLE, 'F#5': CLEF_TYPES.TREBLE, 'G5': CLEF_TYPES.TREBLE,
  'G#5': CLEF_TYPES.TREBLE, 'A5': CLEF_TYPES.TREBLE, 'A#5': CLEF_TYPES.TREBLE, 'B5': CLEF_TYPES.TREBLE,
  'C6': CLEF_TYPES.TREBLE, 'C#6': CLEF_TYPES.TREBLE, 'D6': CLEF_TYPES.TREBLE, 'D#6': CLEF_TYPES.TREBLE,
  'E6': CLEF_TYPES.TREBLE, 'F6': CLEF_TYPES.TREBLE, 'F#6': CLEF_TYPES.TREBLE, 'G6': CLEF_TYPES.TREBLE,
  'G#6': CLEF_TYPES.TREBLE, 'A6': CLEF_TYPES.TREBLE, 'A#6': CLEF_TYPES.TREBLE, 'B6': CLEF_TYPES.TREBLE,
  'C7': CLEF_TYPES.TREBLE, 'C#7': CLEF_TYPES.TREBLE, 'D7': CLEF_TYPES.TREBLE, 'D#7': CLEF_TYPES.TREBLE,
  'E7': CLEF_TYPES.TREBLE, 'F7': CLEF_TYPES.TREBLE, 'F#7': CLEF_TYPES.TREBLE, 'G7': CLEF_TYPES.TREBLE,
  'G#7': CLEF_TYPES.TREBLE, 'A7': CLEF_TYPES.TREBLE, 'A#7': CLEF_TYPES.TREBLE, 'B7': CLEF_TYPES.TREBLE,
  'C8': CLEF_TYPES.TREBLE,
};

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number;
}

const SHEET_STAFF_LINE_SPACING = 10;
const SHEET_NOTE_RADIUS = 4.5;
export const SHEET_BEATS_VISIBLE = 18;
const SHEET_BEATS_PER_MEASURE = 4;

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

const SHEET_NOTE_POSITIONS: Record<string, number> = Object.assign(
  Object.fromEntries(Object.entries(BASS_STAFF_POSITIONS).map(([k, v]) => [k, v - 3])),
  TREBLE_STAFF_POSITIONS
);

const TAIL_HIGHLIGHT_ALPHA = 0.06;
const HEAD_HIGHLIGHT_ALPHA = 0.18;

const HOLD_OUTER_HOT = '#ffaa33';
const HOLD_OUTER_WARM = '#ff6600';
const HOLD_OUTER_COOL = '#cc3300';
const HOLD_OUTER_FADE = 'rgba(200, 50, 0, 0)';
const HOLD_CORE_WHITE = '#ffeecc';
const HOLD_CORE_BRIGHT = '#ffaa44';
const HOLD_CORE_FADE = 'rgba(255, 100, 0, 0)';
const HOLD_EMBER_LIGHT = '#ffaa33';
const HOLD_EMBER_DARK = '#ff6600';

interface NoteLayout {
  drawX: number;
  drawY: number;
  scaledWidth: number;
  scaledHeadHeight: number;
  scaledTailHeight: number;
  cornerRadius: number;
  scale: number;
}

interface SheetLayout {
  ctx: CanvasRenderingContext2D;
  sheetTop: number;
  sheetBottom: number;
  barX: number;
  barW: number;
  viewStart: number;
  viewEnd: number;
  staffLineSpacing: number;
}

export class Renderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width = 0;
  height = 0;
  pressedKeys = new Set<string>();
  particles: Particle[] = [];
  sheetBottom = 0;
  sheetScale = 1.0;
  sheetBarX = 0;
  sheetBarW = 0;
  sheetViewStart = 0;
  sheetViewEnd = 0;
  sheetTrebleTop = 0;
  sheetTrebleBottom = 0;
  sheetBassTop = 0;
  sheetBassBottom = 0;
  piano: PianoRenderer;
  private _staffCache: HTMLCanvasElement | null = null;
  private _cachedStaffScale = -1;
  private _cachedStaffWidth = -1;
  private _flameCache = new Map<number, HTMLCanvasElement>();
  private _isLowEnd: boolean;
  private _now = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.piano = new PianoRenderer();
    this._isLowEnd = isLowEndDevice();
    this.resize();
  }

  resize(): void {
    const lowEnd = isLowEndDevice();
    const dpr = Math.min(window.devicePixelRatio || 1, lowEnd ? 1 : 2);
    const cssW = this.canvas.clientWidth || window.innerWidth;
    const cssH = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = cssW * dpr;
    this.canvas.height = cssH * dpr;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);
    this.width = cssW;
    this.height = cssH;
  }

  clear(): void {
    this.ctx.fillStyle = CANVAS_BG;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  /** Call once per frame before any draw calls. */
  beginFrame(nowMs: number): void {
    this._now = nowMs;
  }

  drawHighway(_scrollOffset: number, visibleRange?: VisibleRange | null): void {
    const ctx = this.ctx;
    const hitZoneY = this.height * HIT_ZONE_Y_RATIO;
    const highwayTop = 0;
    const highwayBottom = hitZoneY + HIGHWAY_BELOW_HIT_ZONE;
    const keyWidth = whiteKeyWidth(this.width, visibleRange);

    ctx.fillStyle = HIGHWAY_BG;
    ctx.fillRect(0, highwayTop, this.width, highwayBottom - highwayTop);

    ctx.strokeStyle = HIGHWAY_LANE_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const laneCount = visibleRange
      ? countWhiteKeysInRange(visibleRange)
      : WHITE_KEY_COUNT;
    for (let i = 1; i < laneCount; i++) {
      const x = i * keyWidth;
      ctx.moveTo(x, highwayTop);
      ctx.lineTo(x, highwayBottom);
    }
    ctx.stroke();

  }

  drawHitZone(pressedLanes: Set<number>, visibleRange?: VisibleRange | null): void {
    this.piano.drawHitZone(this.ctx, this.width, this.height, pressedLanes, visibleRange);
  }

  drawPiano(pressedLanes: Set<number>, visibleRange?: VisibleRange | null): void {
    this.piano.drawPiano(this.ctx, this.width, this.height, pressedLanes, visibleRange);
  }

  /** Return the pixel (x, y) of a note's head on the sheet, using the
   *  coordinate state set by the most recent drawSheetMusic() call.
   *  Returns null if the note falls outside the current view or if the
   *  renderer has no valid layout yet. */
  notePixelPosition(note: SongNote): { x: number; y: number } | null {
    if (this.sheetBarW <= 0) return null;
    const { sheetBarX: barX, sheetBarW: barW, sheetViewStart: vs, sheetViewEnd: ve } = this;
    if (note.time < vs || note.time > ve) return null;

    const staffLineSpacing = SHEET_STAFF_LINE_SPACING * this.sheetScale;
    const pos = SHEET_NOTE_POSITIONS[note.key];
    if (pos === undefined) return null;

    const staffTop = note.hand === HandSide.Left ? this.sheetBassTop : this.sheetTrebleTop;
    const x = barX + ((note.time - vs) / (ve - vs)) * barW;
    const y = staffTop + (7 - pos) * (staffLineSpacing / 2);
    return { x, y };
  }

  private _noteLayout(laneIndex: number, y: number, noteHeight: number, sheetBottom: number, noteName?: string, visibleRange?: VisibleRange | null): NoteLayout {
    const layout = getPianoKeyLayout(noteName ?? NOTE_NAMES[laneIndex] ?? 'C4', this.width, visibleRange);
    const x = layout.x;
    const keyWidth = layout.width;
    const padding = Math.max(1, keyWidth * 0.06);

    const hitZoneY = this.height * HIT_ZONE_Y_RATIO;
    const scaleRange = hitZoneY - sheetBottom;
    const headBottom = y + noteHeight;
    const clampedY = Math.max(sheetBottom, Math.min(headBottom, hitZoneY));
    const scale = 0.45 + 0.55 * ((clampedY - sheetBottom) / scaleRange);

    const HEAD_HEIGHT = 14;
    const scaledHeadHeight = HEAD_HEIGHT * scale;
    const scaledTailHeight = Math.max(0, noteHeight * scale - scaledHeadHeight);
    const scaledWidth = (keyWidth - padding * 2) * scale;
    const centerX = x + keyWidth / 2;

    return {
      drawX: centerX - scaledWidth / 2,
      drawY: headBottom - scaledHeadHeight - scaledTailHeight,
      scaledWidth,
      scaledHeadHeight,
      scaledTailHeight,
      cornerRadius: 3 * scale,
      scale,
    };
  }

  private _drawNotePart(ctx: CanvasRenderingContext2D, drawX: number, drawY: number, w: number, h: number, r: number, color: string | CanvasGradient): void {
    ctx.fillStyle = color;
    roundRect(ctx, drawX, drawY, w, h, r);
    ctx.fill();
  }

  drawNote(laneIndex: number, y: number, noteHeight: number, color: string, alpha: number, sheetBottom: number, combo: number, noteName?: string, holding?: boolean, failing?: boolean, waiting?: boolean, visibleRange?: VisibleRange | null): void {
    const ctx = this.ctx;
    const drawColor = failing && noteName
      ? (handForKey(noteName) === HandSide.Left ? FAIL_COLOR_LEFT : FAIL_COLOR_RIGHT)
      : color;
    const L = this._noteLayout(laneIndex, y, noteHeight, sheetBottom, noteName, visibleRange);

    ctx.globalAlpha = alpha;

    let waitingGlowWidth = 0;
    if (waiting) {
      const pulse = 0.5 + 0.5 * Math.sin(this._now / 200 * 3.2);
      waitingGlowWidth = 4 + pulse * 8;
    }

    if (waitingGlowWidth > 0) {
      ctx.globalAlpha = alpha * 0.25;
      ctx.fillStyle = drawColor;
      roundRect(ctx, L.drawX - waitingGlowWidth, L.drawY - waitingGlowWidth, L.scaledWidth + waitingGlowWidth * 2, L.scaledHeadHeight + L.scaledTailHeight + waitingGlowWidth * 2, L.cornerRadius + waitingGlowWidth);
      ctx.fill();
      ctx.globalAlpha = alpha;
    }

    if (L.scaledTailHeight > 0.5) {
      this._drawNotePart(ctx, L.drawX, L.drawY, L.scaledWidth, L.scaledTailHeight, L.cornerRadius, drawColor);
      ctx.globalAlpha = alpha * TAIL_HIGHLIGHT_ALPHA;
      ctx.fillStyle = NOTE_HIGHLIGHT_COLOR;
      roundRect(ctx, L.drawX, L.drawY, L.scaledWidth, L.scaledTailHeight, L.cornerRadius);
      ctx.fill();
      ctx.globalAlpha = alpha;
    }

    const headDrawY = L.drawY + L.scaledTailHeight;
    this._drawNotePart(ctx, L.drawX, headDrawY, L.scaledWidth, L.scaledHeadHeight, L.cornerRadius, drawColor);
    ctx.globalAlpha = alpha * HEAD_HIGHLIGHT_ALPHA;
    ctx.fillStyle = NOTE_HIGHLIGHT_COLOR;
    roundRect(ctx, L.drawX, headDrawY, L.scaledWidth, L.scaledHeadHeight, L.cornerRadius);
    ctx.fill();
    ctx.globalAlpha = alpha;

    if (holding) {
      const cx = L.drawX + L.scaledWidth / 2;
      const baseY = headDrawY + L.scaledHeadHeight / 2;
      this._drawFlame(ctx, cx, baseY, L.scaledWidth, combo);
    }

    if (noteName) {
      this._drawNoteLabel(ctx, noteName, L.drawX, headDrawY, L.scaledWidth, L.scaledHeadHeight);
    }

    ctx.globalAlpha = 1;
  }

  private _drawNoteLabel(ctx: CanvasRenderingContext2D, noteName: string, drawX: number, drawY: number, width: number, height: number): void {
    const shortName = NOTE_SHORT_NAMES[noteName] ?? noteName;
    const fontSize = Math.max(11, width * 0.6);
    ctx.font = `bold ${fontSize}px Courier New`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = NOTE_HEAD_LABEL_COLOR;
    ctx.fillText(shortName, drawX + width / 2, drawY + height);
  }

  private _getFlameSprite(w: number): HTMLCanvasElement {
    const bucket = Math.round(w / 2) * 2;
    const cached = this._flameCache.get(bucket);
    if (cached) return cached;

    const baseW = Math.max(4, bucket);
    const baseH = baseW * 3.5;

    const sprite = document.createElement('canvas');
    sprite.width = Math.ceil(baseW * 2);
    sprite.height = Math.ceil(baseH);
    const fctx = sprite.getContext('2d')!;
    const cx = baseW;
    const baseY = baseH;

    const grad = fctx.createRadialGradient(cx, baseY, 0, cx, baseY, baseH);
    grad.addColorStop(0, HOLD_OUTER_HOT);
    grad.addColorStop(0.3, HOLD_OUTER_WARM);
    grad.addColorStop(0.6, HOLD_OUTER_COOL);
    grad.addColorStop(1, HOLD_OUTER_FADE);

    fctx.beginPath();
    fctx.moveTo(cx - baseW * 0.6, baseY);
    fctx.quadraticCurveTo(cx, baseY - baseH * 0.6, cx, baseY - baseH);
    fctx.quadraticCurveTo(cx, baseY - baseH * 0.6, cx + baseW * 0.6, baseY);
    fctx.closePath();
    fctx.fillStyle = grad;
    fctx.fill();

    const innerH = baseH * 0.45;
    const innerW = baseW * 0.4;
    const grad2 = fctx.createRadialGradient(cx, baseY - innerH * 0.3, 0, cx, baseY, innerH);
    grad2.addColorStop(0, HOLD_CORE_WHITE);
    grad2.addColorStop(0.4, HOLD_CORE_BRIGHT);
    grad2.addColorStop(1, HOLD_CORE_FADE);

    fctx.beginPath();
    fctx.moveTo(cx - innerW, baseY);
    fctx.quadraticCurveTo(cx - innerW, baseY - innerH * 0.5, cx, baseY - innerH);
    fctx.quadraticCurveTo(cx + innerW, baseY - innerH * 0.5, cx + innerW, baseY);
    fctx.closePath();
    fctx.fillStyle = grad2;
    fctx.fill();

    this._flameCache.set(bucket, sprite);
    return sprite;
  }

  private _drawFlame(ctx: CanvasRenderingContext2D, cx: number, baseY: number, width: number, combo: number): void {
    const sprite = this._getFlameSprite(width);
    const baseScale = width / Math.max(4, Math.round(width / 2) * 2);

    const comboBoost = Math.min(1, Math.log(1 + combo) / Math.log(81));
    const scale = baseScale * (1 + comboBoost * 0.6);

    const t = this._now / 1000;
    const flickerAmp = 0.12 + comboBoost * 0.06;
    const flicker = 0.82
      + flickerAmp * Math.sin(t * 7.7)
      + flickerAmp * 0.5 * Math.sin(t * 12.1);
    const heightFlicker = flicker * (1 + (0.04 + comboBoost * 0.03) * Math.sin(t * 5.3));

    if (!this._isLowEnd) {
      const GLOW_CENTER = 'rgba(255, 140, 30, ';
      const GLOW_MID = 'rgba(255, 80, 0, ';
      const GLOW_EDGE = 'rgba(255, 50, 0, 0)';
      const glowR = width * (1.2 + comboBoost * 1.2);
      const glowGrad = ctx.createRadialGradient(cx, baseY, 0, cx, baseY, glowR);
      glowGrad.addColorStop(0, `${GLOW_CENTER}${(0.12 + comboBoost * 0.15).toFixed(3)})`);
      glowGrad.addColorStop(0.5, `${GLOW_MID}${(0.05 + comboBoost * 0.06).toFixed(3)})`);
      glowGrad.addColorStop(1, GLOW_EDGE);
      ctx.globalAlpha = flicker;
      ctx.fillStyle = glowGrad;
      ctx.fillRect(cx - glowR, baseY - glowR, glowR * 2, glowR * 2);

      if (comboBoost > 0.5) {
        const hotR = width * (0.4 + comboBoost * 0.4);
        const hotGrad = ctx.createRadialGradient(cx, baseY, 0, cx, baseY, hotR);
        hotGrad.addColorStop(0, `rgba(255, 240, 200, ${(comboBoost - 0.5) * 0.25})`);
        hotGrad.addColorStop(1, 'rgba(255, 200, 100, 0)');
        ctx.fillStyle = hotGrad;
        ctx.fillRect(cx - hotR, baseY - hotR, hotR * 2, hotR * 2);
      }
    }

    ctx.globalAlpha = flicker;
    ctx.drawImage(
      sprite,
      cx - sprite.width / 2 * scale,
      baseY - sprite.height * scale * heightFlicker,
      sprite.width * scale,
      sprite.height * scale * heightFlicker
    );

    if (!this._isLowEnd) {
      const wispScale = scale * (0.4 + comboBoost * 0.25);
      const wispOffsetX = width * 0.12 * Math.sin(t * 6.1);
      ctx.globalAlpha = flicker * (0.55 + comboBoost * 0.2);
      ctx.drawImage(
        sprite,
        cx + wispOffsetX - sprite.width / 2 * wispScale,
        baseY - sprite.height * wispScale * heightFlicker * 0.85,
        sprite.width * wispScale,
        sprite.height * wispScale * heightFlicker * 0.85
      );

      const coreScale = scale * (0.28 + comboBoost * 0.14);
      ctx.globalAlpha = flicker * (0.7 + comboBoost * 0.15);
      ctx.drawImage(
        sprite,
        cx - sprite.width / 2 * coreScale,
        baseY - sprite.height * coreScale * heightFlicker * 0.7,
        sprite.width * coreScale,
        sprite.height * coreScale * heightFlicker * 0.7
      );
    }

    ctx.globalAlpha = 1;

    if (!this._isLowEnd) {
      const emberCount = 2 + Math.floor(comboBoost * 5);
      for (let i = 0; i < emberCount; i++) {
        if (Math.random() > 0.3 + comboBoost * 0.3) continue;
        this.particles.push({
          x: cx + (Math.random() - 0.5) * width * (0.5 + comboBoost * 0.3),
          y: baseY - sprite.height * scale * heightFlicker * (0.5 + Math.random() * 0.5),
          vx: (Math.random() - 0.5) * (1.5 + comboBoost * 1),
          vy: -(1.5 + Math.random() * 2.5 + comboBoost * 2),
          size: 0.8 + Math.random() * (1.2 + comboBoost * 0.8),
          color: Math.random() > 0.4 ? HOLD_EMBER_LIGHT : HOLD_EMBER_DARK,
          life: 0.3 + Math.random() * (0.3 + comboBoost * 0.2),
        });
      }
    }
  }

  private _findFirstIndex(notes: SongNote[], time: number): number {
    let lo = 0;
    let hi = notes.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (notes[mid].time < time) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    return lo;
  }

  private _renderStaffCache(sheetTop: number, trebleTop: number, bassTop: number, staffLineSpacing: number, _clefW: number, margin: number, sheetBottom: number): void {
    const w = this.canvas.width;
    const h = sheetBottom;
    this._staffCache = document.createElement('canvas');
    this._staffCache.width = w;
    this._staffCache.height = h;
    const ctx = this._staffCache.getContext('2d')!;

    ctx.fillStyle = CANVAS_BG;
    ctx.fillRect(0, sheetTop, w, sheetBottom);

    ctx.strokeStyle = STAFF_LINE_COLOR;
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(margin, trebleTop + i * staffLineSpacing);
      ctx.lineTo(w - margin, trebleTop + i * staffLineSpacing);
      ctx.stroke();
    }
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(margin, bassTop + i * staffLineSpacing);
      ctx.lineTo(w - margin, bassTop + i * staffLineSpacing);
      ctx.stroke();
    }

    ctx.fillStyle = CLEF_COLOR;
    ctx.font = `bold ${staffLineSpacing * 5}px serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('\uD834\uDD1E', margin + 2, trebleTop + 2 * staffLineSpacing);
    ctx.fillText('\uD834\uDD22', margin + 2, bassTop + 2 * staffLineSpacing);

    this._cachedStaffScale = this.sheetScale;
    this._cachedStaffWidth = this.width;
  }

  drawSheetMusic(
    trebleNotes: SongNote[],
    bassNotes: SongNote[],
    currentTime: number,
    songDuration: number,
    loop?: { start: number | null; end: number | null; active: boolean; defining: LoopDefinitionState },
    viewWindow?: { start: number; end: number },
    bpm = 120,
  ): void {
    if (!trebleNotes.length && !bassNotes.length || songDuration <= 0) return;
    const ctx = this.ctx;
    const sheetTop = SHEET_TOP_OFFSET;
    const staffLineSpacing = SHEET_STAFF_LINE_SPACING * this.sheetScale;
    const staffH = 4 * staffLineSpacing;
    const clefW = CLEF_WIDTH * this.sheetScale;
    const margin = SHEET_MARGIN * this.sheetScale;

    const trebleTop = sheetTop + STAFF_TOP_PADDING * this.sheetScale;
    const bassTop = trebleTop + staffH + STAFF_GAP * this.sheetScale;
    const sheetBottom = bassTop + staffH + STAFF_BOTTOM_PADDING * this.sheetScale;
    this.sheetBottom = sheetBottom;
    this.sheetTrebleTop = trebleTop;
    this.sheetTrebleBottom = trebleTop + staffH;
    this.sheetBassTop = bassTop;
    this.sheetBassBottom = bassTop + staffH;

    if (!this._staffCache || this._cachedStaffScale !== this.sheetScale || this._cachedStaffWidth !== this.width) {
      this._renderStaffCache(sheetTop, trebleTop, bassTop, staffLineSpacing, clefW, margin, sheetBottom);
    }
    ctx.drawImage(this._staffCache!, 0, 0);

    const barX = margin + clefW;
    const barW = this.width - barX - margin;
    const viewStart = viewWindow ? viewWindow.start : currentTime - 0.5;
    const viewEnd = viewWindow ? viewWindow.end : currentTime + SHEET_BEATS_VISIBLE * (60 / bpm);
    this.sheetBarX = barX;
    this.sheetBarW = barW;
    this.sheetViewStart = viewStart;
    this.sheetViewEnd = viewEnd;

    const L: SheetLayout = { ctx, sheetTop, sheetBottom, barX, barW, viewStart, viewEnd, staffLineSpacing };

    this._drawBeatLines(L, bpm);
    this._drawSheetNotes(trebleNotes, trebleTop, L);
    this._drawSheetNotes(bassNotes, bassTop, L);
    this._drawPlaybackCursor(L, currentTime, viewWindow);
    this._drawLoopRegion(L, loop, trebleNotes, bassNotes);

    ctx.strokeStyle = SHEET_BORDER_COLOR;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, sheetBottom);
    ctx.lineTo(this.width, sheetBottom);
    ctx.stroke();
  }

  private _drawBeatLines(L: SheetLayout, bpm: number): void {
    const { ctx, sheetTop, sheetBottom, barX, barW, viewStart, viewEnd } = L;
    const firstBeat = Math.ceil(viewStart / (60 / bpm));
    const lastBeat = Math.floor(viewEnd / (60 / bpm));

    // Batch measure lines
    ctx.strokeStyle = MEASURE_LINE_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let beat = firstBeat; beat <= lastBeat; beat++) {
      if (beat % SHEET_BEATS_PER_MEASURE !== 0) continue;
      const beatTime = beat * (60 / bpm);
      const x = barX + ((beatTime - viewStart) / (viewEnd - viewStart)) * barW;
      ctx.moveTo(x, sheetTop);
      ctx.lineTo(x, sheetBottom);
    }
    ctx.stroke();

    // Batch beat lines
    ctx.strokeStyle = BEAT_LINE_COLOR;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let beat = firstBeat; beat <= lastBeat; beat++) {
      if (beat % SHEET_BEATS_PER_MEASURE === 0) continue;
      const beatTime = beat * (60 / bpm);
      const x = barX + ((beatTime - viewStart) / (viewEnd - viewStart)) * barW;
      ctx.moveTo(x, sheetTop);
      ctx.lineTo(x, sheetBottom);
    }
    ctx.stroke();
  }

  private _drawSheetNote(note: SongNote, staffTop: number, L: SheetLayout): void {
    const { ctx, barX, barW, viewStart, viewEnd, staffLineSpacing } = L;
    const pos = SHEET_NOTE_POSITIONS[note.key];
    if (pos === undefined) return;
    const noteY = staffTop + (7 - pos) * (staffLineSpacing / 2);

    const x = barX + ((note.time - viewStart) / (viewEnd - viewStart)) * barW;
    const r = SHEET_NOTE_RADIUS * this.sheetScale;
    const color = note.selected ? handColor(note.key) : BACKING_COLOR;
    const filled = note.duration < 0.75;

    if (note.failing) {
      const sheetColor = handForKey(note.key) === HandSide.Left ? FAIL_COLOR_SHEET_LEFT : FAIL_COLOR_SHEET_RIGHT;
      ctx.fillStyle = sheetColor;
      ctx.strokeStyle = sheetColor;
    } else if (note.hit) {
      ctx.fillStyle = HIT_NOTE_COLOR;
      ctx.strokeStyle = HIT_NOTE_COLOR;
    } else {
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
    }
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(x, noteY, r + 0.5, r, -0.2, 0, Math.PI * 2);
    if (filled) {
      ctx.fill();
    } else {
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    const stemLen = staffLineSpacing * 2.5;
    const stemUp = pos <= 3;
    const stemDir = stemUp ? -1 : 1;
    const stemX = stemUp ? x + r : x - r;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(stemX, noteY);
    ctx.lineTo(stemX, noteY + stemDir * stemLen);
    ctx.stroke();

    if (note.duration < 0.3 && !this._isLowEnd) {
      const flagBaseY = noteY + stemDir * stemLen;
      ctx.beginPath();
      ctx.moveTo(stemX, flagBaseY);
      ctx.quadraticCurveTo(stemX + 6 * this.sheetScale, flagBaseY + stemDir * 4 * this.sheetScale, stemX + 2 * this.sheetScale, flagBaseY + stemDir * 9 * this.sheetScale);
      ctx.stroke();
    }
  }

  private _drawSheetNotes(notes: SongNote[], staffTop: number, L: SheetLayout): void {
    const start = this._findFirstIndex(notes, L.viewStart);
    for (let i = start; i < notes.length; i++) {
      const note = notes[i];
      if (note.time > L.viewEnd) break;
      this._drawSheetNote(note, staffTop, L);
    }
  }

  private _drawPlaybackCursor(L: SheetLayout, currentTime: number, viewWindow?: { start: number; end: number }): void {
    const { ctx, barX, barW, viewStart, viewEnd, sheetTop, sheetBottom } = L;
    const showCursor = viewWindow
      ? currentTime >= viewStart && currentTime <= viewEnd
      : true;
    if (!showCursor) return;
    const cursorX = viewWindow
      ? barX + ((currentTime - viewStart) / (viewEnd - viewStart)) * barW
      : barX;
    ctx.fillStyle = PLAYBACK_CURSOR_COLOR;
    if (viewWindow) {
      ctx.globalAlpha = 0.25;
      ctx.fillRect(cursorX - 4, sheetTop, 8, sheetBottom - sheetTop);
      ctx.globalAlpha = 1;
      ctx.fillRect(cursorX - 1, sheetTop, 2, sheetBottom - sheetTop);
    } else {
      ctx.globalAlpha = 0.25;
      ctx.fillRect(cursorX - 3, sheetTop, 6, sheetBottom - sheetTop);
      ctx.globalAlpha = 1;
      ctx.fillRect(cursorX - 0.5, sheetTop, 1.5, sheetBottom - sheetTop);
    }
  }

  private _drawLoopRegion(
    L: SheetLayout,
    loop: { start: number | null; end: number | null; active: boolean; defining: LoopDefinitionState } | undefined,
    trebleNotes: SongNote[],
    bassNotes: SongNote[],
  ): void {
    const { ctx, barX, barW, viewStart, viewEnd, sheetTop, sheetBottom } = L;
    const loopStart = loop?.start ?? null;
    const loopEnd = loop?.end ?? null;
    const loopDefining = loop?.defining ?? LoopDefinitionState.Off;

    const drawMarker = (t: number, color: string, label: string): void => {
      if (t < viewStart || t > viewEnd) return;
      const lx = barX + ((t - viewStart) / (viewEnd - viewStart)) * barW;
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.2;
      ctx.fillRect(lx - 3, sheetTop, 6, sheetBottom - sheetTop);
      ctx.globalAlpha = 1;
      ctx.fillRect(lx - 1, sheetTop, 2, sheetBottom - sheetTop);
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(label, lx, sheetTop - 10);
    };

    const highlightAt = (t: number, color: string, alpha: number): void => {
      if (t < viewStart || t > viewEnd) return;
      let best: SongNote | null = null;
      let bestDiff = Infinity;
      for (const n of trebleNotes) {
        const d = Math.abs(n.time - t);
        if (d < bestDiff) { bestDiff = d; best = n; }
      }
      for (const n of bassNotes) {
        const d = Math.abs(n.time - t);
        if (d < bestDiff) { bestDiff = d; best = n; }
      }
      if (!best) return;
      const pixelPos = this.notePixelPosition(best);
      if (!pixelPos) return;
      const r = (SHEET_NOTE_RADIUS + 5) * this.sheetScale;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(pixelPos.x, pixelPos.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5 * this.sheetScale;
      ctx.stroke();
      ctx.restore();
    };

    if (loopStart !== null && loopEnd !== null) {
      const lx0 = barX + ((loopStart - viewStart) / (viewEnd - viewStart)) * barW;
      const lx1 = barX + ((loopEnd - viewStart) / (viewEnd - viewStart)) * barW;
      ctx.save();
      ctx.fillStyle = loop?.active ? LOOP_OVERLAY_ACTIVE : LOOP_OVERLAY_INACTIVE;
      ctx.fillRect(Math.min(lx0, lx1), sheetTop, Math.abs(lx1 - lx0), sheetBottom - sheetTop);
      ctx.restore();
      drawMarker(loopStart, LOOP_MARKER_COLOR, 'A');
      drawMarker(loopEnd, LOOP_MARKER_COLOR, 'B');
      highlightAt(loopStart, LOOP_MARKER_COLOR, 0.7);
      highlightAt(loopEnd, LOOP_MARKER_COLOR, 0.7);
    } else if (loopDefining === LoopDefinitionState.End && loopStart !== null) {
      drawMarker(loopStart, LOOP_MARKER_COLOR, 'A');
      highlightAt(loopStart, LOOP_MARKER_COLOR, 0.9);
      const lx0 = barX + ((loopStart - viewStart) / (viewEnd - viewStart)) * barW;
      ctx.save();
      ctx.fillStyle = LOOP_DEFINING_PREVIEW;
      ctx.fillRect(Math.max(lx0, barX), sheetTop, barX + barW - Math.max(lx0, barX), sheetBottom - sheetTop);
      ctx.restore();
    } else if (loopDefining === LoopDefinitionState.Start && loopStart !== null) {
      drawMarker(loopStart, LOOP_MARKER_COLOR, 'A');
    }
  }

  drawParticles(): void {
    const ctx = this.ctx;
    const particles = this.particles;
    let i = 0;
    while (i < particles.length) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.15;
      p.life -= 0.025;

      if (p.life <= 0) {
        particles[i] = particles[particles.length - 1];
        particles.pop();
        continue;
      }

      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
      i++;
    }
    ctx.globalAlpha = 1;
  }

  spawnParticles(x: number, y: number, color: string, count: number): void {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 8,
        vy: (Math.random() - 0.5) * 8 - 3,
        size: 2 + Math.random() * 3,
        color,
        life: 1,
      });
    }
  }
}

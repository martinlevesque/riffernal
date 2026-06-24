import { NOTE_NAMES, NOTE_COLORS, getPianoKeyLayout, WHITE_KEY_COUNT, BLACK_KEY_WIDTH_RATIO, handForKey, handColor, HandSide, NOTE_SHORT_NAMES } from '../utils/notes.js';
import { KEYBOARD_MAP } from '../input/KeyboardInput.js';
import { HIT_ZONE_Y_RATIO } from './NoteManager.js';
import { LoopDefinitionState } from './Loop.js';
import type { SongNote } from './NoteManager.js';

export const PIANO_HEIGHT_RATIO = 0.16;

export const SHEET_TOP_OFFSET = 84;

const BACKING_COLOR = '#555566';

export const FAIL_COLOR_LEFT = '#aa2266';
export const FAIL_COLOR_RIGHT = '#aa3322';
export const FAIL_COLOR_SHEET_LEFT = '#662244';
export const FAIL_COLOR_SHEET_RIGHT = '#882222';

export const FAIL_PARTICLE_LEFT = '#ff44aa';
export const FAIL_PARTICLE_RIGHT = '#ff8822';

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

function codeToDisplay(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const special: Record<string, string> = { Semicolon: ';', Comma: ',', Period: '.', Slash: '/', Backslash: '\\', BracketLeft: '[', BracketRight: ']', Minus: '-', Equal: '=', Quote: "'", Backquote: '`' };
  return special[code] || '';
}

const SHEET_NOTE_POSITIONS: Record<string, number> = Object.assign(
  Object.fromEntries(Object.entries(BASS_STAFF_POSITIONS).map(([k, v]) => [k, v - 3])),
  TREBLE_STAFF_POSITIONS
);

const TAIL_HIGHLIGHT_ALPHA = 0.06;
const HEAD_HIGHLIGHT_ALPHA = 0.18;

interface NoteLayout {
  drawX: number;
  drawY: number;
  scaledWidth: number;
  scaledHeadHeight: number;
  scaledTailHeight: number;
  cornerRadius: number;
  scale: number;
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
  private _keyDisplayMap: Record<string, string>;
  private _staffCache: HTMLCanvasElement | null = null;
  private _cachedStaffScale = -1;
  private _cachedStaffWidth = -1;
  private _flameCache = new Map<number, HTMLCanvasElement>();
  private _pianoCache: HTMLCanvasElement | null = null;
  private _cachedPianoState = 0;
  private _cachedPianoWidth = -1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this._keyDisplayMap = Object.fromEntries(
      Object.entries(KEYBOARD_MAP).map(([code, note]) => [note, codeToDisplay(code)])
    );
    this.resize();
  }

  resize(): void {
    const dpr = window.devicePixelRatio || 1;
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
    this.ctx.fillStyle = '#0a0a0a';
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  drawHighway(_scrollOffset: number): void {
    const ctx = this.ctx;
    const hitZoneY = this.height * HIT_ZONE_Y_RATIO;
    const highwayTop = 0;
    const highwayBottom = hitZoneY + 10;
    const whiteKeyWidth = this.width / WHITE_KEY_COUNT;

    ctx.fillStyle = '#0e0e0e';
    ctx.fillRect(0, highwayTop, this.width, highwayBottom - highwayTop);

    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;
    for (let i = 1; i < WHITE_KEY_COUNT; i++) {
      const x = i * whiteKeyWidth;
      ctx.beginPath();
      ctx.moveTo(x, highwayTop);
      ctx.lineTo(x, highwayBottom);
      ctx.stroke();
    }

  }

  drawHitZone(pressedLanes: Set<number>): void {
    const hitZoneY = this.height * HIT_ZONE_Y_RATIO;
    const offsetY = hitZoneY - 30;
    this._ensureBottomCache(pressedLanes);
    if (this._pianoCache) {
      const regionH = 34;
      this.ctx.drawImage(this._pianoCache, 0, 0, this.width, regionH, 0, offsetY, this.width, regionH);
    }
  }

  private _ensureBottomCache(pressedLanes: Set<number>): void {
    let state = 0;
    for (const lane of pressedLanes) state |= 1 << lane;
    if (state === this._cachedPianoState && this.width === this._cachedPianoWidth && this._pianoCache) return;
    this._cachedPianoState = state;
    this._cachedPianoWidth = this.width;

    const hitZoneY = this.height * HIT_ZONE_Y_RATIO;
    const pianoTop = this.height - this.height * PIANO_HEIGHT_RATIO;
    const pianoH = this.height * PIANO_HEIGHT_RATIO;
    const totalH = this.height - hitZoneY + 30;
    const offsetY = hitZoneY - 30;

    if (!this._pianoCache || this._pianoCache.width !== this.width || this._pianoCache.height !== totalH) {
      this._pianoCache = document.createElement('canvas');
      this._pianoCache.width = this.width;
      this._pianoCache.height = Math.ceil(totalH);
    }
    const ctx = this._pianoCache.getContext('2d')!;
    ctx.clearRect(0, 0, this.width, totalH);

    const whiteKeyWidth = this.width / WHITE_KEY_COUNT;
    const blackKeyWidth = whiteKeyWidth * BLACK_KEY_WIDTH_RATIO;
    const blackKeyHeight = pianoH * 0.56;

    for (let i = 0; i < NOTE_NAMES.length; i++) {
      const noteName = NOTE_NAMES[i];
      const layout = getPianoKeyLayout(noteName, this.width);
      const isPressed = pressedLanes.has(i);
      const color = NOTE_COLORS[noteName] || '#ffffff';

      ctx.globalAlpha = isPressed ? 0.5 : 0.8;
      ctx.fillStyle = isPressed ? color : '#222';
      ctx.fillRect(layout.x, hitZoneY - 4 - offsetY, layout.width, 8);

      if (isPressed) {
        ctx.globalAlpha = 0.15;
        ctx.fillStyle = color;
        ctx.fillRect(layout.x, hitZoneY - 30 - offsetY, layout.width, 60);
      }
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, pianoTop - 2 - offsetY, this.width, pianoH + 2);

    for (let i = 0; i < NOTE_NAMES.length; i++) {
      const noteName = NOTE_NAMES[i];
      const isBlack = noteName.includes('#');
      if (isBlack) continue;
      const layout = getPianoKeyLayout(noteName, this.width);
      const isPressed = pressedLanes.has(i);
      const color = NOTE_COLORS[noteName] || '#ffffff';

      ctx.fillStyle = isPressed ? '#555' : '#2a2a2a';
      ctx.fillRect(layout.x + 1, pianoTop + 1 - offsetY, whiteKeyWidth - 2, pianoH - 2);

      if (isPressed) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 15;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(layout.x + 1, pianoTop + 1 - offsetY, whiteKeyWidth - 2, pianoH - 2);
        ctx.shadowBlur = 0;
      }

      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(layout.x, pianoTop - offsetY);
      ctx.lineTo(layout.x, this.height - offsetY);
      ctx.stroke();

      const labelY = pianoTop - offsetY + pianoH * 0.72;
      const shortName = NOTE_SHORT_NAMES[noteName] ?? noteName;
      ctx.fillStyle = isPressed ? '#fff' : '#666';
      ctx.font = `${Math.max(11, whiteKeyWidth * 0.3)}px Courier New`;
      ctx.textAlign = 'center';
      ctx.fillText(shortName, layout.x + whiteKeyWidth / 2, labelY);

      const kbKey = this._getKeyForNote(noteName);
      if (kbKey) {
        ctx.fillStyle = isPressed ? '#aaa' : '#444';
        ctx.font = `bold ${Math.max(9, whiteKeyWidth * 0.22)}px Courier New`;
        ctx.fillText(`[${kbKey}]`, layout.x + whiteKeyWidth / 2, labelY + 13);
      }
    }

    for (let i = 0; i < NOTE_NAMES.length; i++) {
      const noteName = NOTE_NAMES[i];
      const isBlack = noteName.includes('#');
      if (!isBlack) continue;
      const layout = getPianoKeyLayout(noteName, this.width);
      const isPressed = pressedLanes.has(i);

      ctx.fillStyle = isPressed ? '#666' : '#111';
      const ctxR = ctx as CanvasRenderingContext2D;
      roundRect(ctxR, layout.x, pianoTop - offsetY, blackKeyWidth, blackKeyHeight, 2);
      ctx.fill();

      if (isPressed) {
        const bcolor = NOTE_COLORS[noteName] || '#ffffff';
        ctx.shadowColor = bcolor;
        ctx.shadowBlur = 12;
        ctx.strokeStyle = bcolor;
        ctx.lineWidth = 1.5;
        roundRect(ctxR, layout.x + 1, pianoTop + 1 - offsetY, blackKeyWidth - 2, blackKeyHeight - 2, 1);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      roundRect(ctxR, layout.x, pianoTop - offsetY, blackKeyWidth, blackKeyHeight, 2);
      ctx.stroke();

      ctx.save();
      roundRect(ctxR, layout.x + 1, pianoTop + 1 - offsetY, blackKeyWidth - 2, blackKeyHeight - 2, 1);
      ctx.clip();

      const blkLabelY = pianoTop - offsetY + blackKeyHeight - 13;
      const blkShort = NOTE_SHORT_NAMES[noteName] ?? noteName;
      ctx.fillStyle = isPressed ? '#ddd' : '#666';
      ctx.font = `${Math.max(6, blackKeyWidth * 0.35)}px Courier New`;
      ctx.textAlign = 'center';
      ctx.fillText(blkShort, layout.x + blackKeyWidth / 2, blkLabelY);

      const blkKb = this._getKeyForNote(noteName);
      if (blkKb) {
        ctx.fillStyle = isPressed ? '#999' : '#444';
        ctx.font = `bold ${Math.max(5, blackKeyWidth * 0.25)}px Courier New`;
        ctx.fillText(`[${blkKb}]`, layout.x + blackKeyWidth / 2, blkLabelY + 7);
      }

      ctx.restore();
    }
  }

  drawPiano(pressedLanes: Set<number>): void {
    const hitZoneY = this.height * HIT_ZONE_Y_RATIO;
    const offsetY = hitZoneY - 30;
    this._ensureBottomCache(pressedLanes);
    if (this._pianoCache) {
      this.ctx.drawImage(this._pianoCache, 0, offsetY);
    }
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

  private _getKeyForNote(noteName: string): string {
    return this._keyDisplayMap[noteName] || '';
  }

  private _noteLayout(laneIndex: number, y: number, noteHeight: number, sheetBottom: number, noteName?: string): NoteLayout {
    const layout = getPianoKeyLayout(noteName ?? NOTE_NAMES[laneIndex] ?? 'C4', this.width);
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

  drawNote(laneIndex: number, y: number, noteHeight: number, color: string, alpha: number, sheetBottom: number, noteName?: string, holding?: boolean, failing?: boolean, waiting?: boolean): void {
    const ctx = this.ctx;
    const drawColor = failing && noteName
      ? (handForKey(noteName) === HandSide.Left ? FAIL_COLOR_LEFT : FAIL_COLOR_RIGHT)
      : color;
    const L = this._noteLayout(laneIndex, y, noteHeight, sheetBottom, noteName);

    ctx.globalAlpha = alpha;

    if (waiting) {
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 200 * 3.2);
      ctx.shadowColor = drawColor;
      ctx.shadowBlur = 8 + pulse * 16;
    }

    if (L.scaledTailHeight > 0.5) {
      this._drawNotePart(ctx, L.drawX, L.drawY, L.scaledWidth, L.scaledTailHeight, L.cornerRadius, drawColor);
      ctx.globalAlpha = alpha * TAIL_HIGHLIGHT_ALPHA;
      ctx.fillStyle = '#fff';
      roundRect(ctx, L.drawX, L.drawY, L.scaledWidth, L.scaledTailHeight, L.cornerRadius);
      ctx.fill();
      ctx.globalAlpha = alpha;
    }

    const headDrawY = L.drawY + L.scaledTailHeight;
    this._drawNotePart(ctx, L.drawX, headDrawY, L.scaledWidth, L.scaledHeadHeight, L.cornerRadius, drawColor);
    ctx.globalAlpha = alpha * HEAD_HIGHLIGHT_ALPHA;
    ctx.fillStyle = '#fff';
    roundRect(ctx, L.drawX, headDrawY, L.scaledWidth, L.scaledHeadHeight, L.cornerRadius);
    ctx.fill();
    ctx.globalAlpha = alpha;

    if (waiting) {
      ctx.shadowBlur = 0;
    }

    if (holding) {
      const cx = L.drawX + L.scaledWidth / 2;
      const baseY = headDrawY + L.scaledHeadHeight / 2;
      this._drawFlame(ctx, cx, baseY, L.scaledWidth);
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
    ctx.fillStyle = '#000';
    ctx.shadowColor = 'rgba(255,255,255,0.6)';
    ctx.shadowBlur = 1;
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
    grad.addColorStop(0, '#ffaa33');
    grad.addColorStop(0.3, '#ff6600');
    grad.addColorStop(0.6, '#cc3300');
    grad.addColorStop(1, 'rgba(200, 50, 0, 0)');

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
    grad2.addColorStop(0, '#ffeecc');
    grad2.addColorStop(0.4, '#ffaa44');
    grad2.addColorStop(1, 'rgba(255, 100, 0, 0)');

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

  private _drawFlame(ctx: CanvasRenderingContext2D, cx: number, baseY: number, width: number): void {
    const sprite = this._getFlameSprite(width);
    const scale = width / Math.max(4, Math.round(width / 2) * 2);
    const flicker = 0.85 + 0.15 * Math.sin(performance.now() / 120 * 4.7);
    ctx.globalAlpha = flicker;
    ctx.drawImage(
      sprite,
      cx - sprite.width / 2 * scale,
      baseY - sprite.height * scale * flicker,
      sprite.width * scale,
      sprite.height * scale * flicker
    );
    ctx.globalAlpha = 1;
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

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, sheetTop, w, sheetBottom);

    ctx.strokeStyle = '#444';
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

    ctx.fillStyle = '#888';
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
    const clefW = 25 * this.sheetScale;
    const margin = 8 * this.sheetScale;

    const trebleTop = sheetTop + 5 * this.sheetScale;
    const bassTop = trebleTop + staffH + 8 * this.sheetScale;
    const sheetBottom = bassTop + staffH + 5 * this.sheetScale;
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

    const firstBeat = Math.ceil(viewStart / (60 / bpm));
    const lastBeat = Math.floor(viewEnd / (60 / bpm));
    for (let beat = firstBeat; beat <= lastBeat; beat++) {
      const beatTime = beat * (60 / bpm);
      const x = barX + ((beatTime - viewStart) / (viewEnd - viewStart)) * barW;
      const isMeasure = beat % SHEET_BEATS_PER_MEASURE === 0;
      ctx.strokeStyle = isMeasure ? '#555' : '#222';
      ctx.lineWidth = isMeasure ? 1 : 0.5;
      ctx.beginPath();
      ctx.moveTo(x, sheetTop);
      ctx.lineTo(x, sheetBottom);
      ctx.stroke();
    }

    const drawSheetNote = (note: SongNote, staffTop: number) => {
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
        ctx.fillStyle = '#555';
        ctx.strokeStyle = '#555';
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

      if (note.duration < 0.3) {
        const flagBaseY = noteY + stemDir * stemLen;
        ctx.beginPath();
        ctx.moveTo(stemX, flagBaseY);
        ctx.quadraticCurveTo(stemX + 6 * this.sheetScale, flagBaseY + stemDir * 4 * this.sheetScale, stemX + 2 * this.sheetScale, flagBaseY + stemDir * 9 * this.sheetScale);
        ctx.stroke();
      }
    };

    const trebleStart = this._findFirstIndex(trebleNotes, viewStart);
    for (let i = trebleStart; i < trebleNotes.length; i++) {
      const note = trebleNotes[i];
      if (note.time > viewEnd) break;
      drawSheetNote(note, trebleTop);
    }
    const bassStart = this._findFirstIndex(bassNotes, viewStart);
    for (let i = bassStart; i < bassNotes.length; i++) {
      const note = bassNotes[i];
      if (note.time > viewEnd) break;
      drawSheetNote(note, bassTop);
    }

    const showCursor = viewWindow
      ? currentTime >= viewStart && currentTime <= viewEnd
      : true;
    if (showCursor) {
      const cursorX = viewWindow
        ? barX + ((currentTime - viewStart) / (viewEnd - viewStart)) * barW
        : barX;
      ctx.fillStyle = '#ff2244';
      ctx.shadowColor = '#ff2244';
      ctx.shadowBlur = 4;
      ctx.fillRect(cursorX - (viewWindow ? 1 : 0.5), sheetTop, viewWindow ? 2 : 1.5, sheetBottom - sheetTop);
      ctx.shadowBlur = 0;
    }

    // Loop region overlay (purple). `loopState` is passed via `loopStart/End/Active/Defining`.
    const loopStart = loop?.start ?? null;
    const loopEnd = loop?.end ?? null;
    const loopDefining = loop?.defining ?? LoopDefinitionState.Off;
    const drawLoopMarker = (t: number, color: string, label: string): void => {
      if (t < viewStart || t > viewEnd) return;
      const lx = barX + ((t - viewStart) / (viewEnd - viewStart)) * barW;
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 6;
      ctx.fillRect(lx - 1, sheetTop, 2, sheetBottom - sheetTop);
      ctx.shadowBlur = 0;
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(label, lx, sheetTop - 10);
    };

    /** Draw a glowing ring around the note at time `t`. */
    const highlightNoteAt = (t: number, color: string, alpha: number): void => {
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
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.restore();
    };

    if (loopStart !== null && loopEnd !== null) {
      const lx0 = barX + ((loopStart - viewStart) / (viewEnd - viewStart)) * barW;
      const lx1 = barX + ((loopEnd - viewStart) / (viewEnd - viewStart)) * barW;
      ctx.save();
      ctx.fillStyle = loop?.active ? 'rgba(170, 102, 255, 0.20)' : 'rgba(120, 90, 180, 0.10)';
      ctx.fillRect(Math.min(lx0, lx1), sheetTop, Math.abs(lx1 - lx0), sheetBottom - sheetTop);
      ctx.restore();
      drawLoopMarker(loopStart, '#aa66ff', 'A');
      drawLoopMarker(loopEnd, '#aa66ff', 'B');
      highlightNoteAt(loopStart, '#aa66ff', 0.7);
      highlightNoteAt(loopEnd, '#aa66ff', 0.7);
    } else if (loopDefining === LoopDefinitionState.End && loopStart !== null) {
      // Start note selected — highlight it and show tentative region to right edge
      drawLoopMarker(loopStart, '#aa66ff', 'A');
      highlightNoteAt(loopStart, '#aa66ff', 0.9);
      // Semi-transparent region from start to the visible right edge
      const lx0 = barX + ((loopStart - viewStart) / (viewEnd - viewStart)) * barW;
      ctx.save();
      ctx.fillStyle = 'rgba(170, 102, 255, 0.07)';
      ctx.fillRect(Math.max(lx0, barX), sheetTop, barX + barW - Math.max(lx0, barX), sheetBottom - sheetTop);
      ctx.restore();
    } else if (loopDefining === LoopDefinitionState.Start && loopStart !== null) {
      drawLoopMarker(loopStart, '#aa66ff', 'A');
    }

    ctx.strokeStyle = '#333';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, sheetBottom);
    ctx.lineTo(this.width, sheetBottom);
    ctx.stroke();
  }

  drawParticles(): void {
    const ctx = this.ctx;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.15;
      p.life -= 0.025;

      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
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

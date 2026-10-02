// Main canvas renderer: highway, notes, sheet music, particles,
// and playback cursor. Delegates piano rendering to PianoRenderer.

import { NOTE_NAMES, getPianoKeyLayout, WHITE_KEY_COUNT, handForKey, handColor, HandSide, NOTE_SHORT_NAMES, whiteKeyWidth, countWhiteKeysInRange } from '../../utils/notes.js';
import type { VisibleRange } from '../../utils/notes.js';
import { HIT_ZONE_Y_RATIO } from '../NoteManager.js';
import { LoopDefinitionState } from '../Loop.js';
import { PianoRenderer, INDICATOR_BAR_OFFSET } from './PianoRenderer.js';
import type { SongNote } from '../NoteManager.js';
import { isLowEndDevice } from '../../utils/device.js';
import { themeManager } from '../../themes/ThemeManager.js';
import { velocityIntensity } from '../../utils/helpers.js';

export const SHEET_TOP_OFFSET = 84;

const HIGHWAY_BELOW_HIT_ZONE = 14;
const CLEF_WIDTH = 25;
const SHEET_MARGIN = 8;
const STAFF_TOP_PADDING = 5;
const STAFF_GAP = 8;
const STAFF_BOTTOM_PADDING = 5;
/** Fraction of CSS resolution canvases render at; the browser upscales
 *  with image-rendering: pixelated for the retro pixel look. */
const PIXEL_RENDER_SCALE = 0.5;

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

interface RGB { r: number; g: number; b: number; }

interface GrindBeam {
  lane: number;
  rgb: RGB;
  endTime: number;
  startMs: number;
}

interface GrindFlash {
  lane: number;
  rgb: RGB;
  startMs: number;
}

const SHEET_STAFF_LINE_SPACING = 10;
const SHEET_NOTE_RADIUS = 4.5;
export const SHEET_BEATS_VISIBLE = 18;
const SHEET_BEATS_PER_MEASURE = 4;

// Size of one "big pixel" on the highway. All note rects snap to this grid,
// which is what makes notes read as chunky blocks instead of smooth shapes.
const NOTE_PIXEL = 3;
const FAIL_BLINK_MS = 250;

function pixelSnap(v: number, unit: number): number {
  return Math.round(v / unit) * unit;
}

function pixelRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, unit: number): void {
  x = pixelSnap(x, unit);
  y = pixelSnap(y, unit);
  w = Math.max(unit, pixelSnap(w, unit));
  h = Math.max(unit, pixelSnap(h, unit));
  ctx.fillRect(x, y, w, h);
}

// Block with a hard border, drawn as two rects so the outline is
// `borderUnit` thick on every side. Position snaps to `snapUnit`, kept
// separate from the border thickness.
function pixelBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, snapUnit: number, borderUnit: number, borderColor: string, fillColor: string): void {
  ctx.fillStyle = borderColor;
  pixelRect(ctx, x - borderUnit, y - borderUnit, w + borderUnit * 2, h + borderUnit * 2, snapUnit);
  ctx.fillStyle = fillColor;
  pixelRect(ctx, x, y, w, h, snapUnit);
}

const SHEET_NOTE_POSITIONS: Record<string, number> = Object.assign(
  Object.fromEntries(Object.entries(BASS_STAFF_POSITIONS).map(([k, v]) => [k, v - 3])),
  TREBLE_STAFF_POSITIONS
);

const TAIL_HIGHLIGHT_ALPHA = 0.10;
const TAIL_HIGHLIGHT_ALPHA_FAIL = 0.06;
const HEAD_HIGHLIGHT_ALPHA = 0.28;
const HEAD_HIGHLIGHT_ALPHA_FAIL = 0.18;

const GRIND_FLASH_MS = 320;
const GRIND_FLASH_HEIGHT = 140;
const GRIND_FLASH_SPARKS = 14;
const GRIND_FLASH_SEGMENTS = 8;
const GRIND_BEAM_SEGMENTS = 18;
const GRIND_JAGGER = 0.32;
const GRIND_BEAM_RAMP_MS = 260;
const LANE_GLOW_HEIGHT = 220;
const GRIND_BEAM_SCROLL_PX_PER_SEC = 400;
const MAX_GRIND_FLASHES = 12;
const GRIND_HIGHLIGHT_COLOR = '#ffffff';

const FLAME_COLORS = [
  { stop: 0, color: 'rgba(255, 210, 70, 0.9)' },
  { stop: 0.25, color: 'rgba(255, 140, 30, 0.55)' },
  { stop: 0.6, color: 'rgba(255, 70, 0, 0.2)' },
  { stop: 1, color: 'rgba(200, 30, 0, 0)' },
] as const;

const FLAME_CORE_COLORS = [
  { stop: 0, color: 'rgba(255, 245, 200, 0.85)' },
  { stop: 0.5, color: 'rgba(255, 200, 100, 0.3)' },
  { stop: 1, color: 'rgba(255, 180, 60, 0)' },
] as const;

interface NoteLayout {
  drawX: number;
  drawY: number;
  scaledWidth: number;
  scaledHeadHeight: number;
  scaledTailHeight: number;
  baseWidth: number;
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
  private _grindBeams = new Map<number, GrindBeam>();
  private _grindFlashes: GrindFlash[] = [];
  private _glowGradCache = new Map<number, { top: number; bottom: number; rgb: RGB; intensity: number; grad: CanvasGradient }>();
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
  private _labelFontCache = new Map<string, string>();
  private _labelFontUi = '';
  private _flameSprites: { outer: HTMLCanvasElement; core: HTMLCanvasElement } | null = null;
  private _haloGrad: CanvasGradient | null = null;
  private _haloKey = '';

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
    const cssW = this.canvas.clientWidth || window.innerWidth;
    const cssH = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.max(1, Math.floor(cssW * PIXEL_RENDER_SCALE));
    this.canvas.height = Math.max(1, Math.floor(cssH * PIXEL_RENDER_SCALE));
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(PIXEL_RENDER_SCALE, PIXEL_RENDER_SCALE);
    this.width = cssW;
    this.height = cssH;
    this._glowGradCache.clear();
    this._haloGrad = null;
  }

  clear(): void {
    this.ctx.fillStyle = themeManager.canvas.bg;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  beginFrame(nowMs: number): void {
    this._now = nowMs;
  }

  drawHighway(_scrollOffset: number, pressedLanes: Map<number, number>, visibleRange?: VisibleRange | null): void {
    const ctx = this.ctx;
    const c = themeManager.canvas;
    const hitZoneY = this.height * HIT_ZONE_Y_RATIO;
    const highwayTop = 0;
    const highwayBottom = hitZoneY + HIGHWAY_BELOW_HIT_ZONE;
    const keyWidth = whiteKeyWidth(this.width, visibleRange);

    ctx.fillStyle = c.highwayBg;
    ctx.fillRect(0, highwayTop, this.width, highwayBottom - highwayTop);

    ctx.strokeStyle = c.highwayLane;
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

    const sheetBottom = this.sheetBottom > 0 ? this.sheetBottom : 0;
    const glowTop = Math.max(sheetBottom, hitZoneY - LANE_GLOW_HEIGHT);

    if (pressedLanes.size > 0) {
      for (const [lane, velocity] of pressedLanes) {
        const noteName = NOTE_NAMES[lane];
        if (!noteName) continue;
        const layout = getPianoKeyLayout(noteName, this.width, visibleRange);
        if (layout.width === 0) continue;
        const intensity = velocityIntensity(velocity);
        const color = handColor(noteName);
        const cx = layout.x + layout.width / 2;
        const colW = layout.width * (0.55 + 0.45 * intensity);
        const grad = this._laneGlowGrad(lane, color, glowTop, hitZoneY, intensity);
        ctx.fillStyle = grad;
        ctx.fillRect(cx - colW / 2, glowTop, colW, hitZoneY - glowTop);
      }
    }

    // The halo only moves when the hit zone moves (resize) or the theme
    // hit-line color changes, so build the gradient once for each state.
    const haloKey = `${hitZoneY}|${c.hitLine}`;
    if (!this._haloGrad || this._haloKey !== haloKey) {
      const grad = ctx.createLinearGradient(0, hitZoneY - 10, 0, hitZoneY + 10);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.5, this._withAlpha(c.hitLine, 0.5));
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      this._haloGrad = grad;
      this._haloKey = haloKey;
    }
    ctx.fillStyle = this._haloGrad;
    ctx.fillRect(0, hitZoneY - 10, this.width, 20);

    ctx.strokeStyle = c.hitLine;
    ctx.lineWidth = 3;
    if (!this._isLowEnd) {
      ctx.shadowColor = c.hitLine;
      ctx.shadowBlur = 16;
    }
    ctx.beginPath();
    ctx.moveTo(0, hitZoneY);
    ctx.lineTo(this.width, hitZoneY);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  private _parseRgb(color: string): RGB {
    if (!color.startsWith('#')) return { r: 0, g: 0, b: 0 };
    const hex = color.slice(1);
    const r = parseInt(hex.length === 3 ? hex[0] + hex[0] : hex.slice(0, 2), 16);
    const g = parseInt(hex.length === 3 ? hex[1] + hex[1] : hex.slice(2, 4), 16);
    const b = parseInt(hex.length === 3 ? hex[2] + hex[2] : hex.slice(4, 6), 16);
    return { r, g, b };
  }

  private _rgba(rgb: RGB, alpha: number): string {
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
  }

  private _withAlpha(color: string, alpha: number): string {
    return this._rgba(this._parseRgb(color), alpha);
  }

  private _laneGlowGrad(lane: number, color: string, top: number, bottom: number, intensity: number): CanvasGradient {
    const rgb = this._parseRgb(color);
    const entry = this._glowGradCache.get(lane);
    if (entry && entry.top === top && entry.bottom === bottom && entry.intensity === intensity
        && entry.rgb.r === rgb.r && entry.rgb.g === rgb.g && entry.rgb.b === rgb.b) {
      return entry.grad;
    }
    const grad = this.ctx.createLinearGradient(0, top, 0, bottom);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, this._rgba(rgb, 0.22 * intensity));
    this._glowGradCache.set(lane, { top, bottom, rgb, intensity, grad });
    return grad;
  }

  drawHitZone(pressedLanes: Map<number, number>, visibleRange?: VisibleRange | null): void {
    this.piano.drawHitZone(this.ctx, this.width, this.height, pressedLanes, visibleRange);
  }

  drawPiano(pressedLanes: Map<number, number>, visibleRange?: VisibleRange | null): void {
    this.piano.drawPiano(this.ctx, this.width, this.height, pressedLanes, visibleRange);
  }

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

  private _noteLayout(laneIndex: number, y: number, noteHeight: number, sheetBottom: number, noteName?: string, failing?: boolean, visibleRange?: VisibleRange | null): NoteLayout {
    const layout = getPianoKeyLayout(noteName ?? NOTE_NAMES[laneIndex] ?? 'C4', this.width, visibleRange);
    const keyWidth = layout.width;
    const centerX = layout.x + keyWidth / 2;

    const hitZoneY = this.height * HIT_ZONE_Y_RATIO;
    const headBottom = y + noteHeight;
    const clampedY = Math.max(sheetBottom, Math.min(headBottom, hitZoneY));

    // One constant silhouette for the whole fall. The visible box (fill +
    // NOTE_PIXEL border per side) snaps DOWN to the key width's grid
    // multiple, so it always fits inside its key — black-key notes included,
    // proportionally narrower than white-key notes, like the keys themselves.
    const HEAD_HEIGHT = 15;
    const scaledHeadHeight = HEAD_HEIGHT;
    const scaledTailHeight = Math.max(0, noteHeight - scaledHeadHeight);
    const outerWidth = Math.floor(keyWidth / NOTE_PIXEL) * NOTE_PIXEL;
    const scaledWidth = Math.max(0, outerWidth - NOTE_PIXEL * 2);
    const drawX = centerX - outerWidth / 2 + NOTE_PIXEL;

    // The note docks its visible bottom edge (fill bottom + border) onto the
    // indicator bar's bottom edge, not the hit line: the bar sits
    // INDICATOR_BAR_OFFSET above the line and the border extends NOTE_PIXEL
    // below the fill, so lift the whole note by their sum. Held and parked
    // notes then rest flush on the bar instead of hanging below it.
    // Failed notes park at the clamped hit-line position (blinking until
    // resolved) so their name badge stays on screen; normal notes keep
    // sliding past it.
    const dockLift = NOTE_PIXEL + INDICATOR_BAR_OFFSET;
    const parkedHeadBottom = (failing ? clampedY : headBottom) - dockLift;

    return {
      drawX,
      drawY: parkedHeadBottom - scaledHeadHeight - scaledTailHeight,
      scaledWidth,
      scaledHeadHeight,
      scaledTailHeight,
      baseWidth: keyWidth,
    };
  }

  private _drawNotePart(ctx: CanvasRenderingContext2D, drawX: number, drawY: number, w: number, h: number, snapUnit: number, borderUnit: number, fillColor: string, borderColor: string): void {
    pixelBox(ctx, drawX, drawY, w, h, snapUnit, borderUnit, borderColor, fillColor);
  }

  drawNote(laneIndex: number, y: number, noteHeight: number, color: string, alpha: number, sheetBottom: number, _combo: number, noteName?: string, holding?: boolean, failing?: boolean, waiting?: boolean, visibleRange?: VisibleRange | null): void {
    const ctx = this.ctx;
    const c = themeManager.canvas;
    const handSide = handForKey(noteName ?? '');
    const drawColor = failing && noteName
      ? (handSide === HandSide.Left ? c.failColorLeft : c.failColorRight)
      : color;
    const L = this._noteLayout(laneIndex, y, noteHeight, sheetBottom, noteName, failing, visibleRange);

    ctx.globalAlpha = alpha;

    const blinkPhase = Math.floor(this._now / FAIL_BLINK_MS) % 2 === 0;
    const particleColor = handSide === HandSide.Left ? c.failParticleLeft : c.failParticleRight;
    const borderColor = failing
      ? (blinkPhase ? particleColor : drawColor)
      : 'rgba(0, 0, 0, 0.55)';

    // All notes share the same geometry grid; failing notes distinguish
    // themselves through border blink and glow, not a bulkier shape.
    const snapUnit = NOTE_PIXEL;
    const borderUnit = NOTE_PIXEL;

    if (waiting) {
      const pulse = 0.5 + 0.5 * Math.sin(this._now / 200 * 3.2);
      const glowUnits = Math.max(borderUnit, pixelSnap(4 + pulse * 8, snapUnit));
      ctx.globalAlpha = alpha * 0.25;
      ctx.fillStyle = drawColor;
      pixelRect(ctx, L.drawX - glowUnits, L.drawY - glowUnits, L.scaledWidth + glowUnits * 2, L.scaledHeadHeight + L.scaledTailHeight + glowUnits * 2, snapUnit);
      ctx.globalAlpha = alpha;
    }

    if (failing) {
      const pulse = 0.5 + 0.5 * Math.sin(this._now / FAIL_BLINK_MS * Math.PI);
      const glowUnits = Math.max(borderUnit, pixelSnap(4 + pulse * 6, snapUnit));
      ctx.globalAlpha = alpha * (0.2 + 0.28 * pulse);
      ctx.fillStyle = particleColor;
      pixelRect(ctx, L.drawX - glowUnits, L.drawY - glowUnits, L.scaledWidth + glowUnits * 2, L.scaledHeadHeight + L.scaledTailHeight + glowUnits * 2, snapUnit);
      ctx.globalAlpha = alpha;
    }

    if (L.scaledTailHeight > 0.5) {
      this._drawNotePart(ctx, L.drawX, L.drawY, L.scaledWidth, L.scaledTailHeight, snapUnit, borderUnit, drawColor, borderColor);
      ctx.globalAlpha = alpha * (failing ? TAIL_HIGHLIGHT_ALPHA_FAIL : TAIL_HIGHLIGHT_ALPHA);
      ctx.fillStyle = c.noteHighlight;
      pixelRect(ctx, L.drawX, L.drawY, L.scaledWidth, L.scaledTailHeight, snapUnit);
      ctx.globalAlpha = alpha;
    }

    const headDrawY = L.drawY + L.scaledTailHeight;
    this._drawNotePart(ctx, L.drawX, headDrawY, L.scaledWidth, L.scaledHeadHeight, snapUnit, borderUnit, drawColor, borderColor);
    ctx.globalAlpha = alpha * (failing ? HEAD_HIGHLIGHT_ALPHA_FAIL : HEAD_HIGHLIGHT_ALPHA);
    ctx.fillStyle = c.noteHighlight;
    pixelRect(ctx, L.drawX, headDrawY, L.scaledWidth, L.scaledHeadHeight, snapUnit);
    ctx.globalAlpha = alpha;

    if (holding) {
      const cx = L.drawX + L.scaledWidth / 2;
      const baseY = headDrawY + L.scaledHeadHeight / 2;
      this._drawFlame(ctx, cx, baseY, L.scaledWidth);
    }

    if (noteName) {
      // Badge border stays visible at all times: the hand color for
      // normal notes, the steady particle color for failing ones (the
      // note itself blinks; a blinking badge box would read as flicker).
      this._drawNoteBadge(ctx, noteName, L.drawX + L.scaledWidth / 2, headDrawY + L.scaledHeadHeight, failing ? particleColor : drawColor, L.baseWidth);
    }

    ctx.globalAlpha = 1;
  }

  /** Every named note carries a name badge anchored at the head's
   *  leading edge, sized from the lane width and screen height so it
   *  reads big on any window size. Press Start 2P fills its em box, so
   *  the name stays legible where the condensed VT323 would look small.
   *  The badge is its own box — dark fill, note-border color, white
   *  text; failing notes blink via their particle-colored border. */
  private _drawNoteBadge(ctx: CanvasRenderingContext2D, noteName: string, centerX: number, bottomY: number, borderColor: string, noteWidth: number): void {
    const shortName = NOTE_SHORT_NAMES[noteName] ?? noteName;
    const fontSize = Math.round(
      Math.min(Math.max(12, noteWidth * 0.55), 24),
    );
    const ui = themeManager.fonts.ui;
    if (ui !== this._labelFontUi) {
      this._labelFontUi = ui;
      this._labelFontCache.clear();
    }
    const badgeKey = `ui:${fontSize}`;
    let font = this._labelFontCache.get(badgeKey);
    if (!font) {
      font = `${fontSize}px ${ui}`;
      this._labelFontCache.set(badgeKey, font);
    }
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const textW = ctx.measureText(shortName).width;
    const bw = pixelSnap(textW + fontSize * 0.45, NOTE_PIXEL);
    const bh = pixelSnap(fontSize + 18, NOTE_PIXEL);
    const bx = pixelSnap(centerX - bw / 2, NOTE_PIXEL);
    const by = pixelSnap(bottomY - bh, NOTE_PIXEL);
    pixelBox(ctx, bx, by, bw, bh, NOTE_PIXEL, NOTE_PIXEL, borderColor, 'rgba(0, 0, 0, 0.88)');
    ctx.fillStyle = '#fff';
    ctx.fillText(shortName, bx + bw / 2, by + bh / 2 + 1);
  }

  /** The two flame layers as pre-rendered sprites: dense chords keep many
   *  holds lit at once, and building two radial gradients per held note per
   *  frame is measurably slower than blitting scaled sprites. Each sprite
   *  spans a 128px square (large enough to stay crisp when upscaled to wide
   *  notes) with the gradient's full extent reaching the edge (outer stops
   *  at alpha 0), so uniform scaling reproduces the gradient. */
  private _ensureFlameSprites(): void {
    if (this._flameSprites) return;
    const R = 64;
    const make = (stops: readonly { stop: number; color: string }[]): HTMLCanvasElement => {
      const sprite = document.createElement('canvas');
      sprite.width = R * 2;
      sprite.height = R * 2;
      const sctx = sprite.getContext('2d')!;
      const grad = sctx.createRadialGradient(R, R, 0, R, R, R);
      for (const { stop, color } of stops) {
        grad.addColorStop(stop, color);
      }
      sctx.fillStyle = grad;
      sctx.fillRect(0, 0, R * 2, R * 2);
      return sprite;
    };
    this._flameSprites = { outer: make(FLAME_COLORS), core: make(FLAME_CORE_COLORS) };
  }

  private _drawFlame(ctx: CanvasRenderingContext2D, cx: number, baseY: number, width: number): void {
    this._ensureFlameSprites();
    const t = this._now / 1000;
    const pulse = 0.8 + 0.2 * Math.sin(t * 5);

    const r = width * 2.0 * pulse;
    ctx.drawImage(this._flameSprites!.outer, cx - r, baseY - r, r * 2, r * 2);

    const r2 = width * 0.7;
    ctx.drawImage(this._flameSprites!.core, cx - r2, baseY - r2, r2 * 2, r2 * 2);
  }

  // -- Grind effect (Guitar-Hero-style electric trail) --------------------

  triggerGrindFlash(lane: number, color: string): void {
    if (this._grindFlashes.length >= MAX_GRIND_FLASHES) {
      this._grindFlashes.shift();
    }
    this._grindFlashes.push({ lane, rgb: this._parseRgb(color), startMs: this._now });
  }

  startGrindBeam(lane: number, color: string, endTime: number): void {
    this._grindBeams.set(lane, { lane, rgb: this._parseRgb(color), endTime, startMs: this._now });
  }

  endGrindBeam(lane: number): void {
    this._grindBeams.delete(lane);
  }

  clearGrind(): void {
    this._grindBeams.clear();
    this._grindFlashes.length = 0;
  }

  drawGrind(currentTime: number, visibleRange?: VisibleRange | null): void {
    const ctx = this.ctx;
    const hitZoneY = this.height * HIT_ZONE_Y_RATIO;
    const sheetBottom = this.sheetBottom > 0 ? this.sheetBottom : 0;

    for (const [lane, beam] of this._grindBeams) {
      if (currentTime >= beam.endTime) {
        this._grindBeams.delete(lane);
        continue;
      }
      const noteName = NOTE_NAMES[lane];
      const layout = getPianoKeyLayout(noteName ?? 'C4', this.width, visibleRange);
      if (layout.width === 0) continue;
      const beamEndY = Math.max(sheetBottom, hitZoneY - (beam.endTime - currentTime) * GRIND_BEAM_SCROLL_PX_PER_SEC);
      const ramp = Math.min(1, (this._now - beam.startMs) / GRIND_BEAM_RAMP_MS);
      this._drawGrindBeam(ctx, layout.x + layout.width / 2, hitZoneY, beamEndY, layout.width * 0.9, beam.rgb, ramp);
    }

    for (let i = this._grindFlashes.length - 1; i >= 0; i--) {
      const f = this._grindFlashes[i];
      const elapsed = this._now - f.startMs;
      if (elapsed >= GRIND_FLASH_MS) {
        this._grindFlashes.splice(i, 1);
        continue;
      }
      const noteName = NOTE_NAMES[f.lane];
      const layout = getPianoKeyLayout(noteName ?? 'C4', this.width, visibleRange);
      if (layout.width === 0) continue;
      this._drawGrindFlash(ctx, layout.x + layout.width / 2, hitZoneY, f.rgb, elapsed, layout.width * 0.9);
    }
  }

  private _jitterX(cx: number, halfW: number, sFreq: number, cFreq: number, i: number, phase: number): number {
    const jitter = halfW * 2 * GRIND_JAGGER;
    const j = jitter * (Math.sin(sFreq + i * 1.7 + phase) + Math.cos(cFreq + i * 2.3 + phase));
    return cx + Math.max(-halfW + 2, Math.min(halfW - 2, j));
  }

  private _drawGrindBeam(ctx: CanvasRenderingContext2D, cx: number, hitZoneY: number, beamTop: number, laneW: number, rgb: RGB, ramp: number): void {
    const t = this._now / 1000;
    const pulse = 0.7 + 0.3 * Math.sin(t * 12);
    const beamH = hitZoneY - beamTop;
    if (beamH <= 0) return;
    const intensity = Math.max(0, ramp);

    const colW = laneW;
    const glow = ctx.createLinearGradient(0, beamTop, 0, hitZoneY);
    glow.addColorStop(0, this._rgba(rgb, 0));
    glow.addColorStop(0.5, this._rgba(rgb, 0.12 * pulse * intensity));
    glow.addColorStop(1, this._rgba(rgb, 0.32 * pulse * intensity));
    ctx.fillStyle = glow;
    ctx.fillRect(cx - colW / 2, beamTop, colW, beamH);

    const halfW = laneW * 0.5;
    ctx.save();
    ctx.globalAlpha = intensity;
    ctx.strokeStyle = GRIND_HIGHLIGHT_COLOR;
    ctx.lineWidth = Math.max(2, laneW * 0.10);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (!this._isLowEnd) {
      ctx.shadowColor = this._rgba(rgb, 1);
      ctx.shadowBlur = 14 * pulse;
    }
    ctx.beginPath();
    const segs = Math.max(6, Math.floor(GRIND_BEAM_SEGMENTS * (beamH / LANE_GLOW_HEIGHT)));
    ctx.moveTo(cx, hitZoneY);
    for (let i = 1; i <= segs; i++) {
      const py = hitZoneY - (beamH * i) / segs;
      const px = this._jitterX(cx, halfW, t * 40, t * 31, i, 0);
      ctx.lineTo(px, py);
    }
    ctx.stroke();

    ctx.strokeStyle = this._rgba(rgb, 0.85 * pulse);
    ctx.lineWidth = Math.max(1, laneW * 0.05);
    if (!this._isLowEnd) ctx.shadowBlur = 22 * pulse;
    ctx.beginPath();
    ctx.moveTo(cx, hitZoneY);
    for (let i = 1; i <= segs; i++) {
      const py = hitZoneY - (beamH * i) / segs;
      const px = this._jitterX(cx, halfW, t * 40, t * 31, i, 0.5);
      ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();

    const burstR = laneW * 0.9 * pulse * intensity;
    if (burstR > 1) {
      const bgrad = ctx.createRadialGradient(cx, hitZoneY, 0, cx, hitZoneY, burstR);
      bgrad.addColorStop(0, this._rgba(rgb, 0.7 * pulse * intensity));
      bgrad.addColorStop(0.5, this._rgba(rgb, 0.25 * pulse * intensity));
      bgrad.addColorStop(1, this._rgba(rgb, 0));
      ctx.fillStyle = bgrad;
      ctx.fillRect(cx - burstR, hitZoneY - burstR, burstR * 2, burstR * 2);
    }
  }

  private _drawGrindFlash(ctx: CanvasRenderingContext2D, cx: number, hitZoneY: number, rgb: RGB, elapsed: number, laneW: number): void {
    const p = elapsed / GRIND_FLASH_MS;
    const alpha = 1 - p;
    const streakH = p * GRIND_FLASH_HEIGHT;
    const colW = laneW;

    const grad = ctx.createLinearGradient(0, hitZoneY - streakH, 0, hitZoneY);
    grad.addColorStop(0, this._rgba(rgb, 0));
    grad.addColorStop(1, this._rgba(rgb, 0.55 * alpha));
    ctx.fillStyle = grad;
    ctx.fillRect(cx - colW / 2, hitZoneY - streakH, colW, streakH);

    const halfW = laneW * 0.5;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = GRIND_HIGHLIGHT_COLOR;
    ctx.lineWidth = Math.max(2, laneW * 0.10);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (!this._isLowEnd) {
      ctx.shadowColor = this._rgba(rgb, 1);
      ctx.shadowBlur = 16;
    }
    ctx.beginPath();
    ctx.moveTo(cx, hitZoneY);
    const segs = GRIND_FLASH_SEGMENTS;
    for (let i = 1; i <= segs; i++) {
      const py = hitZoneY - (streakH * i) / segs;
      const px = this._jitterX(cx, halfW, this._now / 60, this._now / 53, i, 0);
      ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();

    const burstR = laneW * 0.8 * (0.6 + 0.4 * alpha);
    const bgrad = ctx.createRadialGradient(cx, hitZoneY, 0, cx, hitZoneY, burstR);
    bgrad.addColorStop(0, this._rgba(rgb, 0.8 * alpha));
    bgrad.addColorStop(0.5, this._rgba(rgb, 0.3 * alpha));
    bgrad.addColorStop(1, this._rgba(rgb, 0));
    ctx.fillStyle = bgrad;
    ctx.fillRect(cx - burstR, hitZoneY - burstR, burstR * 2, burstR * 2);

    if (this._isLowEnd) return;

    for (let i = 0; i < GRIND_FLASH_SPARKS; i++) {
      const a = (i / GRIND_FLASH_SPARKS) * Math.PI * 2 + this._now / 200;
      const r = burstR * (0.4 + 0.6 * alpha) * (0.5 + 0.5 * Math.sin(i * 1.7 + this._now / 90));
      const sx = cx + Math.cos(a) * r;
      const sy = hitZoneY - Math.abs(Math.sin(a)) * streakH * 0.3;
      ctx.globalAlpha = alpha * 0.9;
      ctx.fillStyle = i % 2 === 0 ? GRIND_HIGHLIGHT_COLOR : this._rgba(rgb, 1);
      ctx.beginPath();
      ctx.arc(sx, sy, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
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

  /** Time-sorted note closest to `t` across two sorted staff arrays.
   *  Binary search instead of a linear scan: the loop overlay calls this
   *  for every visible marker on every frame. */
  private _nearestNoteAtTime(t: number, trebleNotes: SongNote[], bassNotes: SongNote[]): SongNote | null {
    let best: SongNote | null = null;
    let bestDiff = Infinity;
    for (const list of [trebleNotes, bassNotes]) {
      const idx = this._findFirstIndex(list, t);
      for (const n of [list[idx - 1], list[idx]]) {
        if (!n) continue;
        const d = Math.abs(n.time - t);
        if (d < bestDiff) {
          bestDiff = d;
          best = n;
        }
      }
    }
    return best;
  }

  private _renderStaffCache(sheetTop: number, trebleTop: number, bassTop: number, staffLineSpacing: number, _clefW: number, margin: number, sheetBottom: number): void {
    const c = themeManager.canvas;
    const w = this.canvas.width;
    const h = sheetBottom;
    this._staffCache = document.createElement('canvas');
    this._staffCache.width = w;
    this._staffCache.height = h;
    const ctx = this._staffCache.getContext('2d')!;

    ctx.fillStyle = c.bg;
    ctx.fillRect(0, sheetTop, w, sheetBottom);

    ctx.strokeStyle = c.staffLine;
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

    ctx.fillStyle = c.clef;
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
    loop?: {
      chain: ReadonlyArray<{ startTime: number; endTime: number }>;
      currentIndex: number | null;
      draftStart: number | null;
      draftEnd: number | null;
      defining: LoopDefinitionState;
    },
    viewWindow?: { start: number; end: number },
    bpm = 120,
    selectedLoop?: { startTime: number; endTime: number },
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
    this._drawLoopRegion(L, loop, trebleNotes, bassNotes, selectedLoop);

    ctx.strokeStyle = themeManager.canvas.sheetBorder;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, sheetBottom);
    ctx.lineTo(this.width, sheetBottom);
    ctx.stroke();
  }

  private _drawBeatLines(L: SheetLayout, bpm: number): void {
    const { ctx, sheetTop, sheetBottom, barX, barW, viewStart, viewEnd } = L;
    const c = themeManager.canvas;
    const firstBeat = Math.ceil(viewStart / (60 / bpm));
    const lastBeat = Math.floor(viewEnd / (60 / bpm));

    ctx.strokeStyle = c.measureLine;
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

    ctx.strokeStyle = c.beatLine;
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
    const c = themeManager.canvas;
    const { ctx, barX, barW, viewStart, viewEnd, staffLineSpacing } = L;
    const pos = SHEET_NOTE_POSITIONS[note.key];
    if (pos === undefined) return;
    const noteY = staffTop + (7 - pos) * (staffLineSpacing / 2);

    const x = barX + ((note.time - viewStart) / (viewEnd - viewStart)) * barW;
    const r = SHEET_NOTE_RADIUS * this.sheetScale;
    const color = note.selected ? handColor(note.key) : c.backingNote;
    const filled = note.duration < 0.75;

    // Square, grid-snapped heads keep the sheet in the pixel language
    const SHEET_PIXEL = 2;
    const headX = pixelSnap(x, SHEET_PIXEL);
    const headY = pixelSnap(noteY, SHEET_PIXEL);
    // Failing heads are ~40% larger with a thick outline so they stand out
    const side = Math.max(SHEET_PIXEL * 2, pixelSnap(r * 2, SHEET_PIXEL) * (note.failing ? 1.4 : 1));
    const half = side / 2;

    if (note.failing) {
      const sheetColor = handForKey(note.key) === HandSide.Left ? c.failColorSheetLeft : c.failColorSheetRight;
      ctx.fillStyle = sheetColor;
      ctx.strokeStyle = sheetColor;
    } else if (note.hit) {
      ctx.fillStyle = c.hitNote;
      ctx.strokeStyle = c.hitNote;
    } else {
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
    }
    ctx.lineWidth = note.failing ? 4 : 2;
    if (filled) {
      ctx.fillRect(headX - half, headY - half, side, side);
      if (note.failing) {
        ctx.strokeStyle = c.noteHighlight;
        ctx.strokeRect(headX - half, headY - half, side, side);
      }
    } else {
      ctx.strokeRect(headX - half, headY - half, side, side);
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
    const cursorColor = themeManager.canvas.playbackCursor;
    const showCursor = viewWindow
      ? currentTime >= viewStart && currentTime <= viewEnd
      : true;
    if (!showCursor) return;
    const cursorX = viewWindow
      ? barX + ((currentTime - viewStart) / (viewEnd - viewStart)) * barW
      : barX;
    ctx.fillStyle = cursorColor;
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
    loop: {
      chain: ReadonlyArray<{ startTime: number; endTime: number }>;
      currentIndex: number | null;
      draftStart: number | null;
      draftEnd: number | null;
      defining: LoopDefinitionState;
    } | undefined,
    trebleNotes: SongNote[],
    bassNotes: SongNote[],
    selectedLoop?: { startTime: number; endTime: number },
  ): void {
    const c = themeManager.canvas;
    const { ctx, barX, barW, viewStart, viewEnd, sheetTop, sheetBottom } = L;
    if (!loop) return;

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
      const best = this._nearestNoteAtTime(t, trebleNotes, bassNotes);
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

    const drawRegion = (start: number, end: number, fill: string): void => {
      const lx0 = barX + ((Math.max(start, viewStart) - viewStart) / (viewEnd - viewStart)) * barW;
      const lx1 = barX + ((Math.min(end, viewEnd) - viewStart) / (viewEnd - viewStart)) * barW;
      if (lx1 <= lx0) return;
      ctx.save();
      ctx.fillStyle = fill;
      ctx.fillRect(lx0, sheetTop, lx1 - lx0, sheetBottom - sheetTop);
      ctx.restore();
    };

    // Saved enabled loops: inactive loops get the inactive overlay, the
    // current (playing) one gets the active overlay. Draw inactive ones
    // first so the active overlay sits on top.
    const chain = loop.chain;
    const currentIndex = loop.currentIndex;
    for (let i = 0; i < chain.length; i++) {
      if (i === currentIndex) continue;
      drawRegion(chain[i].startTime, chain[i].endTime, c.loopOverlayInactive);
      drawMarker(chain[i].startTime, c.loopMarker, 'A');
      drawMarker(chain[i].endTime, c.loopMarker, 'B');
    }
    if (currentIndex !== null && currentIndex >= 0 && currentIndex < chain.length) {
      const cur = chain[currentIndex];
      drawRegion(cur.startTime, cur.endTime, c.loopOverlayActive);
      drawMarker(cur.startTime, c.loopMarker, 'A');
      drawMarker(cur.endTime, c.loopMarker, 'B');
      highlightAt(cur.startTime, c.loopMarker, 0.7);
      highlightAt(cur.endTime, c.loopMarker, 0.7);
    }

    // Draft (define-flow) overlay on top of everything.
    const draftStart = loop.draftStart;
    const draftDefining = loop.defining;
    if (draftDefining === LoopDefinitionState.End && draftStart !== null) {
      drawMarker(draftStart, c.loopMarker, 'A');
      highlightAt(draftStart, c.loopMarker, 0.9);
      // Preview fills from the start marker to the right edge of the view.
      drawRegion(draftStart, viewEnd, c.loopDefiningPreview);
    } else if (draftDefining === LoopDefinitionState.Start && draftStart !== null) {
      drawMarker(draftStart, c.loopMarker, 'A');
    }

    if (selectedLoop) {
      this._drawSelectedLoopNotes(L, c.noteHighlight, trebleNotes, bassNotes, selectedLoop);
    }
  }

  private _drawSelectedLoopNotes(
    L: SheetLayout,
    color: string,
    trebleNotes: SongNote[],
    bassNotes: SongNote[],
    selectedLoop: { startTime: number; endTime: number },
  ): void {
    const { ctx, barX, barW, viewStart, viewEnd, staffLineSpacing } = L;

    const notePosition = (n: SongNote): { x: number; y: number } | null => {
      const pos = SHEET_NOTE_POSITIONS[n.key];
      if (pos === undefined) return null;
      const staffTop = n.hand === HandSide.Left ? this.sheetBassTop : this.sheetTrebleTop;
      const x = barX + ((n.time - viewStart) / (viewEnd - viewStart)) * barW;
      const y = staffTop + (7 - pos) * (staffLineSpacing / 2);
      return { x, y };
    };

    const highlightNote = (n: SongNote): void => {
      if (n.time < viewStart || n.time > viewEnd) return;
      if (n.time < selectedLoop.startTime || n.time > selectedLoop.endTime) return;
      const p = notePosition(n);
      if (!p) return;
      const r = (SHEET_NOTE_RADIUS + 5) * this.sheetScale;
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2 * this.sheetScale;
      ctx.stroke();
      ctx.restore();
    };

    for (const list of [trebleNotes, bassNotes]) {
      const startIdx = this._findFirstIndex(list, selectedLoop.startTime);
      for (let i = startIdx; i < list.length; i++) {
        const n = list[i];
        if (n.time > selectedLoop.endTime) break;
        highlightNote(n);
      }
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

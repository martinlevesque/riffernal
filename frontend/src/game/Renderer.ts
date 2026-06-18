import { NOTE_NAMES, NOTE_COLORS } from '../utils/notes.js';
import { KEYBOARD_MAP } from '../input/KeyboardInput.js';
import { HIT_ZONE_Y_RATIO } from './NoteManager.js';
import type { SongNote } from './NoteManager.js';

export const PIANO_HEIGHT_RATIO = 0.12;

export const CLEF_TYPES = {
  BASS: 'bass',
  TREBLE: 'treble',
} as const;

export const BASS_STAFF_POSITIONS: Record<string, number> = {
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
};

export const NOTE_TO_CLEF: Record<string, string> = {
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

const SHEET_HEIGHT = 140;
const SHEET_STAFF_LINE_SPACING = 10;
const SHEET_NOTE_RADIUS = 4.5;
const SHEET_BEATS_VISIBLE = 18;
const SHEET_PX_PER_BEAT = 13;
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

const NOTE_TAIL_GRADIENT: [number, string][] = [[0, 'rgba(255,255,255,0.10)'], [1, 'rgba(255,255,255,0)']];
const NOTE_HEAD_GRADIENT: [number, string][] = [[0, 'rgba(255,255,255,0)'], [0.4, 'rgba(255,255,255,0.15)'], [1, 'rgba(255,255,255,0.40)']];

interface NoteLayout {
  drawX: number;
  drawY: number;
  scaledWidth: number;
  scaledHeadHeight: number;
  scaledTailHeight: number;
  cornerRadius: number;
  scale: number;
}

interface NotePixelBounds {
  minY: number | null;
  maxY: number | null;
  bottomY: number | null;
  topY: number | null;
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
  private _keyDisplayMap: Record<string, string>;

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
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.ctx.scale(dpr, dpr);
    this.width = window.innerWidth;
    this.height = window.innerHeight;
  }

  clear(): void {
    this.ctx.fillStyle = '#0a0a0a';
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  drawHighway(laneCount: number, scrollOffset: number): void {
    const ctx = this.ctx;
    const hitZoneY = this.height * HIT_ZONE_Y_RATIO;
    const highwayTop = 0;
    const highwayBottom = hitZoneY + 10;
    const laneWidth = this.width / laneCount;

    ctx.fillStyle = '#0e0e0e';
    ctx.fillRect(0, highwayTop, this.width, highwayBottom - highwayTop);

    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;
    for (let i = 1; i < laneCount; i++) {
      const x = i * laneWidth;
      ctx.beginPath();
      ctx.moveTo(x, highwayTop);
      ctx.lineTo(x, highwayBottom);
      ctx.stroke();
    }

    const lineSpacing = 50;
    const lineOffset = scrollOffset % lineSpacing;
    ctx.strokeStyle = '#151515';
    ctx.lineWidth = 0.5;
    for (let y = -lineOffset; y < highwayBottom; y += lineSpacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.width, y);
      ctx.stroke();
    }
  }

  drawHitZone(laneCount: number, pressedLanes: Set<number>): void {
    const ctx = this.ctx;
    const hitZoneY = this.height * HIT_ZONE_Y_RATIO;
    const laneWidth = this.width / laneCount;

    for (let i = 0; i < laneCount; i++) {
      const x = i * laneWidth;
      const isPressed = pressedLanes.has(i);
      const color = NOTE_COLORS[NOTE_NAMES[i]] || '#ffffff';

      ctx.fillStyle = isPressed ? color : '#222';
      ctx.globalAlpha = isPressed ? 0.5 : 0.8;
      ctx.fillRect(x, hitZoneY - 4, laneWidth, 8);

      if (isPressed) {
        ctx.globalAlpha = 0.15;
        ctx.fillStyle = color;
        ctx.fillRect(x, hitZoneY - 30, laneWidth, 60);
      }
    }
    ctx.globalAlpha = 1;
  }

  drawPiano(laneCount: number, pressedLanes: Set<number>): void {
    const ctx = this.ctx;
    const pianoTop = this.height - this.height * PIANO_HEIGHT_RATIO;
    const pianoH = this.height * PIANO_HEIGHT_RATIO;
    const laneWidth = this.width / laneCount;

    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, pianoTop, this.width, pianoH);

    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    for (let i = 0; i <= laneCount; i++) {
      const x = i * laneWidth;
      ctx.beginPath();
      ctx.moveTo(x, pianoTop);
      ctx.lineTo(x, this.height);
      ctx.stroke();
    }

    for (let i = 0; i < laneCount; i++) {
      const x = i * laneWidth;
      const isPressed = pressedLanes.has(i);
      const noteName = NOTE_NAMES[i];
      const isBlack = noteName.includes('#');
      const color = NOTE_COLORS[noteName] || '#ffffff';

      if (isBlack) {
        ctx.fillStyle = isPressed ? '#444' : '#1a1a1a';
      } else {
        ctx.fillStyle = isPressed ? '#555' : '#2a2a2a';
      }
      ctx.fillRect(x + 1, pianoTop + 1, laneWidth - 2, pianoH - 2);

      if (isPressed) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 15;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, pianoTop + 1, laneWidth - 2, pianoH - 2);
        ctx.shadowBlur = 0;
      }

      const labelY = pianoTop + pianoH * 0.65;
      const keyLabel = noteName.replace(/\d/, '');
      ctx.fillStyle = isPressed ? '#fff' : '#555';
      ctx.font = `${Math.max(10, laneWidth * 0.22)}px Courier New`;
      ctx.textAlign = 'center';
      ctx.fillText(keyLabel, x + laneWidth / 2, labelY);

      const kbKey = this._getKeyForNote(noteName);
      if (kbKey) {
        ctx.fillStyle = isPressed ? '#aaa' : '#444';
        ctx.font = `bold ${Math.max(9, laneWidth * 0.18)}px Courier New`;
        ctx.fillText(`[${kbKey}]`, x + laneWidth / 2, labelY + 14);
      }
    }
  }

  private _getKeyForNote(noteName: string): string {
    return this._keyDisplayMap[noteName] || '';
  }

  private _noteLayout(laneIndex: number, y: number, noteHeight: number, sheetBottom: number): NoteLayout {
    const laneWidth = this.width / NOTE_NAMES.length;
    const x = laneIndex * laneWidth;
    const padding = 2;

    const hitZoneY = this.height * HIT_ZONE_Y_RATIO;
    const scaleRange = hitZoneY - sheetBottom;
    const headBottom = y + noteHeight;
    const clampedY = Math.max(sheetBottom, Math.min(headBottom, hitZoneY));
    const scale = 0.45 + 0.55 * ((clampedY - sheetBottom) / scaleRange);

    const HEAD_HEIGHT = 12;
    const scaledHeadHeight = HEAD_HEIGHT * scale;
    const scaledTailHeight = Math.max(0, noteHeight * scale - scaledHeadHeight);
    const scaledWidth = (laneWidth - padding * 2) * scale;
    const centerX = x + laneWidth / 2;

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

  private _noteOverlay(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, stops: [number, string][]): CanvasGradient {
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    for (const [pos, color] of stops) grad.addColorStop(pos, color);
    return grad;
  }

  drawNote(laneIndex: number, y: number, noteHeight: number, color: string, alpha: number, sheetBottom: number, noteName?: string, holding?: boolean, failing?: boolean): void {
    const ctx = this.ctx;
    const drawColor = failing ? '#aa3322' : color;
    const L = this._noteLayout(laneIndex, y, noteHeight, sheetBottom);

    ctx.globalAlpha = alpha;
    ctx.shadowColor = drawColor;
    ctx.shadowBlur = 8 * L.scale;

    if (L.scaledTailHeight > 0.5) {
      this._drawNotePart(ctx, L.drawX, L.drawY, L.scaledWidth, L.scaledTailHeight, L.cornerRadius, drawColor);
      this._drawNotePart(ctx, L.drawX, L.drawY, L.scaledWidth, L.scaledTailHeight, L.cornerRadius,
        this._noteOverlay(ctx, L.drawX, L.drawY, L.scaledWidth, L.scaledTailHeight, NOTE_TAIL_GRADIENT));
    }

    const headDrawY = L.drawY + L.scaledTailHeight;
    this._drawNotePart(ctx, L.drawX, headDrawY, L.scaledWidth, L.scaledHeadHeight, L.cornerRadius, drawColor);
    this._drawNotePart(ctx, L.drawX, headDrawY, L.scaledWidth, L.scaledHeadHeight, L.cornerRadius,
      this._noteOverlay(ctx, L.drawX, headDrawY, L.scaledWidth, L.scaledHeadHeight, NOTE_HEAD_GRADIENT));

    if (holding) {
      const cx = L.drawX + L.scaledWidth / 2;
      const baseY = headDrawY + L.scaledHeadHeight / 2;
      this._drawFlame(ctx, cx, baseY, L.scaledWidth);
    }

    if (noteName && !failing) {
      this._drawNoteLabel(ctx, noteName, L.drawX, headDrawY, L.scaledWidth, L.scaledHeadHeight);
    }

    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  private _drawNoteLabel(ctx: CanvasRenderingContext2D, noteName: string, drawX: number, drawY: number, width: number, height: number): void {
    const shortName = noteName.replace(/\d/g, '');
    const fontSize = Math.max(8, width * 0.45);
    ctx.font = `bold ${fontSize}px Courier New`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#000';
    ctx.shadowColor = 'rgba(255,255,255,0.6)';
    ctx.shadowBlur = 1;
    ctx.fillText(shortName, drawX + width / 2, drawY + height);
  }

  private _drawFlame(ctx: CanvasRenderingContext2D, cx: number, baseY: number, width: number): void {
    const t = performance.now() / 120;
    const flicker = 0.75 + 0.25 * Math.sin(t * 4.7) * Math.sin(t * 2.1);
    const sway = 0.08 * Math.sin(t * 3.3);

    const h = width * 2.5 * flicker;
    const w = width * 0.6 * flicker;

    ctx.save();

    ctx.shadowColor = '#ff6600';
    ctx.shadowBlur = 12;

    const grad = ctx.createRadialGradient(cx, baseY, 0, cx, baseY, h);
    grad.addColorStop(0, '#ffaa33');
    grad.addColorStop(0.3, '#ff6600');
    grad.addColorStop(0.6, '#cc3300');
    grad.addColorStop(1, 'rgba(200, 50, 0, 0)');

    ctx.beginPath();
    ctx.moveTo(cx - w, baseY);
    ctx.quadraticCurveTo(cx - w + sway * w, baseY - h * 0.6, cx + sway * w * 0.5, baseY - h);
    ctx.quadraticCurveTo(cx + w + sway * w, baseY - h * 0.6, cx + w, baseY);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.shadowBlur = 6;
    ctx.shadowColor = '#ffdd44';
    const innerH = h * 0.45;
    const innerW = w * 0.4;
    const innerFlicker = 0.8 + 0.2 * Math.sin(t * 5.3 + 1.4);
    const grad2 = ctx.createRadialGradient(cx, baseY - innerH * 0.3, 0, cx, baseY, innerH);
    grad2.addColorStop(0, '#ffeecc');
    grad2.addColorStop(0.4, '#ffaa44');
    grad2.addColorStop(1, 'rgba(255, 100, 0, 0)');

    ctx.beginPath();
    ctx.moveTo(cx - innerW * innerFlicker, baseY);
    ctx.quadraticCurveTo(cx - innerW * innerFlicker, baseY - innerH * 0.5, cx, baseY - innerH * innerFlicker);
    ctx.quadraticCurveTo(cx + innerW * innerFlicker, baseY - innerH * 0.5, cx + innerW * innerFlicker, baseY);
    ctx.closePath();
    ctx.fillStyle = grad2;
    ctx.fill();

    ctx.restore();
  }

  drawSheetMusic(notes: SongNote[], currentTime: number, songDuration: number): void {
    if (!notes.length || songDuration <= 0) return;
    const ctx = this.ctx;
    const sheetTop = 0;
    const staffLineSpacing = SHEET_STAFF_LINE_SPACING * this.sheetScale;
    const staffH = 4 * staffLineSpacing;
    const clefW = 25 * this.sheetScale;
    const margin = 8 * this.sheetScale;

    const trebleTop = sheetTop + 5 * this.sheetScale;
    const bassTop = trebleTop + staffH + 8 * this.sheetScale;
    const sheetBottom = bassTop + staffH + 5 * this.sheetScale;
    this.sheetBottom = sheetBottom;

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, sheetTop, this.width, sheetBottom);

    ctx.strokeStyle = '#444';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(margin, trebleTop + i * staffLineSpacing);
      ctx.lineTo(this.width - margin, trebleTop + i * staffLineSpacing);
      ctx.stroke();
    }
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(margin, bassTop + i * staffLineSpacing);
      ctx.lineTo(this.width - margin, bassTop + i * staffLineSpacing);
      ctx.stroke();
    }

    ctx.fillStyle = '#888';
    ctx.font = `bold ${staffLineSpacing * 5}px serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('\uD834\uDD1E', margin + 2, trebleTop + 2 * staffLineSpacing);
    ctx.fillText('\uD834\uDD22', margin + 2, bassTop + 2 * staffLineSpacing);

    const barX = margin + clefW;
    const barW = this.width - barX - margin;
    const bpm = 120;
    const viewStart = currentTime - 0.5;
    const viewEnd = currentTime + SHEET_BEATS_VISIBLE * (60 / bpm);

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

      const noteTime = note.time;
      if (noteTime < viewStart || noteTime > viewEnd) return;

      const x = barX + ((noteTime - viewStart) / (viewEnd - viewStart)) * barW;
      const r = SHEET_NOTE_RADIUS * this.sheetScale;
      const color = NOTE_COLORS[note.key] || '#ffffff';
      const filled = note.duration < 0.75;

      if (note.failing) {
        ctx.fillStyle = '#882222';
        ctx.strokeStyle = '#882222';
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

    const trebleNotes = notes.filter(n => NOTE_TO_CLEF[n.key] === CLEF_TYPES.TREBLE);
    const bassNotes = notes.filter(n => NOTE_TO_CLEF[n.key] === CLEF_TYPES.BASS);
    for (const note of trebleNotes) drawSheetNote(note, trebleTop);
    for (const note of bassNotes) drawSheetNote(note, bassTop);

    const cursorX = barX;
    ctx.fillStyle = '#ff2244';
    ctx.shadowColor = '#ff2244';
    ctx.shadowBlur = 4;
    ctx.fillRect(cursorX - 0.5, sheetTop, 1.5, sheetBottom - sheetTop);
    ctx.shadowBlur = 0;

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

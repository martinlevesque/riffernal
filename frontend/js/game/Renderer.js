import { WHITE_KEY_NOTES, BLACK_KEY_NOTES, NOTE_COLORS, HIT_ZONE_Y_RATIO, PIANO_HEIGHT_RATIO, NOTE_NAMES, KEYBOARD_MAP, STAFF_LINE_SPACING, STAFF_TOP_MARGIN, STAFF_LEFT_MARGIN, STAFF_RIGHT_MARGIN, CLEF_TYPES, BASS_STAFF_POSITIONS, TREBLE_STAFF_POSITIONS, NOTE_TO_CLEF, NOTE_DURATION_TYPES } from '../utils/constants.js';

const SHEET_HEIGHT = 140;
const SHEET_STAFF_LINE_SPACING = 10;
const SHEET_NOTE_RADIUS = 4.5;
const SHEET_BEATS_VISIBLE = 18;
const SHEET_PX_PER_BEAT = 13;
const SHEET_BEATS_PER_MEASURE = 4;

function roundRect(ctx, x, y, w, h, r) {
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

function codeToDisplay(code) {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const special = { Semicolon: ';', Comma: ',', Period: '.', Slash: '/', Backslash: '\\', BracketLeft: '[', BracketRight: ']', Minus: '-', Equal: '=', Quote: "'", Backquote: '`' };
  return special[code] || '';
}

const SHEET_NOTE_POSITIONS = Object.assign(
  Object.fromEntries(Object.entries(BASS_STAFF_POSITIONS).map(([k, v]) => [k, v - 3])),
  TREBLE_STAFF_POSITIONS
);

const NOTE_TAIL_GRADIENT = [[0, 'rgba(255,255,255,0.10)'], [1, 'rgba(255,255,255,0)']];
const NOTE_HEAD_GRADIENT = [[0, 'rgba(255,255,255,0)'], [0.4, 'rgba(255,255,255,0.15)'], [1, 'rgba(255,255,255,0.40)']];

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = 0;
    this.height = 0;
    this.pressedKeys = new Set();
    this.particles = [];
    this.sheetBottom = 0;
    this.sheetScale = 1.0;
    this._keyDisplayMap = Object.fromEntries(
      Object.entries(KEYBOARD_MAP).map(([code, note]) => [note, codeToDisplay(code)])
    );
    this.resize();
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.ctx.scale(dpr, dpr);
    this.width = window.innerWidth;
    this.height = window.innerHeight;
  }

  clear() {
    this.ctx.fillStyle = '#0a0a0a';
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  drawHighway(laneCount, scrollOffset) {
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

  drawHitZone(laneCount, pressedLanes) {
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

  drawPiano(laneCount, pressedLanes) {
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

  _getKeyForNote(noteName) {
    return this._keyDisplayMap[noteName] || '';
  }

  _noteLayout(laneIndex, y, noteHeight, sheetBottom) {
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

  _drawNotePart(ctx, drawX, drawY, w, h, r, color) {
    ctx.fillStyle = color;
    roundRect(ctx, drawX, drawY, w, h, r);
    ctx.fill();
  }

  _noteOverlay(ctx, x, y, w, h, stops) {
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    for (const [pos, color] of stops) grad.addColorStop(pos, color);
    return grad;
  }

  drawNote(laneIndex, y, noteHeight, color, alpha, sheetBottom, noteName) {
    const ctx = this.ctx;
    const L = this._noteLayout(laneIndex, y, noteHeight, sheetBottom);

    ctx.globalAlpha = alpha;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8 * L.scale;

    if (L.scaledTailHeight > 0.5) {
      this._drawNotePart(ctx, L.drawX, L.drawY, L.scaledWidth, L.scaledTailHeight, L.cornerRadius, color);
      this._drawNotePart(ctx, L.drawX, L.drawY, L.scaledWidth, L.scaledTailHeight, L.cornerRadius,
        this._noteOverlay(ctx, L.drawX, L.drawY, L.scaledWidth, L.scaledTailHeight, NOTE_TAIL_GRADIENT));
    }

    const headDrawY = L.drawY + L.scaledTailHeight;
    this._drawNotePart(ctx, L.drawX, headDrawY, L.scaledWidth, L.scaledHeadHeight, L.cornerRadius, color);
    this._drawNotePart(ctx, L.drawX, headDrawY, L.scaledWidth, L.scaledHeadHeight, L.cornerRadius,
      this._noteOverlay(ctx, L.drawX, headDrawY, L.scaledWidth, L.scaledHeadHeight, NOTE_HEAD_GRADIENT));

    if (noteName) {
      this._drawNoteLabel(ctx, noteName, L.drawX, headDrawY, L.scaledWidth, L.scaledHeadHeight);
    }

    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  _drawNoteLabel(ctx, noteName, drawX, drawY, width, height) {
    const shortName = noteName.replace(/\d/g, '');
    const fontSize = Math.max(8, width * 0.45);
    ctx.font = `bold ${fontSize}px Courier New`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#000';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 3;
    ctx.fillText(shortName, drawX + width / 2, drawY + height);
  }

  drawSheetMusic(notes, currentTime, songDuration) {
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

    const drawSheetNote = (note, staffTop) => {
      const pos = SHEET_NOTE_POSITIONS[note.key];
      if (pos === undefined) return;
      const noteY = staffTop + (7 - pos) * (staffLineSpacing / 2);

      const noteTime = note.time;
      if (noteTime < viewStart || noteTime > viewEnd) return;

      const x = barX + ((noteTime - viewStart) / (viewEnd - viewStart)) * barW;
      const r = SHEET_NOTE_RADIUS * this.sheetScale;
      const color = NOTE_COLORS[note.key] || '#ffffff';
      const filled = note.duration < 0.75;

      ctx.fillStyle = note.hit ? '#555' : color;
      ctx.strokeStyle = note.hit ? '#555' : color;
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

  drawParticles() {
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

  spawnParticles(x, y, color, count) {
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

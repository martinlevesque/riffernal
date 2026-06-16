import { WHITE_KEY_NOTES, BLACK_KEY_NOTES, NOTE_COLORS, HIT_ZONE_Y_RATIO, PIANO_HEIGHT_RATIO, NOTE_NAMES } from '../utils/constants.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = 0;
    this.height = 0;
    this.pressedKeys = new Set();
    this.particles = [];
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
    const pianoH = this.height * PIANO_HEIGHT_RATIO;
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
    const map = { 'C3': 'A', 'C#3': 'W', 'D3': 'S', 'D#3': 'E', 'E3': 'D', 'F3': 'F', 'F#3': 'T', 'G3': 'G', 'G#3': 'Y', 'A3': 'H', 'A#3': 'U', 'B3': 'J', 'C4': 'K', 'C#4': 'O', 'D4': 'L', 'D#4': 'P', 'E4': ';' };
    return map[noteName] || '';
  }

  drawNote(laneIndex, y, noteHeight, color, alpha) {
    const ctx = this.ctx;
    const laneWidth = this.width / NOTE_NAMES.length;
    const x = laneIndex * laneWidth;
    const padding = 2;

    ctx.globalAlpha = alpha;

    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x + padding, y, laneWidth - padding * 2, noteHeight, 3);
    ctx.fill();

    const gradient = ctx.createLinearGradient(x, y, x, y + noteHeight);
    gradient.addColorStop(0, 'rgba(255,255,255,0.25)');
    gradient.addColorStop(0.5, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(x + padding, y, laneWidth - padding * 2, noteHeight, 3);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
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

import { TIMING, SCORE_VALUES, FEEDBACK_COLORS, SCROLL_SPEED, HIT_ZONE_Y_RATIO, NOTE_NAMES, NOTE_COLORS } from '../utils/constants.js';

export class NoteManager {
  constructor() {
    this.notes = [];
    this.activeNotes = [];
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.perfects = 0;
    this.greats = 0;
    this.goods = 0;
    this.misses = 0;
    this.totalNotes = 0;
    this.onHit = null;
    this.onMiss = null;
  }

  loadSong(songData) {
    this.notes = songData.notes.map(n => ({
      ...n,
      hit: false,
      missed: false,
      lane: NOTE_NAMES.indexOf(n.key),
    })).sort((a, b) => a.time - b.time);
    this.totalNotes = this.notes.length;
    this.activeNotes = [];
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.perfects = 0;
    this.greats = 0;
    this.goods = 0;
    this.misses = 0;
  }

  update(currentTime, height) {
    const hitZoneY = height * HIT_ZONE_Y_RATIO;
    const lookAhead = hitZoneY / SCROLL_SPEED;

    for (const note of this.notes) {
      if (note.hit || note.missed) continue;

      const timeDiff = note.time - currentTime;

      if (timeDiff < -TIMING.GOOD) {
        note.missed = true;
        this.combo = 0;
        this.misses++;
        if (this.onMiss) this.onMiss(note);
        continue;
      }

      if (timeDiff <= lookAhead && !this.activeNotes.includes(note)) {
        this.activeNotes.push(note);
      }
    }

    this.activeNotes = this.activeNotes.filter(n => {
      if (n.hit || n.missed) return false;
      const timeDiff = n.time - currentTime;
      const y = hitZoneY - timeDiff * SCROLL_SPEED;
      return y < height + 50;
    });
  }

  checkHit(currentTime, lane) {
    let bestNote = null;
    let bestDiff = Infinity;

    for (const note of this.activeNotes) {
      if (note.hit || note.missed) continue;
      if (note.lane !== lane) continue;
      const diff = Math.abs(note.time - currentTime);
      if (diff < bestDiff && diff <= TIMING.GOOD) {
        bestDiff = diff;
        bestNote = note;
      }
    }

    if (!bestNote) return null;

    bestNote.hit = true;
    let result;

    if (bestDiff <= TIMING.PERFECT) {
      result = 'PERFECT';
      this.perfects++;
      this.score += SCORE_VALUES.PERFECT;
    } else if (bestDiff <= TIMING.GREAT) {
      result = 'GREAT';
      this.greats++;
      this.score += SCORE_VALUES.GREAT;
    } else {
      result = 'GOOD';
      this.goods++;
      this.score += SCORE_VALUES.GOOD;
    }

    this.combo++;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;

    const comboMultiplier = Math.floor(this.combo / 10);
    this.score += comboMultiplier * 10;

    if (this.onHit) this.onHit(bestNote, result);
    return { note: bestNote, result };
  }

  getAccuracy() {
    const total = this.perfects + this.greats + this.goods + this.misses;
    if (total === 0) return 100;
    const weighted = (this.perfects * 100 + this.greats * 80 + this.goods * 50) / total;
    return Math.round(weighted * 10) / 10;
  }

  isComplete() {
    return this.notes.every(n => n.hit || n.missed);
  }

  getGrade() {
    const acc = this.getAccuracy();
    if (acc >= 95) return { grade: 'S', class: 'grade-s' };
    if (acc >= 85) return { grade: 'A', class: 'grade-a' };
    if (acc >= 70) return { grade: 'B', class: 'grade-b' };
    if (acc >= 50) return { grade: 'C', class: 'grade-c' };
    return { grade: 'D', class: 'grade-d' };
  }

  getActiveNotes(currentTime, height) {
    const hitZoneY = height * HIT_ZONE_Y_RATIO;
    const results = [];

    for (const note of this.activeNotes) {
      if (note.hit || note.missed) continue;
      const timeDiff = note.time - currentTime;
      const y = hitZoneY - timeDiff * SCROLL_SPEED;

      const noteHeight = Math.max(12, Math.min(40, note.duration * SCROLL_SPEED));
      const color = NOTE_COLORS[note.key] || '#ffffff';
      const alpha = y < 0 ? 0 : 1;

      results.push({
        lane: note.lane,
        y,
        height: noteHeight,
        color,
        alpha,
      });
    }

    return results;
  }
}

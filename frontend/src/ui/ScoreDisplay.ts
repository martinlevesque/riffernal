import type { NoteManager } from '../game/NoteManager.js';

export class ScoreDisplay {
  private scoreEl: HTMLElement;
  private comboEl: HTMLElement;
  private accuracyEl: HTMLElement;
  private feedbackEl: HTMLElement;
  private feedbackTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.scoreEl = document.getElementById('score-value')!;
    this.comboEl = document.getElementById('combo-display')!;
    this.accuracyEl = document.getElementById('accuracy-display')!;
    this.feedbackEl = document.getElementById('hit-feedback')!;
  }

  update(noteManager: NoteManager): void {
    this.scoreEl.textContent = noteManager.score.toLocaleString();

    const combo = noteManager.combo;
    if (combo >= 5) {
      this.comboEl.textContent = `${combo}x COMBO`;
      this.comboEl.style.display = 'block';
    } else {
      this.comboEl.style.display = 'none';
    }

    this.accuracyEl.textContent = `${noteManager.getAccuracy()}%`;
  }

  showFeedback(result: string, color: string): void {
    this.feedbackEl.textContent = result;
    this.feedbackEl.style.color = color;
    this.feedbackEl.classList.add('show');

    clearTimeout(this.feedbackTimeout!);
    this.feedbackTimeout = setTimeout(() => {
      this.feedbackEl.classList.remove('show');
    }, 300);
  }
}

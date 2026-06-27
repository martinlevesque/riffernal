import type { Scoring } from '../game/scoring.js';

export class ScoreDisplay {
  private scoreEl: HTMLElement;
  private comboEl: HTMLElement;
  private comboCellEl: HTMLElement;
  private accuracyEl: HTMLElement;
  private feedbackEl: HTMLElement;
  private feedbackTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.scoreEl = document.getElementById('score-value')!;
    this.comboEl = document.getElementById('combo-display')!;
    this.comboCellEl = document.getElementById('combo-cell')!;
    this.accuracyEl = document.getElementById('accuracy-display')!;
    this.feedbackEl = document.getElementById('hit-feedback')!;
  }

  update(scoring: Scoring): void {
    this.scoreEl.textContent = scoring.score.toLocaleString();

    const combo = scoring.combo;
    if (combo >= 5) {
      this.comboEl.textContent = `${combo}x COMBO`;
      this.comboCellEl.style.display = '';
    } else {
      this.comboCellEl.style.display = 'none';
    }

    this.accuracyEl.textContent = `${scoring.getAccuracy()}%`;
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

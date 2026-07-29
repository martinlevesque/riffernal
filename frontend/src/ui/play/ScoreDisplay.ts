import type { Scoring } from '../../game/scoring.js';
import { formatScore } from '../../utils/helpers.js';

export class ScoreDisplay {
  private scoreEl: HTMLElement;
  private comboEl: HTMLElement;
  private comboCellEl: HTMLElement;
  private accuracyEl: HTMLElement;
  private feedbackEl: HTMLElement;
  private feedbackTimeout: ReturnType<typeof setTimeout> | null = null;
  private _lastScore = -1;
  private _lastCombo = -1;
  private _lastAccuracy = '';

  constructor() {
    this.scoreEl = document.getElementById('score-value')!;
    this.comboEl = document.getElementById('combo-display')!;
    this.comboCellEl = document.getElementById('combo-cell')!;
    this.accuracyEl = document.getElementById('accuracy-display')!;
    this.feedbackEl = document.getElementById('hit-feedback')!;
  }

  update(scoring: Scoring): void {
    if (scoring.score !== this._lastScore) {
      this._lastScore = scoring.score;
      this.scoreEl.textContent = formatScore(scoring.score);
    }

    const combo = scoring.combo;
    if (combo !== this._lastCombo) {
      this._lastCombo = combo;
      if (combo >= 5) {
        this.comboEl.textContent = `${combo}x COMBO`;
        this.comboCellEl.style.display = '';
      } else {
        this.comboCellEl.style.display = 'none';
      }
    }

    const acc = `${scoring.getAccuracy()}%`;
    if (acc !== this._lastAccuracy) {
      this._lastAccuracy = acc;
      this.accuracyEl.textContent = acc;
    }
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

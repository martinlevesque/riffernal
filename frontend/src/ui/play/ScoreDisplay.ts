import type { Scoring } from '../../game/scoring.js';
import { formatScore } from '../../utils/helpers.js';

export class ScoreDisplay {
  private _scoreEl: HTMLElement;
  private _comboEl: HTMLElement;
  private _comboCellEl: HTMLElement;
  private _accuracyEl: HTMLElement;
  private _feedbackEl: HTMLElement;
  private _feedbackTimeout: ReturnType<typeof setTimeout> | null = null;
  private _lastScore = -1;
  private _lastCombo = -1;
  private _lastAccuracy = '';

  constructor() {
    this._scoreEl = document.getElementById('score-value')!;
    this._comboEl = document.getElementById('combo-display')!;
    this._comboCellEl = document.getElementById('combo-cell')!;
    this._accuracyEl = document.getElementById('accuracy-display')!;
    this._feedbackEl = document.getElementById('hit-feedback')!;
  }

  update(scoring: Scoring): void {
    if (scoring.score !== this._lastScore) {
      this._lastScore = scoring.score;
      this._scoreEl.textContent = formatScore(scoring.score);
    }

    const combo = scoring.combo;
    if (combo !== this._lastCombo) {
      this._lastCombo = combo;
      if (combo >= 5) {
        this._comboEl.textContent = `${combo}x COMBO`;
        this._comboCellEl.style.display = '';
      } else {
        this._comboCellEl.style.display = 'none';
      }
    }

    const acc = `${scoring.getAccuracy()}%`;
    if (acc !== this._lastAccuracy) {
      this._lastAccuracy = acc;
      this._accuracyEl.textContent = acc;
    }
  }

  showFeedback(result: string, color: string): void {
    this._feedbackEl.textContent = result;
    this._feedbackEl.style.color = color;
    this._feedbackEl.classList.add('show');

    clearTimeout(this._feedbackTimeout!);
    this._feedbackTimeout = setTimeout(() => {
      this._feedbackEl.classList.remove('show');
    }, 300);
  }
}

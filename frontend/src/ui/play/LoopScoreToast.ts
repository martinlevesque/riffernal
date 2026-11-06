// Floating confirmation shown when a loop wrap banks the loop's score into
// the user's daily total. Holds for 2 seconds, then fades out.

import { formatScore } from '../../utils/helpers.js';

const SHOW_MS = 2000;

export class LoopScoreToast {
  private _el: HTMLElement;
  private _timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this._el = document.getElementById('loop-score-toast')!;
  }

  show(score: number, dailyTotal?: number): void {
    this._render(score, dailyTotal);
    this._el.classList.add('show');

    if (this._timer !== null) clearTimeout(this._timer);

    this._timer = setTimeout(() => {
      this._el.classList.remove('show');
      this._timer = null;
    }, SHOW_MS);
  }

  /** Upgrade the caption with the user's new daily total once the server
   *  confirms the addition, without extending the 2-second window. No-op
   *  when the toast already faded. */
  updateDailyTotal(score: number, dailyTotal: number): void {
    if (!this._el.classList.contains('show')) return;

    this._render(score, dailyTotal);
  }

  private _render(score: number, dailyTotal?: number): void {
    const caption = dailyTotal !== undefined ? `Today: ${formatScore(dailyTotal)}` : 'Loop score';

    this._el.innerHTML =
      `<span class="loop-score-toast-value">+${formatScore(score)}</span>` +
      `<span class="loop-score-toast-caption">${caption}</span>`;
  }
}

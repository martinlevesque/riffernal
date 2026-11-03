// Renders the end-of-song results overlay showing the core stats
// (score, max combo, accuracy, timing). Handles retry and back-to-menu actions.

import { type NavAction, runNavAction, setFocused } from '../../ui/navFocus.js';
import { formatScore } from '../../utils/helpers.js';
import type { Scoring } from '../scoring.js';
import {
  BTN_MENU_ID,
  BTN_PLAY_ID,
  BTN_RETRY_ID,
  RESULT_GRADE_ID,
  RESULT_STATS_ID,
  RESULTS_SCREEN_ID,
} from './resultsScreenElementIds.js';

export class ResultsScreen {
  private _screen: HTMLElement;
  private _grade: HTMLElement;
  private _stats: HTMLElement;
  private _playButton: HTMLElement;
  private _bestBanner: HTMLElement;
  private _buttons: HTMLElement[];

  constructor() {
    this._screen = document.getElementById(RESULTS_SCREEN_ID)!;
    this._grade = document.getElementById(RESULT_GRADE_ID)!;
    this._stats = document.getElementById(RESULT_STATS_ID)!;
    this._playButton = document.getElementById(BTN_PLAY_ID)!;
    this._buttons = [
      this._playButton,
      document.getElementById(BTN_RETRY_ID)!,
      document.getElementById(BTN_MENU_ID)!,
    ];

    this._bestBanner = document.createElement('div');
    this._bestBanner.className = 'new-best-banner';
    this._bestBanner.textContent = 'BEST SCORE!';
    this._bestBanner.style.display = 'none';
    this._grade.insertAdjacentElement('afterend', this._bestBanner);
  }

  show(scoring: Scoring, usedLearningMode: boolean, isNewBest = false): void {
    this._screen.classList.add('active');
    this._playButton.style.display = usedLearningMode ? '' : 'none';
    this._bestBanner.style.display = isNewBest ? '' : 'none';
    setFocused(this._buttons, this._visibleButtons()[0]);

    if (usedLearningMode) {
      this._grade.textContent = 'PRACTICE';
      this._grade.className = 'grade-practice';
    } else {
      const gradeInfo = scoring.getGrade();
      this._grade.textContent = gradeInfo.grade;
      this._grade.className = gradeInfo.class;
    }
    this._renderStats(scoring);
  }

  /** Drive the result buttons with a bound note shortcut: prev/next move
   *  the focus across the visible buttons, enter presses the focused one. */
  runAction(action: NavAction): void {
    runNavAction(this._visibleButtons(), action);
  }

  private _visibleButtons(): HTMLElement[] {
    return this._buttons.filter((b) => b.style.display !== 'none');
  }

  private _renderStats(scoring: Scoring): void {
    const avgOffset = scoring.getAverageOffsetMs();
    const offsetDir = scoring.getOffsetDirection();

    this._stats.innerHTML = `
      <div class="stats-columns">
        <div class="stat"><span class="stat-value">${formatScore(scoring.score)}</span><span class="stat-label">Score</span></div>
        <div class="stat"><span class="stat-value">${scoring.maxCombo}</span><span class="stat-label">Max Combo</span></div>
        <div class="stat"><span class="stat-value">${scoring.getAccuracy()}%</span><span class="stat-label">Accuracy</span></div>
      </div>
      <p class="stat-secondary">Timing - ${avgOffset} ms ${offsetDir}</p>
    `;
  }

  hide(): void {
    this._screen.classList.remove('active');
    this._bestBanner.style.display = 'none';
  }
}

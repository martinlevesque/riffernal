// Renders the end-of-song results overlay showing score, accuracy,
// and note grade breakdown. Handles retry and back-to-menu actions.

import { formatScore } from '../../utils/helpers.js';
import type { Scoring } from '../scoring.js';

export class ResultsScreen {
  private _screen: HTMLElement;
  private _grade: HTMLElement;
  private _stats: HTMLElement;
  private _playButton: HTMLElement;
  private _bestBanner: HTMLElement;

  constructor() {
    this._screen = document.getElementById('results-screen')!;
    this._grade = document.getElementById('result-grade')!;
    this._stats = document.getElementById('result-stats')!;
    this._playButton = document.getElementById('btn-play')!;

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

    if (usedLearningMode) {
      this._grade.textContent = 'PRACTICE';
      this._grade.className = 'grade-practice';
      this._renderPracticeStats(scoring);
    } else {
      const gradeInfo = scoring.getGrade();
      this._grade.textContent = gradeInfo.grade;
      this._grade.className = gradeInfo.class;
      this._renderPlayStats(scoring);
    }
  }

  private _renderPracticeStats(scoring: Scoring): void {
    const n = scoring.totalResolvedNotes;
    const accuracy = scoring.getAccuracy();
    const avgOffset = scoring.getAverageOffsetMs();
    const offsetDir = scoring.getOffsetDirection();

    this._stats.innerHTML = `
      <div class="stats-practice-highlight">
        Score: <span class="stat-value stat-xlarge">${formatScore(scoring.score)}</span>
      </div>
      <div class="stats-practice-highlight">
        Accuracy: <span class="stat-value stat-large">${accuracy}%</span><br>
        <span class="stat-secondary">${scoring.totalNotes} notes total</span>
      </div>
      <div class="stats-row">
        <span class="stats-col"><span class="stat-label">Perfect</span><span class="stat-value">${scoring.perfects} / ${n}</span></span>
        <span class="stats-col"><span class="stat-label">Great</span><span class="stat-value">${scoring.greats} / ${n}</span></span>
        <span class="stats-col"><span class="stat-label">Good</span><span class="stat-value">${scoring.goods} / ${n}</span></span>
      </div>
      <div class="stats-row">
        <span class="stats-col"><span class="stat-label">Miss</span><span class="stat-value">${scoring.misses} / ${n}</span></span>
        <span class="stats-col"><span class="stat-label">Wrong</span><span class="stat-value">${scoring.wrongNotes} / ${n}</span></span>
        <span class="stats-col"><span class="stat-label">Dropped</span><span class="stat-value">${scoring.failures} / ${n}</span></span>
      </div>
      <div class="stats-row">
        <span class="stats-col"><span class="stat-label">Max Combo</span><span class="stat-value">${scoring.maxCombo}</span></span>
        <span class="stats-col"><span class="stat-label">Timing (ms)</span><span class="stat-value">${avgOffset} ${offsetDir}</span></span>
      </div>
    `;
  }

  private _renderPlayStats(scoring: Scoring): void {
    const avgOffset = scoring.getAverageOffsetMs();
    const offsetDir = scoring.getOffsetDirection();

    this._stats.innerHTML = `
      Score: <span class="stat-value">${formatScore(scoring.score)}</span><br>
      Perfect: <span class="stat-value">${scoring.perfects}</span><br>
      Great: <span class="stat-value">${scoring.greats}</span><br>
      Good: <span class="stat-value">${scoring.goods}</span><br>
      Miss: <span class="stat-value">${scoring.misses}</span><br>
      Wrong: <span class="stat-value">${scoring.wrongNotes}</span><br>
      Dropped: <span class="stat-value">${scoring.failures}</span><br>
      Max Combo: <span class="stat-value">${scoring.maxCombo}</span><br>
      Accuracy: <span class="stat-value">${scoring.getAccuracy()}%</span><br>
      <span class="stat-secondary">Timing (ms): ${avgOffset} ${offsetDir}</span>
    `;
  }

  hide(): void {
    this._screen.classList.remove('active');
    this._bestBanner.style.display = 'none';
  }
}

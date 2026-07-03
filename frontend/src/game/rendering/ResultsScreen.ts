// Renders the end-of-song results overlay showing score, accuracy,
// and note grade breakdown. Handles retry and back-to-menu actions.

import { formatScore } from '../../utils/helpers.js';
import type { Scoring } from '../scoring.js';

export class ResultsScreen {
  private el: HTMLElement;
  private gradeEl: HTMLElement;
  private statsEl: HTMLElement;
  private playBtn: HTMLElement;
  private newBestEl: HTMLElement;

  constructor() {
    this.el = document.getElementById('results-screen')!;
    this.gradeEl = document.getElementById('result-grade')!;
    this.statsEl = document.getElementById('result-stats')!;
    this.playBtn = document.getElementById('btn-play')!;

    this.newBestEl = document.createElement('div');
    this.newBestEl.className = 'new-best-banner';
    this.newBestEl.textContent = 'BEST SCORE!';
    this.newBestEl.style.display = 'none';
    this.gradeEl.insertAdjacentElement('afterend', this.newBestEl);
  }

  show(scoring: Scoring, usedLearningMode: boolean, isNewBest = false): void {
    this.el.classList.add('active');
    this.playBtn.style.display = usedLearningMode ? '' : 'none';
    this.newBestEl.style.display = isNewBest ? '' : 'none';

    if (usedLearningMode) {
      this.gradeEl.textContent = 'PRACTICE';
      this.gradeEl.className = 'grade-practice';
      this._renderPracticeStats(scoring);
    } else {
      const gradeInfo = scoring.getGrade();
      this.gradeEl.textContent = gradeInfo.grade;
      this.gradeEl.className = gradeInfo.class;
      this._renderPlayStats(scoring);
    }
  }

  private _renderPracticeStats(scoring: Scoring): void {
    const n = scoring.totalResolvedNotes;
    const accuracy = scoring.getAccuracy();

    this.statsEl.innerHTML = `
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
      <div class="stats-center">
        <span class="stat-label">Max Combo</span>
        <span class="stat-value">${scoring.maxCombo}</span>
      </div>
    `;
  }

  private _renderPlayStats(scoring: Scoring): void {
    this.statsEl.innerHTML = `
      Score: <span class="stat-value">${formatScore(scoring.score)}</span><br>
      Perfect: <span class="stat-value">${scoring.perfects}</span><br>
      Great: <span class="stat-value">${scoring.greats}</span><br>
      Good: <span class="stat-value">${scoring.goods}</span><br>
      Miss: <span class="stat-value">${scoring.misses}</span><br>
      Wrong: <span class="stat-value">${scoring.wrongNotes}</span><br>
      Dropped: <span class="stat-value">${scoring.failures}</span><br>
      Max Combo: <span class="stat-value">${scoring.maxCombo}</span><br>
      Accuracy: <span class="stat-value">${scoring.getAccuracy()}%</span>
    `;
  }

  hide(): void {
    this.el.classList.remove('active');
    this.newBestEl.style.display = 'none';
  }
}

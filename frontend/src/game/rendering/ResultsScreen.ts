// Renders the end-of-song results overlay showing score, accuracy,
// and note grade breakdown. Handles retry and back-to-menu actions.

import { formatScore } from '../../utils/helpers.js';
import type { Scoring } from '../scoring.js';

export class ResultsScreen {
  private el: HTMLElement;
  private gradeEl: HTMLElement;
  private statsEl: HTMLElement;
  private playBtn: HTMLElement;

  constructor() {
    this.el = document.getElementById('results-screen')!;
    this.gradeEl = document.getElementById('result-grade')!;
    this.statsEl = document.getElementById('result-stats')!;
    this.playBtn = document.getElementById('btn-play')!;
  }

  show(scoring: Scoring, usedLearningMode: boolean): void {
    this.el.classList.add('active');
    this.playBtn.style.display = usedLearningMode ? '' : 'none';

    if (usedLearningMode) {
      this.gradeEl.textContent = 'PRACTICE';
      this.gradeEl.className = 'grade-practice';
    } else {
      const gradeInfo = scoring.getGrade();
      this.gradeEl.textContent = gradeInfo.grade;
      this.gradeEl.className = gradeInfo.class;
    }

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
  }
}

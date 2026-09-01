import { fetchLeaderboard, type LeaderboardEntry } from '../../api/LeaderboardApi.js';
import { getStoredUser } from '../../api/AuthApi.js';

export class LeaderboardPanel {
  private _el: HTMLElement;

  constructor() {
    this._el = document.getElementById('home-leaderboard')!;
  }

  async refresh(): Promise<void> {
    try {
      this._render(await fetchLeaderboard());
    } catch (e) {
      console.error('Failed to refresh leaderboard:', e);
    }
  }

  private _render(entries: LeaderboardEntry[]): void {
    const el = this._el;
    const me = getStoredUser();

    if (entries.length === 0) {
      el.innerHTML =
        '<div class="home-leaderboard-title">Today\'s leaderboard</div>' +
        '<div class="home-leaderboard-empty">No scores yet today</div>';

      return;
    }

    const rows = entries
      .map((e) => {
        const isYou = me != null && e.userId === me.id;
        const lastSong = e.lastSong
          ? this._escapeHtml(e.lastSong)
          : '<span class="home-leaderboard-dash">—</span>';
        const userCell =
          this._escapeHtml(e.username) +
          (isYou ? ' <span class="home-leaderboard-you">you</span>' : '');
        // The username and last-song cells truncate with ellipsis, so carry
        // the full row text in a native title tooltip shown on hover.
        const fullText = e.lastSong
          ? `#${e.rank} ${e.username} · ${e.totalScore.toLocaleString()} · Last: ${e.lastSong}`
          : `#${e.rank} ${e.username} · ${e.totalScore.toLocaleString()}`;

        return (
          `<tr class="${isYou ? 'is-you' : ''}" title="${this._escapeHtml(fullText)}">` +
          `<td class="home-leaderboard-rank">${e.rank}</td>` +
          `<td class="home-leaderboard-user">${userCell}</td>` +
          `<td class="home-leaderboard-score">${e.totalScore.toLocaleString()}</td>` +
          `<td class="home-leaderboard-song">${lastSong}</td>` +
          '</tr>'
        );
      })
      .join('');

    el.innerHTML =
      '<div class="home-leaderboard-title">Today\'s leaderboard</div>' +
      '<table class="home-leaderboard-table"><tbody>' +
      rows +
      '</tbody></table>';
  }

  private _escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => {
      switch (c) {
        case '&':
          return '&amp;';
        case '<':
          return '&lt;';
        case '>':
          return '&gt;';
        case '"':
          return '&quot;';
        default:
          return '&#39;';
      }
    });
  }
}

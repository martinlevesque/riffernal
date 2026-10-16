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
        const songLabel = e.lastSong
          ? (e.lastSongArtist ? `${e.lastSongArtist} — ${e.lastSong}` : e.lastSong)
          : null;
        const userCell =
          this._escapeHtml(e.username) +
          (isYou ? ' <span class="home-leaderboard-you">you</span>' : '');
        // Score and last-song live only in the hover tooltip — wide values
        // (6-digit scores, long titles) never break the fixed-width row.
        const fullText = songLabel
          ? `#${e.rank} ${e.username} · ${e.totalScore.toLocaleString()} · Last: ${songLabel}`
          : `#${e.rank} ${e.username} · ${e.totalScore.toLocaleString()}`;

        return (
          `<tr class="${isYou ? 'is-you' : ''}" title="${this._escapeHtml(fullText)}">` +
          `<td class="home-leaderboard-rank">${e.rank}</td>` +
          `<td class="home-leaderboard-user">${userCell}</td>` +
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

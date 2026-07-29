import { type Game, GameState } from '../../game/Game.js';
import type { Song } from '../../utils/MidiParser.js';
import { formatTime, formatScore } from '../../utils/helpers.js';

export class SongInfoPopup {
  private songInfoPopup: HTMLElement;
  private songInfoDuration: HTMLElement;
  private songInfoBestScore: HTMLElement;
  private btnCloseSongInfo: HTMLElement;
  private songInfoTimer: ReturnType<typeof setTimeout> | null = null;
  private game: Game;
  private updatePauseBtn: () => void;

  constructor(game: Game, updatePauseBtn: () => void) {
    this.game = game;
    this.updatePauseBtn = updatePauseBtn;
    this.songInfoPopup = document.getElementById('song-info-popup')!;
    this.songInfoDuration = document.getElementById('song-info-duration')!;
    this.songInfoBestScore = document.getElementById('song-info-best-score')!;
    this.btnCloseSongInfo = document.getElementById('btn-close-song-info')!;

    this.btnCloseSongInfo.addEventListener('click', () => this.hide());
  }

  show(song: Song): void {
    const duration = this.game.noteManager.getSongDuration();
    this.songInfoDuration.textContent = formatTime(duration);
    this.songInfoBestScore.textContent =
      song.bestScore != null ? formatScore(song.bestScore) : 'No record yet';
    this.songInfoPopup.classList.remove('hidden');
    this.songInfoTimer = setTimeout(() => this.hide(), 4000);
  }

  hide(): void {
    if (this.songInfoTimer !== null) {
      clearTimeout(this.songInfoTimer);
      this.songInfoTimer = null;
    }

    this.songInfoPopup.classList.add('hidden');

    if (this.game.state === GameState.Playing && this.game.paused) {
      this.game.togglePause();
      this.updatePauseBtn();
    }
  }
}

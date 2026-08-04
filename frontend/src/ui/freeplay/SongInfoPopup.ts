import { type Game, GameState } from '../../game/Game.js';
import type { Song } from '../../utils/MidiParser.js';
import { formatTime, formatScore } from '../../utils/helpers.js';

export class SongInfoPopup {
  private _songInfoPopup: HTMLElement;
  private _songInfoDuration: HTMLElement;
  private _songInfoBestScore: HTMLElement;
  private _btnCloseSongInfo: HTMLElement;
  private _songInfoTimer: ReturnType<typeof setTimeout> | null = null;
  private _game: Game;
  private _updatePauseBtn: () => void;

  constructor(game: Game, updatePauseBtn: () => void) {
    this._game = game;
    this._updatePauseBtn = updatePauseBtn;
    this._songInfoPopup = document.getElementById('song-info-popup')!;
    this._songInfoDuration = document.getElementById('song-info-duration')!;
    this._songInfoBestScore = document.getElementById('song-info-best-score')!;
    this._btnCloseSongInfo = document.getElementById('btn-close-song-info')!;

    this._btnCloseSongInfo.addEventListener('click', () => this.hide());
  }

  show(song: Song): void {
    const duration = this._game.noteManager.getSongDuration();
    this._songInfoDuration.textContent = formatTime(duration);
    this._songInfoBestScore.textContent =
      song.bestScore != null ? formatScore(song.bestScore) : 'No record yet';
    this._songInfoPopup.classList.remove('hidden');
    this._songInfoTimer = setTimeout(() => this.hide(), 4000);
  }

  hide(): void {
    if (this._songInfoTimer !== null) {
      clearTimeout(this._songInfoTimer);
      this._songInfoTimer = null;
    }

    this._songInfoPopup.classList.add('hidden');

    if (this._game.state === GameState.Playing && this._game.paused) {
      this._game.togglePause();
      this._updatePauseBtn();
    }
  }
}

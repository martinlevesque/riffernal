import { type Game, GameState } from '../../game/Game.js';
import type { Song } from '../../utils/MidiParser.js';
import { formatTime, formatScore } from '../../utils/helpers.js';
import { hasUserGestured } from '../../audio/userGesture.js';

const GESTURE_EVENTS = ['pointerdown', 'pointerup', 'keydown', 'touchend'] as const;

export class SongInfoPopup {
  private _songInfoPopup: HTMLElement;
  private _songInfoDuration: HTMLElement;
  private _songInfoBestScore: HTMLElement;
  private _btnCloseSongInfo: HTMLElement;
  private _songInfoTimer: ReturnType<typeof setTimeout> | null = null;
  private _soundHint: HTMLElement;
  private _unlockToken = 0;
  private _game: Game;
  private _updatePauseBtn: () => void;
  /** True while the popup holds because the browser still blocks audio. */
  private _holdingForAudio = false;
  private _removeGestureListeners: () => void = () => {};

  constructor(game: Game, updatePauseBtn: () => void) {
    this._game = game;
    this._updatePauseBtn = updatePauseBtn;
    this._songInfoPopup = document.getElementById('song-info-popup')!;
    this._songInfoDuration = document.getElementById('song-info-duration')!;
    this._songInfoBestScore = document.getElementById('song-info-best-score')!;
    this._soundHint = document.getElementById('song-info-sound-hint')!;
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
    void this._holdUntilAudioUnlocked();
  }

  // Browsers keep audio blocked after a page load until a click or key press
  // (MIDI input does not count), so a MIDI-only user would play in silence.
  private async _holdUntilAudioUnlocked(): Promise<void> {
    const token = ++this._unlockToken;

    // Arm the dismissal listeners before the probe so a gesture landing
    // during it is never missed; the handler stays inert until hold mode
    // engages below.
    this._armGestureListeners();

    if (await this._game.tryResumeAudio()) {
      this._disarmGestureListeners();
      return;
    }

    if (token !== this._unlockToken) return;

    // The user gestured while the probe ran without the context ever
    // reporting running: treat the popup like the normal (non-blocked)
    // flow instead of holding with a stale warning.
    if (hasUserGestured()) {
      this._disarmGestureListeners();
      return;
    }

    if (this._songInfoTimer !== null) {
      clearTimeout(this._songInfoTimer);
      this._songInfoTimer = null;
    }

    this._holdingForAudio = true;
    this._soundHint.classList.remove('hidden');
  }

  private _armGestureListeners(): void {
    const onGesture = async () => {
      if (!this._holdingForAudio) return;

      if (!(await this._game.tryResumeAudio())) return;

      this.hide();
    };

    for (const type of GESTURE_EVENTS) {
      document.addEventListener(type, onGesture, true);
    }

    this._removeGestureListeners = () => {
      for (const type of GESTURE_EVENTS) {
        document.removeEventListener(type, onGesture, true);
      }
    };
  }

  private _disarmGestureListeners(): void {
    this._removeGestureListeners();
    this._removeGestureListeners = () => {};
  }

  hide(): void {
    if (this._songInfoTimer !== null) {
      clearTimeout(this._songInfoTimer);
      this._songInfoTimer = null;
    }

    this._unlockToken++;
    this._holdingForAudio = false;
    this._disarmGestureListeners();
    this._soundHint.classList.add('hidden');
    this._songInfoPopup.classList.add('hidden');

    if (this._game.state === GameState.Playing && this._game.paused) {
      this._game.togglePause();
      this._updatePauseBtn();
    }
  }
}

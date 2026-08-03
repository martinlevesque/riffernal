import { type Game, GameState } from '../../game/Game.js';

export class SpeedControls {
  private _speedValue: HTMLElement;
  private _game: Game;

  constructor(game: Game) {
    this._game = game;
    this._speedValue = document.getElementById('speed-value')!;
    const speedDown = document.getElementById('speed-down')!;
    const speedUp = document.getElementById('speed-up')!;

    speedDown.addEventListener('click', () => this._changeSpeed(-0.1));
    speedUp.addEventListener('click', () => this._changeSpeed(0.1));

    document.addEventListener('keydown', (e) => {
      if (this._game.state !== GameState.Playing) return;

      if (e.code === 'BracketLeft') this._changeSpeed(-0.1);
      else if (e.code === 'BracketRight') this._changeSpeed(0.1);
    });

    this._updateSpeedDisplay();
  }

  private _changeSpeed(delta: number): void {
    const newSpeed = Math.round((this._game.speedMultiplier + delta) * 10) / 10;
    this._game.setSpeed(newSpeed);
    this._updateSpeedDisplay();
  }

  private _updateSpeedDisplay(): void {
    this._speedValue.textContent = `${Math.round(this._game.speedMultiplier * 100)}%`;
  }
}

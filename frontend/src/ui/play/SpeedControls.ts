import { type Game, GameState } from '../../game/Game.js';

export class SpeedControls {
  private speedValue: HTMLElement;
  private game: Game;

  constructor(game: Game) {
    this.game = game;
    this.speedValue = document.getElementById('speed-value')!;
    const speedDown = document.getElementById('speed-down')!;
    const speedUp = document.getElementById('speed-up')!;

    speedDown.addEventListener('click', () => this.changeSpeed(-0.1));
    speedUp.addEventListener('click', () => this.changeSpeed(0.1));

    document.addEventListener('keydown', (e) => {
      if (this.game.state !== GameState.Playing) return;

      if (e.code === 'BracketLeft') this.changeSpeed(-0.1);
      else if (e.code === 'BracketRight') this.changeSpeed(0.1);
    });

    this.updateSpeedDisplay();
  }

  private changeSpeed(delta: number): void {
    const newSpeed = Math.round((this.game.speedMultiplier + delta) * 10) / 10;
    this.game.setSpeed(newSpeed);
    this.updateSpeedDisplay();
  }

  private updateSpeedDisplay(): void {
    this.speedValue.textContent = `${Math.round(this.game.speedMultiplier * 100)}%`;
  }
}

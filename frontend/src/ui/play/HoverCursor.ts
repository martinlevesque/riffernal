import { type Game, GameState, LoopDefinitionState } from '../../game/Game.js';
import type { Renderer } from '../../game/rendering/Renderer.js';

export function setupHoverCursor(
  game: Game,
  targetCanvas: HTMLCanvasElement,
  targetRenderer: Renderer,
): void {
  let hoverRAF: number | null = null;

  targetCanvas.addEventListener('mousemove', (e) => {
    if (hoverRAF !== null) return;
    hoverRAF = requestAnimationFrame(() => {
      hoverRAF = null;

      if (game.state !== GameState.Playing) {
        targetCanvas.style.cursor = '';

        return;
      }

      const rect = targetCanvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const inLoopDefine = game.loopDefinitionState === LoopDefinitionState.Start
        || game.loopDefinitionState === LoopDefinitionState.End;
      const radius = inLoopDefine ? 50 : 30;
      const note = game.noteManager.findNearestNoteByClick(x, y, targetRenderer, radius);
      targetCanvas.style.cursor = note ? 'pointer' : 'crosshair';
    });
  });

  targetCanvas.addEventListener('mouseleave', () => {
    targetCanvas.style.cursor = 'crosshair';
  });
}

import { type Game, GameState, LoopDefinitionState } from '../../game/Game.js';
import type { Renderer } from '../../game/rendering/Renderer.js';
import { formatTimePrecise } from '../../utils/helpers.js';

const TOOLTIP_OFFSET_PX = 14;

// One element shared by every canvas, so only a single tooltip can be visible.
function getTimeTooltip(): HTMLElement {
  const existing = document.querySelector<HTMLElement>('.pixel-tooltip');

  if (existing) return existing;

  const el = document.createElement('div');
  el.className = 'pixel-tooltip';
  el.hidden = true;
  document.body.appendChild(el);

  return el;
}

export function setupHoverCursor(
  game: Game,
  targetCanvas: HTMLCanvasElement,
  targetRenderer: Renderer,
): void {
  let hoverRAF: number | null = null;
  const tooltip = getTimeTooltip();

  targetCanvas.addEventListener('mousemove', (e) => {
    if (hoverRAF !== null) return;
    hoverRAF = requestAnimationFrame(() => {
      hoverRAF = null;

      if (game.state !== GameState.Playing) {
        targetCanvas.style.cursor = '';
        tooltip.hidden = true;

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

      if (!note) {
        tooltip.hidden = true;

        return;
      }

      tooltip.textContent = formatTimePrecise(note.time);
      tooltip.style.left = `${e.clientX + TOOLTIP_OFFSET_PX}px`;
      tooltip.style.top = `${e.clientY + TOOLTIP_OFFSET_PX}px`;
      tooltip.hidden = false;
    });
  });

  targetCanvas.addEventListener('mouseleave', () => {
    if (hoverRAF !== null) {
      cancelAnimationFrame(hoverRAF);
      hoverRAF = null;
    }

    targetCanvas.style.cursor = 'crosshair';
    tooltip.hidden = true;
  });
}

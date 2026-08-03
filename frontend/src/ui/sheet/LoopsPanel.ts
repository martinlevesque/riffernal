import { type Game, LoopDefinitionState } from '../../game/Game.js';
import { updateLoopEnabled, updateLoopEndTime, deleteLoop } from '../../api/LoopApi.js';
import { reportError } from '../../utils/helpers.js';

export interface LoopsPanelCallbacks {
  setMode: (learning: boolean) => void;
  onMutated: (opts?: { scrollToEnd?: boolean }) => void;
}

function fmtBounds(start: number, end: number): string {
  return `${start.toFixed(2)}s-${end.toFixed(2)}s`;
}

export class LoopsPanel {
  selectedId: number | null = null;

  private _game: Game;
  private _callbacks: LoopsPanelCallbacks;
  private _loopsList: HTMLElement;
  private _loopsPanelCount: HTMLElement;

  constructor(game: Game, callbacks: LoopsPanelCallbacks) {
    this._game = game;
    this._callbacks = callbacks;
    this._loopsList = document.getElementById('loops-list')!;
    this._loopsPanelCount = document.getElementById('loops-panel-count')!;
  }

  render(): void {
    this._loopsList.innerHTML = '';
    const loops = this._game.loop.loops;
    const chain = this._game.loop.chain;

    this._loopsPanelCount.textContent = chain.length > 0
      ? `${chain.length} enabled`
      : '';

    if (loops.length === 0 && !this._game.loop.hasDraft) {
      const empty = document.createElement('li');
      empty.className = 'loops-list-empty';
      empty.textContent = 'No loops saved — click LOOP to define one';
      this._loopsList.appendChild(empty);

      return;
    }

    for (const loop of loops) {
      const li = document.createElement('li');
      li.className = 'loop-row';

      if (loop.id === this.selectedId) li.classList.add('loop-row--selected');

      const time = document.createElement('span');
      time.className = 'loop-row-time';
      time.textContent = fmtBounds(loop.startTime, loop.endTime);

      const toggle = document.createElement('button');
      toggle.className = 'loop-row-toggle';

      if (loop.enabled) toggle.classList.add('is-on');
      toggle.textContent = loop.enabled ? 'ON' : 'OFF';
      toggle.title = loop.enabled ? 'Disable loop' : 'Enable loop';
      toggle.addEventListener('click', async () => {
        const next = !loop.enabled;

        try {
          await updateLoopEnabled(loop.id, next);
          this._game.setLoopEnabled(loop.id, next);

          if (next && this._game.loopActive && !this._game.learningMode) this._callbacks.setMode(true);
          this.render();
          this._callbacks.onMutated();
        } catch (e) {
          reportError('Failed to update loop', e);
        }
      });

      const delBtn = document.createElement('button');
      delBtn.className = 'loop-row-delete';
      delBtn.textContent = 'Delete';
      delBtn.title = 'Delete this loop';
      delBtn.addEventListener('click', async () => {
        try {
          await deleteLoop(loop.id);
          this._game.deleteSavedLoop(loop.id);

          if (this.selectedId === loop.id) this.selectedId = null;
          this.render();
          this._callbacks.onMutated();
        } catch (e) {
          reportError('Failed to delete loop', e);
        }
      });

      const extendBtn = this._buildExtendBtn(loop);

      li.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        this.selectedId = this.selectedId === loop.id ? null : loop.id;
        this.render();
        this._callbacks.onMutated();
      });

      li.appendChild(time);
      li.appendChild(toggle);
      li.appendChild(extendBtn);
      li.appendChild(delBtn);
      this._loopsList.appendChild(li);
    }

    if (this._game.loopDefinitionState !== LoopDefinitionState.Off) {
      const ds = this._game.loop.draftStart;
      const li = document.createElement('li');
      li.className = 'loop-row loop-row--draft';

      const time = document.createElement('span');
      time.className = 'loop-row-time';
      time.textContent = ds !== null
        ? `${fmtBounds(ds, ds)} (picking end…)`
        : '(picking start…)';

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'loop-row-cancel';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.addEventListener('click', () => {
        this._game.cancelLoopDraft();
        this.render();
        this._callbacks.onMutated();
      });

      li.appendChild(time);
      li.appendChild(cancelBtn);
      this._loopsList.appendChild(li);
    }
  }

  private _buildExtendBtn(loop: { id: number; endTime: number }): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'loop-row-extend';
    btn.textContent = '>';
    btn.title = 'Extend loop to next note';
    btn.addEventListener('click', async () => {
      const nextTime = this._game.noteManager.findNextUnplayedTime(loop.endTime);

      if (nextTime === null) return;

      try {
        await updateLoopEndTime(loop.id, nextTime);
        this._game.setLoopEndTime(loop.id, nextTime);
        this.render();
        this._callbacks.onMutated({ scrollToEnd: true });
      } catch (e) {
        reportError('Failed to extend loop', e);
      }
    });

    return btn;
  }

  select(id: number | null): void {
    this.selectedId = id;
  }
}

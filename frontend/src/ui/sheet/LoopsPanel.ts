import { type Game, LoopDefinitionState } from '../../game/Game.js';
import { updateLoopEnabled, updateLoopEndTime, deleteLoop } from '../../api/LoopApi.js';
import { formatTime, reportError } from '../../utils/helpers.js';

export interface LoopsPanelCallbacks {
  setMode: (learning: boolean) => void;
  onMutated: (opts?: { scrollToEnd?: boolean }) => void;
}

function fmtBounds(start: number, end: number): string {
  return `${formatTime(start)}-${formatTime(end)}`;
}

/** Loop fields the row button builders need. */
interface LoopRow {
  id: number;
  startTime: number;
  endTime: number;
}

function rowBtn(cls: string, text: string, title?: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = cls;
  btn.textContent = text;

  if (title) btn.title = title;

  return btn;
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

      const toggle = rowBtn(
        'loop-row-toggle',
        loop.enabled ? 'ON' : 'OFF',
        loop.enabled ? 'Disable loop' : 'Enable loop',
      );

      if (loop.enabled) toggle.classList.add('is-on');

      toggle.addEventListener('click', async () => {
        const next = !loop.enabled;

        try {
          await updateLoopEnabled(loop.id, next);
          this._game.setLoopEnabled(loop.id, next);

          if (next && this._game.loopActive && !this._game.learningMode) this._callbacks.setMode(true);
          this._sync();
        } catch (e) {
          reportError('Failed to update loop', e);
        }
      });

      const delBtn = rowBtn('loop-row-delete', 'Delete', 'Delete this loop');
      delBtn.addEventListener('click', async () => {
        try {
          await deleteLoop(loop.id);
          this._game.deleteSavedLoop(loop.id);

          if (this.selectedId === loop.id) this.selectedId = null;
          this._sync();
        } catch (e) {
          reportError('Failed to delete loop', e);
        }
      });

      const trimBtn = this._buildTrimBtn(loop);
      const extendBtn = this._buildExtendBtn(loop);

      li.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        this.selectedId = this.selectedId === loop.id ? null : loop.id;
        this._sync();
      });

      li.appendChild(time);
      li.appendChild(toggle);
      li.appendChild(trimBtn);
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

      const cancelBtn = rowBtn('loop-row-cancel', 'Cancel');
      cancelBtn.addEventListener('click', () => {
        this._game.cancelLoopDraft();
        this._sync();
      });

      li.appendChild(time);
      li.appendChild(cancelBtn);
      this._loopsList.appendChild(li);
    }
  }

  /** Re-render the rows and notify the sheet view of the mutation. */
  private _sync(opts: { scrollToEnd?: boolean } = {}): void {
    this.render();
    this._callbacks.onMutated(opts);
  }

  /** Persist a new loop end (no-op when null), then sync panel + sheet. */
  private async _updateLoopEnd(loop: LoopRow, newEnd: number | null, errorText: string): Promise<void> {
    if (newEnd === null) return;

    try {
      await updateLoopEndTime(loop.id, newEnd);
      this._game.setLoopEndTime(loop.id, newEnd);
      this._sync({ scrollToEnd: true });
    } catch (e) {
      reportError(errorText, e);
    }
  }

  private _buildTrimBtn(loop: LoopRow): HTMLButtonElement {
    const btn = rowBtn('loop-row-shrink', '<', 'Trim loop to previous note');
    btn.addEventListener('click', async () => {
      const newEnd = this._game.noteManager.findLoopTrimEnd(loop.startTime, loop.endTime);
      await this._updateLoopEnd(loop, newEnd, 'Failed to trim loop');
    });

    return btn;
  }

  private _buildExtendBtn(loop: LoopRow): HTMLButtonElement {
    const btn = rowBtn('loop-row-extend', '>', 'Extend loop to next note');
    btn.addEventListener('click', async () => {
      const newEnd = this._game.noteManager.findNextUnplayedTime(loop.endTime);
      await this._updateLoopEnd(loop, newEnd, 'Failed to extend loop');
    });

    return btn;
  }

  select(id: number | null): void {
    this.selectedId = id;
  }
}

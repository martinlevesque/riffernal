import { type Game, LoopDefinitionState } from '../../game/Game.js';
import { updateLoop, deleteLoop } from '../../api/LoopApi.js';
import { formatTime, reportError } from '../../utils/helpers.js';
import type { SavedLoop } from '../../game/LoopService.js';

export interface LoopsPanelCallbacks {
  setMode: (learning: boolean) => void;
  onMutated: (opts?: { scrollToEnd?: boolean }) => void;
}

/** Same cap the backend applies when trimming a name. */
const LOOP_NAME_MAX_LENGTH = 64;

function fmtBounds(start: number, end: number): string {
  return `${formatTime(start)}-${formatTime(end)}`;
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
  private _editingId: number | null = null;

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

      if (this._editingId === loop.id) li.appendChild(this._buildNameInput(loop));
      else li.appendChild(this._buildNameCell(loop));

      const time = document.createElement('span');
      time.className = 'loop-row-time';
      time.textContent = fmtBounds(loop.startTime, loop.endTime);
      li.appendChild(time);

      const toggle = rowBtn(
        'loop-row-toggle',
        loop.enabled ? 'ON' : 'OFF',
        loop.enabled ? 'Disable loop' : 'Enable loop',
      );

      if (loop.enabled) toggle.classList.add('is-on');

      toggle.addEventListener('click', async () => {
        const next = !loop.enabled;

        try {
          await updateLoop(loop.id, { enabled: next });
          this._game.setLoopProperties(loop.id, { enabled: next });

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
        if ((e.target as HTMLElement).closest('button, input')) return;
        this.selectedId = this.selectedId === loop.id ? null : loop.id;
        this._sync();
      });

      li.appendChild(toggle);
      li.appendChild(trimBtn);
      li.appendChild(extendBtn);
      li.appendChild(delBtn);
      this._loopsList.appendChild(li);

      if (this._editingId === loop.id) {
        const input = li.querySelector<HTMLInputElement>('.loop-row-name-input');
        input?.focus();
        input?.select();
      }
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
  private async _updateLoopEnd(loop: SavedLoop, newEnd: number | null, errorText: string): Promise<void> {
    if (newEnd === null) return;

    // The row's loop object is the live SavedLoop — snapshot the old end
    // before setLoopProperties overwrites it.
    const oldEnd = loop.endTime;

    try {
      await updateLoop(loop.id, { endTime: newEnd });
      this._game.setLoopProperties(loop.id, { endTime: newEnd });
      this._game.playLoopBoundaryNotes(loop.startTime, oldEnd, newEnd);
      this._sync({ scrollToEnd: true });
    } catch (e) {
      reportError(errorText, e);
    }
  }

  private _buildTrimBtn(loop: SavedLoop): HTMLButtonElement {
    const btn = rowBtn('loop-row-shrink', '<', 'Trim loop to previous note');
    btn.addEventListener('click', async () => {
      const newEnd = this._game.noteManager.findLoopTrimEnd(loop.startTime, loop.endTime);
      await this._updateLoopEnd(loop, newEnd, 'Failed to trim loop');
    });

    return btn;
  }

  private _buildExtendBtn(loop: SavedLoop): HTMLButtonElement {
    const btn = rowBtn('loop-row-extend', '>', 'Extend loop to next note');
    btn.addEventListener('click', async () => {
      const newEnd = this._game.findLoopExtendEnd(loop.startTime, loop.endTime);
      await this._updateLoopEnd(loop, newEnd, 'Failed to extend loop');
    });

    return btn;
  }

  /** Name label for a renamed loop, or its positional default ("Loop N")
   *  straight from the service; clicking starts an inline edit instead of
   *  the row's select toggle. */
  private _buildNameCell(loop: SavedLoop): HTMLElement {
    const span = document.createElement('span');
    // A positional default keeps the muted "placeholder" look so it reads
    // as auto-assigned, not user-chosen.
    span.className = loop.name ? 'loop-row-name' : 'loop-row-name loop-row-name--empty';
    span.textContent = this._game.loop.displayName(loop);
    span.title = 'Rename this loop';
    span.addEventListener('click', (e) => {
      e.stopPropagation();
      this._editingId = loop.id;
      this._sync();
    });

    return span;
  }

  /** Inline text input replacing the name cell while it is being edited.
   *  Enter commits, Escape cancels, blur (losing focus, not closing the
   *  editor) commits. */
  private _buildNameInput(loop: SavedLoop): HTMLInputElement {
    const input = document.createElement('input');
    input.className = 'loop-row-name-input';
    input.type = 'text';
    input.maxLength = LOOP_NAME_MAX_LENGTH;
    input.value = loop.name ?? '';
    // Emptying the field returns the loop to its positional default.
    input.placeholder = this._game.loop.displayName(loop);
    input.title = 'Enter a name, Enter to save, Esc to cancel';

    let done = false; // blur+commit double-fire guard
    const commit = async (save: boolean): Promise<void> => {
      if (done || this._editingId !== loop.id) return;
      done = true;
      this._editingId = null;

      const name = save ? (input.value.trim().slice(0, LOOP_NAME_MAX_LENGTH) || null) : loop.name;

      if (save && name !== loop.name) {
        try {
          await updateLoop(loop.id, { name });
          this._game.setLoopProperties(loop.id, { name });
        } catch (e) {
          reportError('Failed to rename loop', e);
        }
      }

      this._sync();
    };

    input.addEventListener('keydown', (e) => {
      // Gameplay keys (Space/N/R/arrows) are document-level listeners —
      // keep typing from leaking into them.
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); void commit(true); }
      else if (e.key === 'Escape') { e.preventDefault(); void commit(false); }
    });
    input.addEventListener('blur', () => { void commit(true); });

    return input;
  }

  select(id: number | null): void {
    this.selectedId = id;
  }
}

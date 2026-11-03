import { reportError } from '../../utils/helpers.js';
import { DIFFICULTY_LEVELS, isDifficulty } from '../../game/difficulty.js';
import { getStoredUser, isAdmin } from '../../api/AuthApi.js';

/** Popup options meaning "re-estimate from the stored playable notes" —
 *  understood by the backend, not a Difficulty itself. */
const AUTO_OPTION = 'auto';

export interface DifficultySelectPopupCallbacks {
  onSave: (id: number, difficulty: string) => Promise<void>;
}

export interface DifficultySelectItem {
  id: number;
  difficulty: string;
  /** Owner userId (songs.imported_by_user_id); null for preloaded songs. */
  ownerId: number | null;
}

export class DifficultySelectPopup {
  private _popup: HTMLElement;
  private _optionsEl: HTMLElement;
  private _btnSave: HTMLButtonElement;
  private _btnCancel: HTMLButtonElement;
  private _currentId: number | null = null;
  private _selected: string = AUTO_OPTION;
  private _callbacks: DifficultySelectPopupCallbacks;

  constructor(callbacks: DifficultySelectPopupCallbacks) {
    this._callbacks = callbacks;
    this._popup = document.getElementById('difficulty-popup')!;
    this._optionsEl = document.getElementById('difficulty-options')!;
    this._btnSave = document.getElementById('btn-difficulty-save') as HTMLButtonElement;
    this._btnCancel = document.getElementById('btn-difficulty-cancel') as HTMLButtonElement;

    this._btnSave.addEventListener('click', () => this._save());
    this._btnCancel.addEventListener('click', () => this._hide());
    this._popup.addEventListener('click', (e) => {
      if (e.target === this._popup) this._hide();
    });
  }

  show(item: DifficultySelectItem): void {
    this._currentId = item.id;

    const me = getStoredUser();
    const isOwner = item.ownerId != null && item.ownerId === me?.id;
    this._ownerAutoAvailable = isOwner;
    this._adminCalculateAvailable = isAdmin() && !isOwner;

    // An unrecognised stored value (e.g. legacy free-form text) maps to
    // AUTO so a plain SAVE re-estimates and normalizes it.
    this._selected = isDifficulty(item.difficulty)
      ? item.difficulty
      : this._ownerAutoAvailable
        ? AUTO_OPTION
        : DIFFICULTY_LEVELS[0];
    this._renderOptions();
    this._popup.classList.remove('hidden');
  }

  private _ownerAutoAvailable = true;
  private _adminCalculateAvailable = false;

  private _renderOptions(): void {
    this._optionsEl.innerHTML = '';

    const options: Array<{ value: string; label: string; class: string }> = [];

    if (this._ownerAutoAvailable) {
      options.push({ value: AUTO_OPTION, label: 'AUTO', class: 'difficulty-auto' });
    }

    options.push(
      ...DIFFICULTY_LEVELS.map((level) => ({
        value: level,
        label: level,
        class: `difficulty-${level}`,
      })),
    );

    if (this._adminCalculateAvailable) {
      options.push({
        value: AUTO_OPTION,
        label: 'CALCULATE',
        class: 'difficulty-auto difficulty-admin',
      });
    }

    for (const option of options) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `pixel-chip ${option.class}${option.value === this._selected ? ' selected' : ''}`;
      btn.textContent = option.label;
      btn.addEventListener('click', () => {
        this._selected = option.value;
        this._optionsEl.querySelectorAll('.pixel-chip').forEach((el) => {
          el.classList.remove('selected');
        });
        btn.classList.add('selected');
      });
      this._optionsEl.appendChild(btn);
    }
  }

  private _hide(): void {
    this._popup.classList.add('hidden');
    this._currentId = null;
  }

  private async _save(): Promise<void> {
    if (this._currentId === null) return;
    const id = this._currentId;
    const difficulty = this._selected;

    try {
      await this._callbacks.onSave(id, difficulty);
    } catch (err) {
      reportError('Failed to update difficulty', err);
    }

    this._hide();
  }
}

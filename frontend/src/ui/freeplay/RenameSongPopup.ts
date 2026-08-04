import { reportError } from '../../utils/helpers.js';

export interface RenameSongPopupCallbacks {
  onSave: (id: number, title: string, subtitle: string) => Promise<void>;
}

export interface RenameSongItem {
  id: number;
  title: string;
  subtitle: string;
}

export class RenameSongPopup {
  private _popup: HTMLElement;
  private _titleInput: HTMLInputElement;
  private _subtitleInput: HTMLInputElement;
  private _btnSave: HTMLButtonElement;
  private _btnCancel: HTMLButtonElement;
  private _currentId: number | null = null;
  private _callbacks: RenameSongPopupCallbacks;

  constructor(callbacks: RenameSongPopupCallbacks) {
    this._callbacks = callbacks;
    this._popup = document.getElementById('rename-popup')!;
    this._titleInput = document.getElementById('rename-song-title') as HTMLInputElement;
    this._subtitleInput = document.getElementById('rename-song-artist') as HTMLInputElement;
    this._btnSave = document.getElementById('btn-rename-save') as HTMLButtonElement;
    this._btnCancel = document.getElementById('btn-rename-cancel') as HTMLButtonElement;

    this._btnSave.addEventListener('click', () => this._save());
    this._btnCancel.addEventListener('click', () => this._hide());
    this._popup.addEventListener('click', (e) => {
      if (e.target === this._popup) this._hide();
    });

    const handleEnter = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this._btnSave.click();
      }
    };
    this._titleInput.addEventListener('keydown', handleEnter);
    this._subtitleInput.addEventListener('keydown', handleEnter);
  }

  show(item: RenameSongItem): void {
    this._currentId = item.id;
    this._titleInput.value = item.title;
    this._subtitleInput.value = item.subtitle;
    this._popup.classList.remove('hidden');
    this._titleInput.focus();
    this._titleInput.select();
  }

  private _hide(): void {
    this._popup.classList.add('hidden');
    this._currentId = null;
  }

  private async _save(): Promise<void> {
    if (this._currentId === null) return;
    const title = this._titleInput.value.trim();

    if (!title) return;
    const subtitle = this._subtitleInput.value.trim();

    try {
      await this._callbacks.onSave(this._currentId, title, subtitle);
    } catch (err) {
      reportError('Rename failed', err);
    }

    this._hide();
  }
}

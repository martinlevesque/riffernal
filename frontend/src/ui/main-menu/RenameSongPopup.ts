export interface RenameSongPopupCallbacks {
  onSave: (id: number, title: string, subtitle: string) => Promise<void>;
}

export interface RenameSongItem {
  id: number;
  title: string;
  subtitle: string;
}

export class RenameSongPopup {
  private popup: HTMLElement;
  private titleInput: HTMLInputElement;
  private subtitleInput: HTMLInputElement;
  private btnSave: HTMLButtonElement;
  private btnCancel: HTMLButtonElement;
  private currentId: number | null = null;
  private callbacks: RenameSongPopupCallbacks;

  constructor(callbacks: RenameSongPopupCallbacks) {
    this.callbacks = callbacks;
    this.popup = document.getElementById('rename-popup')!;
    this.titleInput = document.getElementById('rename-song-title') as HTMLInputElement;
    this.subtitleInput = document.getElementById('rename-song-artist') as HTMLInputElement;
    this.btnSave = document.getElementById('btn-rename-save') as HTMLButtonElement;
    this.btnCancel = document.getElementById('btn-rename-cancel') as HTMLButtonElement;

    this.btnSave.addEventListener('click', () => this.save());
    this.btnCancel.addEventListener('click', () => this.hide());
    this.popup.addEventListener('click', (e) => {
      if (e.target === this.popup) this.hide();
    });

    const handleEnter = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.btnSave.click();
      }
    };
    this.titleInput.addEventListener('keydown', handleEnter);
    this.subtitleInput.addEventListener('keydown', handleEnter);
  }

  show(item: RenameSongItem): void {
    this.currentId = item.id;
    this.titleInput.value = item.title;
    this.subtitleInput.value = item.subtitle;
    this.popup.classList.remove('hidden');
    this.titleInput.focus();
    this.titleInput.select();
  }

  private hide(): void {
    this.popup.classList.add('hidden');
    this.currentId = null;
  }

  private async save(): Promise<void> {
    if (this.currentId === null) return;
    const title = this.titleInput.value.trim();

    if (!title) return;
    const subtitle = this.subtitleInput.value.trim();

    try {
      await this.callbacks.onSave(this.currentId, title, subtitle);
    } catch (err) {
      console.error('Rename failed:', err);
    }

    this.hide();
  }
}

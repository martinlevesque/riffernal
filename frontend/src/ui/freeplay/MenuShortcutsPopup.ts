import { fetchUserSettings, updateUserSettings } from '../../api/UserApi.js';
import { reportError } from '../../utils/helpers.js';
import {
  bindingId,
  formatBinding,
  getSongListKeys,
  normalizeBinding,
  resolveSongListKeys,
  setSongListKeys,
  type NoteBinding,
  type ShortcutAction,
} from './songListKeys.js';
import type { Menu } from './Menu.js';

const ACTIONS: Array<{ id: ShortcutAction; label: string }> = [
  { id: 'prev', label: 'Left — previous song' },
  { id: 'next', label: 'Right — next song' },
  { id: 'enter', label: 'Enter' },
];

/** Settings popup listing the song-list keyboard shortcuts. Clicking a row
 *  arms capture: piano notes played (MIDI or computer keyboard) accumulate
 *  into a chord while held; the binding is committed once all keys are
 *  released, and persisted to the user settings. */
export class MenuShortcutsPopup {
  private _popup: HTMLElement;
  private _listEl: HTMLElement;
  private _menu: Menu;
  private _listening: ShortcutAction | null = null;
  /** Last non-empty held-note set; survives until the commit note-off. */
  private _lastHeld: string[] | null = null;

  constructor(menu: Menu) {
    this._menu = menu;
    this._popup = document.getElementById('shortcuts-popup')!;
    this._listEl = document.getElementById('shortcut-list')!;

    document.getElementById('btn-menu-shortcuts')!.addEventListener('click', () => this._open());
    document.getElementById('btn-close-shortcuts')!.addEventListener('click', () => this._close());
    this._popup.addEventListener('click', (e) => {
      if (e.target === this._popup) this._close();
    });

    document.addEventListener('keydown', (e) => {
      if (!this._popup.classList.contains('hidden') && e.key === 'Escape') {
        e.preventDefault();
        this._close();
      }
    });

    this._hydrate();
  }

  private async _hydrate(): Promise<void> {
    try {
      setSongListKeys(resolveSongListKeys(await fetchUserSettings()));
    } catch (err) {
      reportError('Failed to load keyboard shortcuts', err);
    }
    this._render();
  }

  private _open(): void {
    this._render();
    this._popup.classList.remove('hidden');
  }

  private _close(): void {
    this._stopListening();
    this._popup.classList.add('hidden');
  }

  private _stopListening(): void {
    if (!this._listening) return;
    this._listening = null;
    this._menu.setNoteCapture(null);
    this._render();
  }

  private _startListening(action: ShortcutAction): void {
    this._listening = action;
    this._render();
    this._menu.setNoteCapture((notes) => this._onCapturedNotes(action, notes));
  }

  private _onCapturedNotes(action: ShortcutAction, held: string[]): void {
    // Live feedback while keys are held; the binding commits once every
    // key is released, so multi-key chords stay one capture.
    if (held.length > 0) {
      this._lastHeld = held;
      this._showHeld(held);
      return;
    }

    const binding = normalizeBinding(this._lastHeld ?? []);

    this._listening = null;
    this._menu.setNoteCapture(null);
    this._lastHeld = null;

    const conflict = this._findConflict(action, binding);

    if (conflict) {
      this._render();
      this._flashConflict(action);
      return;
    }

    if (binding) {
      setSongListKeys({ [action]: binding });
      this._render();

      // Settings merge is shallow, so the whole shortcuts object is re-sent.
      updateUserSettings({ keyboard_menu_shortcuts: { ...getSongListKeys() } }).catch((err) =>
        reportError('Failed to save shortcut', err),
      );
      return;
    }

    this._render();
  }

  private _showHeld(held: string[]): void {
    const idx = ACTIONS.findIndex((a) => a.id === this._listening);
    const keyEl = this._listEl.children[idx]?.querySelector('.shortcut-key');

    if (keyEl) keyEl.textContent = formatBinding(normalizeBinding(held));
  }

  private _findConflict(action: ShortcutAction, binding: NoteBinding): ShortcutAction | null {
    const id = bindingId(binding);

    for (const a of ACTIONS) {
      if (a.id !== action && bindingId(getSongListKeys()[a.id]) === id) return a.id;
    }

    return null;
  }

  private _flashConflict(action: ShortcutAction): void {
    const idx = ACTIONS.findIndex((a) => a.id === action);
    const keyEl = this._listEl.children[idx]?.querySelector('.shortcut-key');

    if (!keyEl) return;

    const original = keyEl.textContent;
    keyEl.textContent = 'Already bound';
    setTimeout(() => {
      keyEl.textContent = original;
    }, 1200);
  }

  private _render(): void {
    this._listEl.innerHTML = '';
    const keys = getSongListKeys();
    this._lastHeld = null;

    for (const action of ACTIONS) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `shortcut-row${this._listening === action.id ? ' listening' : ''}`;

      const label = document.createElement('span');
      label.textContent = action.label;

      const key = document.createElement('span');
      key.className = 'shortcut-key';
      key.textContent =
        this._listening === action.id ? 'Play key(s)…' : formatBinding(keys[action.id]);

      row.appendChild(label);
      row.appendChild(key);
      row.addEventListener('click', () => {
        if (this._listening === action.id) this._stopListening();
        else this._startListening(action.id);
      });
      this._listEl.appendChild(row);
    }
  }
}

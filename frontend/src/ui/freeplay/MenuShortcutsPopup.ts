import { fetchUserSettings, updateUserSettings } from "../../api/UserApi.js";
import { reportError } from "../../utils/helpers.js";
import { getSongListKeys, resolveSongListKeys, setSongListKeys, type SongListKeys } from "./songListKeys.js";
import type { Menu } from "./Menu.js";

type ShortcutAction = keyof SongListKeys;

const ACTIONS: Array<{ id: ShortcutAction; label: string }> = [
  { id: "prev", label: "Left — previous song" },
  { id: "next", label: "Right — next song" },
  { id: "enter", label: "Enter — start song" },
];

/** Settings popup listing the song-list keyboard shortcuts. Clicking a row
 *  arms capture: the next piano note played (MIDI or computer keyboard)
 *  becomes the binding and is persisted to the user settings. */
export class MenuShortcutsPopup {
  private _popup: HTMLElement;
  private _listEl: HTMLElement;
  private _menu: Menu;
  private _listening: ShortcutAction | null = null;

  constructor(menu: Menu) {
    this._menu = menu;
    this._popup = document.getElementById("shortcuts-popup")!;
    this._listEl = document.getElementById("shortcut-list")!;

    document.getElementById("btn-menu-shortcuts")!.addEventListener("click", () => this._open());
    document.getElementById("btn-close-shortcuts")!.addEventListener("click", () => this._close());
    this._popup.addEventListener("click", (e) => {
      if (e.target === this._popup) this._close();
    });

    document.addEventListener("keydown", (e) => {
      if (this._listening && e.key === "Escape") {
        e.preventDefault();
        this._stopListening();
      }
    });

    this._hydrate();
  }

  private async _hydrate(): Promise<void> {
    try {
      setSongListKeys(resolveSongListKeys(await fetchUserSettings()));
    } catch (err) {
      reportError("Failed to load keyboard shortcuts", err);
    }
    this._render();
  }

  private _open(): void {
    this._render();
    this._popup.classList.remove("hidden");
  }

  private _close(): void {
    this._stopListening();
    this._popup.classList.add("hidden");
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
    this._menu.setNoteCapture((note) => this._onCapturedNote(action, note));
  }

  private _onCapturedNote(action: ShortcutAction, note: string): void {
    this._listening = null;
    this._menu.setNoteCapture(null);

    const keys = getSongListKeys();
    const conflict = ACTIONS.some((a) => a.id !== action && keys[a.id] === note);

    if (conflict) {
      this._render();
      this._flashConflict(action);
      return;
    }

    setSongListKeys({ [action]: note });
    this._render();

    // Settings merge is shallow, so the whole shortcuts object is re-sent.
    updateUserSettings({ keyboard_menu_shortcuts: { ...getSongListKeys() } })
      .catch((err) => reportError("Failed to save shortcut", err));
  }

  private _flashConflict(action: ShortcutAction): void {
    const idx = ACTIONS.findIndex((a) => a.id === action);
    const keyEl = this._listEl.children[idx]?.querySelector(".shortcut-key");

    if (!keyEl) return;

    const original = keyEl.textContent;
    keyEl.textContent = "Already bound";
    setTimeout(() => { keyEl.textContent = original; }, 1200);
  }

  private _render(): void {
    this._listEl.innerHTML = "";
    const keys = getSongListKeys();

    for (const action of ACTIONS) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = `shortcut-row${this._listening === action.id ? " listening" : ""}`;

      const label = document.createElement("span");
      label.textContent = action.label;

      const key = document.createElement("span");
      key.className = "shortcut-key";
      key.textContent = this._listening === action.id ? "Play a key…" : (keys[action.id] ?? "—");

      row.appendChild(label);
      row.appendChild(key);
      row.addEventListener("click", () => {
        if (this._listening === action.id) this._stopListening();
        else this._startListening(action.id);
      });
      this._listEl.appendChild(row);
    }
  }
}

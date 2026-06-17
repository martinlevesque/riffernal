import { KEYBOARD_MAP } from '../utils/constants.js';
import type { NoteCallback } from '../types.js';

export class KeyboardInput {
  onNoteOn: NoteCallback | null = null;
  onNoteOff: NoteCallback | null = null;
  private pressedKeys = new Set<string>();
  enabled = true;
  private _handleKeyDown: (e: KeyboardEvent) => void;
  private _handleKeyUp: (e: KeyboardEvent) => void;

  constructor() {
    this._handleKeyDown = (e) => this._onKeyDown(e);
    this._handleKeyUp = (e) => this._onKeyUp(e);
  }

  start(): void {
    window.addEventListener('keydown', this._handleKeyDown);
    window.addEventListener('keyup', this._handleKeyUp);
  }

  stop(): void {
    window.removeEventListener('keydown', this._handleKeyDown);
    window.removeEventListener('keyup', this._handleKeyUp);
    this.pressedKeys.clear();
  }

  private _onKeyDown(e: KeyboardEvent): void {
    if (!this.enabled) return;
    if (e.repeat) return;

    const note = KEYBOARD_MAP[e.code];
    if (!note) return;

    e.preventDefault();
    if (this.pressedKeys.has(e.code)) return;
    this.pressedKeys.add(e.code);

    if (this.onNoteOn) this.onNoteOn(note, e.code);
  }

  private _onKeyUp(e: KeyboardEvent): void {
    if (!this.enabled) return;

    const note = KEYBOARD_MAP[e.code];
    if (!note) return;

    e.preventDefault();
    this.pressedKeys.delete(e.code);

    if (this.onNoteOff) this.onNoteOff(note, e.code);
  }
}

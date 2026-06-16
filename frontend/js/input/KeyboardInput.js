import { KEYBOARD_MAP } from '../utils/constants.js';

export class KeyboardInput {
  constructor() {
    this.onNoteOn = null;
    this.onNoteOff = null;
    this.pressedKeys = new Set();
    this.enabled = true;
    this._handleKeyDown = this._handleKeyDown.bind(this);
    this._handleKeyUp = this._handleKeyUp.bind(this);
  }

  start() {
    window.addEventListener('keydown', this._handleKeyDown);
    window.addEventListener('keyup', this._handleKeyUp);
  }

  stop() {
    window.removeEventListener('keydown', this._handleKeyDown);
    window.removeEventListener('keyup', this._handleKeyUp);
    this.pressedKeys.clear();
  }

  _handleKeyDown(e) {
    if (!this.enabled) return;
    if (e.repeat) return;

    const note = KEYBOARD_MAP[e.code];
    if (!note) return;

    e.preventDefault();
    if (this.pressedKeys.has(e.code)) return;
    this.pressedKeys.add(e.code);

    if (this.onNoteOn) this.onNoteOn(note, e.code);
  }

  _handleKeyUp(e) {
    if (!this.enabled) return;

    const note = KEYBOARD_MAP[e.code];
    if (!note) return;

    e.preventDefault();
    this.pressedKeys.delete(e.code);

    if (this.onNoteOff) this.onNoteOff(note, e.code);
  }
}

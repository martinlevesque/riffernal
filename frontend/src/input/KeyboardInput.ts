import { DEFAULT_KEYBOARD_VELOCITY, type NoteOnCallback, type NoteOffCallback } from './types.js';

export const KEYBOARD_MAP: Record<string, string> = {
  'KeyZ': 'C2',
  'Comma': 'C#2',
  'KeyX': 'D2',
  'Period': 'D#2',
  'KeyC': 'E2',
  'KeyV': 'F2',
  'Slash': 'F#2',
  'KeyB': 'G2',
  'Quote': 'G#2',
  'KeyN': 'A2',
  'KeyM': 'B2',
  'KeyA': 'C3',
  'KeyW': 'C#3',
  'KeyS': 'D3',
  'KeyE': 'D#3',
  'KeyD': 'E3',
  'KeyF': 'F3',
  'KeyT': 'F#3',
  'KeyG': 'G3',
  'KeyY': 'G#3',
  'KeyH': 'A3',
  'KeyU': 'A#3',
  'KeyJ': 'B3',
  'KeyK': 'C4',
  'KeyO': 'C#4',
  'KeyL': 'D4',
  'KeyP': 'D#4',
  'Semicolon': 'E4',
  'Digit1': 'C5',
  'Digit8': 'C#5',
  'Digit2': 'D5',
  'Digit9': 'D#5',
  'Digit3': 'E5',
  'Digit4': 'F5',
  'Digit0': 'F#5',
  'Digit5': 'G5',
  'Minus': 'G#5',
  'Digit6': 'A5',
  'Equal': 'A#5',
  'Digit7': 'B5',
};

const CODE_LABEL_OVERRIDES: Record<string, string> = {
  Comma: ',',
  Period: '.',
  Slash: '/',
  Quote: "'",
  Semicolon: ';',
  Minus: '-',
  Equal: '=',
};

export function keyCodeToLabel(code: string): string {
  const override = CODE_LABEL_OVERRIDES[code];
  if (override) return override;
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}

export const NOTE_TO_KEY_LABEL: Map<string, string> = new Map();
for (const [code, note] of Object.entries(KEYBOARD_MAP)) {
  NOTE_TO_KEY_LABEL.set(note, keyCodeToLabel(code));
}

export class KeyboardInput {
  onNoteOn: NoteOnCallback | null = null;
  onNoteOff: NoteOffCallback | null = null;
  private _pressedKeys = new Set<string>();
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
    this._pressedKeys.clear();
  }

  private _onKeyDown(e: KeyboardEvent): void {
    if (!this.enabled) return;
    if (e.repeat) return;

    const note = KEYBOARD_MAP[e.code];
    if (!note) return;

    e.preventDefault();
    if (this._pressedKeys.has(e.code)) return;
    this._pressedKeys.add(e.code);

    if (this.onNoteOn) this.onNoteOn(note, e.code, DEFAULT_KEYBOARD_VELOCITY);
  }

  private _onKeyUp(e: KeyboardEvent): void {
    if (!this.enabled) return;

    const note = KEYBOARD_MAP[e.code];
    if (!note) return;

    e.preventDefault();
    this._pressedKeys.delete(e.code);

    if (this.onNoteOff) this.onNoteOff(note, e.code);
  }
}

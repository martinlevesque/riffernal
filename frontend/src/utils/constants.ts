export const NOTE_NAMES: string[] = [
  'C2', 'C#2', 'D2', 'D#2', 'E2', 'F2', 'F#2', 'G2', 'G#2', 'A2', 'A#2', 'B2',
  'C3', 'C#3', 'D3', 'D#3', 'E3', 'F3', 'F#3', 'G3', 'G#3', 'A3', 'A#3', 'B3',
  'C4', 'C#4', 'D4', 'D#4', 'E4', 'F4', 'F#4', 'G4', 'G#4', 'A4', 'A#4', 'B4',
  'C5', 'C#5', 'D5', 'D#5', 'E5', 'F5', 'F#5', 'G5', 'G#5', 'A5', 'A#5', 'B5',
];

export const KEYS_PER_OCTAVE = 12;

export const WHITE_KEY_NOTES = ['C2', 'D2', 'E2', 'F2', 'G2', 'A2', 'B2', 'C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'B5'] as const;
export const BLACK_KEY_NOTES: (string | null)[] = ['C#2', 'D#2', null, 'F#2', 'G#2', 'A#2', null, 'C#3', 'D#3', null, 'F#3', 'G#3', 'A#3', null, 'C#4', 'D#4', null, 'F#4', 'G#4', 'A#4', null, 'C#5', 'D#5', null, 'F#5', 'G#5', 'A#5', null];

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

const BASE_NOTE_COLORS = [
  '#ff2244', '#ff4466', '#ff6622', '#ff8844', '#ffaa22', '#ffdd22',
  '#ddff22', '#22ff66', '#22ddaa', '#2288ff', '#4466ff', '#aa44ff',
];

export const NOTE_COLORS: Record<string, string> = Object.fromEntries(
  NOTE_NAMES.map((name, i) => [name, BASE_NOTE_COLORS[i % 12]])
);

export const TIMING = {
  PERFECT: 0.030,
  GREAT: 0.060,
  GOOD: 0.100,
} as const;

export const SCORE_VALUES = {
  PERFECT: 300,
  GREAT: 200,
  GOOD: 100,
  MISS: 0,
} as const;

export const FEEDBACK_COLORS: Record<string, string> = {
  PERFECT: '#ffdd22',
  GREAT: '#22ff66',
  GOOD: '#2288ff',
  MISS: '#ff2244',
};

export const SCROLL_SPEED = 400;

export const HIT_ZONE_Y_RATIO = 0.82;

export const PIANO_HEIGHT_RATIO = 0.12;

export const NOTE_WIDTH_RATIO = 0.07;

export const STAFF_LINE_SPACING = 12;
export const STAFF_TOP_MARGIN = 80;
export const STAFF_LEFT_MARGIN = 60;
export const STAFF_RIGHT_MARGIN = 30;

export const CLEF_TYPES = {
  BASS: 'bass',
  TREBLE: 'treble',
} as const;

export const BASS_STAFF_POSITIONS: Record<string, number> = {
  'C2': -3, 'C#2': -3, 'D2': -2, 'D#2': -2, 'E2': -1, 'F2': 0, 'F#2': 0,
  'G2': 1, 'G#2': 1, 'A2': 2, 'A#2': 2, 'B2': 3,
  'C3': 4, 'C#3': 4, 'D3': 5, 'D#3': 5, 'E3': 6, 'F3': 7, 'F#3': 7,
  'G3': 8, 'G#3': 8, 'A3': 9, 'A#3': 9, 'B3': 10,
};

export const TREBLE_STAFF_POSITIONS: Record<string, number> = {
  'C4': 1, 'C#4': 1, 'D4': 2, 'D#4': 2, 'E4': 3, 'F4': 4, 'F#4': 4,
  'G4': 5, 'G#4': 5, 'A4': 6, 'A#4': 6, 'B4': 7,
  'C5': 8, 'C#5': 8, 'D5': 9, 'D#5': 9, 'E5': 10, 'F5': 11, 'F#5': 11,
  'G5': 12, 'G#5': 12, 'A5': 13, 'A#5': 13, 'B5': 14,
};

export const NOTE_TO_CLEF: Record<string, string> = {
  'C2': CLEF_TYPES.BASS, 'C#2': CLEF_TYPES.BASS, 'D2': CLEF_TYPES.BASS, 'D#2': CLEF_TYPES.BASS,
  'E2': CLEF_TYPES.BASS, 'F2': CLEF_TYPES.BASS, 'F#2': CLEF_TYPES.BASS, 'G2': CLEF_TYPES.BASS,
  'G#2': CLEF_TYPES.BASS, 'A2': CLEF_TYPES.BASS, 'A#2': CLEF_TYPES.BASS, 'B2': CLEF_TYPES.BASS,
  'C3': CLEF_TYPES.BASS, 'C#3': CLEF_TYPES.BASS, 'D3': CLEF_TYPES.BASS, 'D#3': CLEF_TYPES.BASS,
  'E3': CLEF_TYPES.BASS, 'F3': CLEF_TYPES.BASS, 'F#3': CLEF_TYPES.BASS, 'G3': CLEF_TYPES.BASS,
  'G#3': CLEF_TYPES.BASS, 'A3': CLEF_TYPES.BASS, 'A#3': CLEF_TYPES.BASS, 'B3': CLEF_TYPES.BASS,
  'C4': CLEF_TYPES.TREBLE, 'C#4': CLEF_TYPES.TREBLE, 'D4': CLEF_TYPES.TREBLE, 'D#4': CLEF_TYPES.TREBLE,
  'E4': CLEF_TYPES.TREBLE, 'F4': CLEF_TYPES.TREBLE, 'F#4': CLEF_TYPES.TREBLE, 'G4': CLEF_TYPES.TREBLE,
  'G#4': CLEF_TYPES.TREBLE, 'A4': CLEF_TYPES.TREBLE, 'A#4': CLEF_TYPES.TREBLE, 'B4': CLEF_TYPES.TREBLE,
  'C5': CLEF_TYPES.TREBLE, 'C#5': CLEF_TYPES.TREBLE, 'D5': CLEF_TYPES.TREBLE, 'D#5': CLEF_TYPES.TREBLE,
  'E5': CLEF_TYPES.TREBLE, 'F5': CLEF_TYPES.TREBLE, 'F#5': CLEF_TYPES.TREBLE, 'G5': CLEF_TYPES.TREBLE,
  'G#5': CLEF_TYPES.TREBLE, 'A5': CLEF_TYPES.TREBLE, 'A#5': CLEF_TYPES.TREBLE, 'B5': CLEF_TYPES.TREBLE,
};

export const NOTE_DURATION_TYPES = {
  WHOLE: { minDuration: 1.5, flags: 0, filled: false },
  HALF: { minDuration: 0.75, flags: 0, filled: false },
  QUARTER: { minDuration: 0.375, flags: 0, filled: true },
  EIGHTH: { minDuration: 0.1875, flags: 1, filled: true },
  SIXTEENTH: { minDuration: 0, flags: 2, filled: true },
} as const;

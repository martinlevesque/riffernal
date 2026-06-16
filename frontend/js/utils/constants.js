export const NOTE_NAMES = [
  'C3', 'C#3', 'D3', 'D#3', 'E3', 'F3', 'F#3', 'G3', 'G#3', 'A3', 'A#3', 'B3',
  'C4', 'C#4', 'D4', 'D#4', 'E4', 'F4', 'F#4', 'G4', 'G#4', 'A4', 'A#4', 'B4',
];

export const KEYS_PER_OCTAVE = 12;

export const WHITE_KEY_NOTES = ['C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3', 'C4', 'D4', 'E4'];
export const BLACK_KEY_NOTES = ['C#3', 'D#3', null, 'F#3', 'G#3', 'A#3', null, 'C#4', 'D#4', null];

export const KEYBOARD_MAP = {
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
};

export const LANE_COLORS = [
  '#ff2244',
  '#ff6622',
  '#ffaa22',
  '#ffdd22',
  '#22ff66',
  '#22ddaa',
  '#2288ff',
  '#4466ff',
  '#aa44ff',
  '#ff44aa',
];

export const NOTE_COLORS = {
  'C3': '#ff2244',
  'C#3': '#ff4466',
  'D3': '#ff6622',
  'D#3': '#ff8844',
  'E3': '#ffaa22',
  'F3': '#ffdd22',
  'F#3': '#ddff22',
  'G3': '#22ff66',
  'G#3': '#22ddaa',
  'A3': '#2288ff',
  'A#3': '#4466ff',
  'B3': '#aa44ff',
  'C4': '#ff2244',
  'C#4': '#ff4466',
  'D4': '#ff6622',
  'D#4': '#ff8844',
  'E4': '#ffaa22',
};

export const TIMING = {
  PERFECT: 0.030,
  GREAT: 0.060,
  GOOD: 0.100,
};

export const SCORE_VALUES = {
  PERFECT: 300,
  GREAT: 200,
  GOOD: 100,
  MISS: 0,
};

export const FEEDBACK_COLORS = {
  PERFECT: '#ffdd22',
  GREAT: '#22ff66',
  GOOD: '#2288ff',
  MISS: '#ff2244',
};

export const SCROLL_SPEED = 400;

export const HIT_ZONE_Y_RATIO = 0.82;

export const PIANO_HEIGHT_RATIO = 0.12;

export const NOTE_WIDTH_RATIO = 0.07;

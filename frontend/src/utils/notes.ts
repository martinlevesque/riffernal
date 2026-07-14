export const NOTE_NAMES: string[] = [
  'A0', 'A#0', 'B0',
  'C1', 'C#1', 'D1', 'D#1', 'E1', 'F1', 'F#1', 'G1', 'G#1', 'A1', 'A#1', 'B1',
  'C2', 'C#2', 'D2', 'D#2', 'E2', 'F2', 'F#2', 'G2', 'G#2', 'A2', 'A#2', 'B2',
  'C3', 'C#3', 'D3', 'D#3', 'E3', 'F3', 'F#3', 'G3', 'G#3', 'A3', 'A#3', 'B3',
  'C4', 'C#4', 'D4', 'D#4', 'E4', 'F4', 'F#4', 'G4', 'G#4', 'A4', 'A#4', 'B4',
  'C5', 'C#5', 'D5', 'D#5', 'E5', 'F5', 'F#5', 'G5', 'G#5', 'A5', 'A#5', 'B5',
  'C6', 'C#6', 'D6', 'D#6', 'E6', 'F6', 'F#6', 'G6', 'G#6', 'A6', 'A#6', 'B6',
  'C7', 'C#7', 'D7', 'D#7', 'E7', 'F7', 'F#7', 'G7', 'G#7', 'A7', 'A#7', 'B7',
  'C8',
];

export const NOTE_TO_LANE: Map<string, number> = new Map(
  NOTE_NAMES.map((name, i) => [name, i])
);

const BASE_NOTE_COLORS = [
  '#ff2244', '#ff4466', '#ff6622', '#ff8844', '#ffaa22', '#ffdd22',
  '#ddff22', '#22ff66', '#22ddaa', '#2288ff', '#4466ff', '#aa44ff',
];

export const NOTE_COLORS: Record<string, string> = Object.fromEntries(
  NOTE_NAMES.map((name, i) => [name, BASE_NOTE_COLORS[i % 12]])
);

export const WHITE_KEY_COUNT = 52;
export const BLACK_KEY_WIDTH_RATIO = 0.6;

export enum HandSide {
  Left = 'left',
  Right = 'right',
}

export enum PracticeHand {
  Both = 'both',
  Left = 'left',
  Right = 'right',
}

export const HAND_SPLIT_MIDI = 59; // B3

/** GM standard: channel 10 (0-indexed) is percussion. */
export const GM_DRUM_CHANNEL = 9;

const LEFT_HAND_COLORS = ['#2288ff', '#4466ff', '#6644ff', '#8844ff', '#aa44ff', '#22ddaa'];
const RIGHT_HAND_COLORS = ['#ff2244', '#ff6622', '#ffaa22', '#ffdd22', '#ddff22', '#22ff66'];

const _chromaticMap: Record<string, number> = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };

const _handSideCache = new Map<string, HandSide>();

for (const name of NOTE_NAMES) {
  const match = name.match(/^([A-G]#?)(\d)$/);
  if (!match) { _handSideCache.set(name, HandSide.Right); continue; }
  const midi = _chromaticMap[match[1]] + (parseInt(match[2], 10) + 1) * 12;
  _handSideCache.set(name, midi <= HAND_SPLIT_MIDI ? HandSide.Left : HandSide.Right);
}

export function handForKey(noteKey: string): HandSide {
  return _handSideCache.get(noteKey) ?? HandSide.Right;
}

export const NOTE_SHORT_NAMES: Record<string, string> = Object.create(null);
for (const name of NOTE_NAMES) NOTE_SHORT_NAMES[name] = name.replace(/\d/g, '');

export const NOTE_NAMES_TO_PITCH_CLASS: Record<string, string> = Object.create(null);

for (const name of NOTE_NAMES) {
  NOTE_NAMES_TO_PITCH_CLASS[name] = name.replace(/\d/g, '');
}

const _LANE_TO_PITCH_CLASS: string[] = NOTE_NAMES.map((name) => name.replace(/\d/g, ''));

export function pitchClassForLane(lane: number): string {
  return _LANE_TO_PITCH_CLASS[lane] ?? '';
}

export function handColor(noteKey: string): string {
  const match = noteKey.match(/^([A-G]#?)(\d)$/);
  if (!match) return '#ffffff';
  const chromatic = _chromaticMap[match[1]];
  if (handForKey(noteKey) === HandSide.Left) {
    return LEFT_HAND_COLORS[chromatic % LEFT_HAND_COLORS.length];
  }
  return RIGHT_HAND_COLORS[chromatic % RIGHT_HAND_COLORS.length];
}

const WHITE_KEY_INDEX: Record<string, number> = {};
const BLACK_KEY_LEFT_WHITE: Record<string, number> = {};

{
  let whiteIdx = 0;
  for (const note of NOTE_NAMES) {
    if (note.includes('#')) {
      const naturalNote = note.replace('#', '');
      BLACK_KEY_LEFT_WHITE[note] = WHITE_KEY_INDEX[naturalNote];
    } else {
      WHITE_KEY_INDEX[note] = whiteIdx++;
    }
  }
}

export interface PianoKeyLayout {
  x: number;
  width: number;
  isBlack: boolean;
}

export interface VisibleRange {
  minNoteIdx: number;
  maxNoteIdx: number;
}

export function getVisibleRange(noteNames: string[]): VisibleRange | null {
  if (noteNames.length === 0) return null;
  let min = NOTE_NAMES.length;
  let max = -1;
  for (const name of noteNames) {
    const idx = NOTE_NAMES.indexOf(name);
    if (idx !== -1) {
      if (idx < min) min = idx;
      if (idx > max) max = idx;
    }
  }
  if (max === -1) return null;
  return { minNoteIdx: min, maxNoteIdx: max };
}

export function countWhiteKeysInRange(range: VisibleRange): number {
  let count = 0;
  for (let i = range.minNoteIdx; i <= range.maxNoteIdx; i++) {
    if (!NOTE_NAMES[i].includes('#')) count++;
  }
  return count;
}

function getMinWhiteKeyIdx(range: VisibleRange): number {
  for (let i = range.minNoteIdx; i <= range.maxNoteIdx; i++) {
    if (!NOTE_NAMES[i].includes('#')) return WHITE_KEY_INDEX[noteNameFromIdx(i)] ?? 0;
  }
  return 0;
}

function noteNameFromIdx(idx: number): string {
  return NOTE_NAMES[idx] ?? 'C4';
}

export function whiteKeyWidth(totalWidth: number, visibleRange?: VisibleRange | null): number {
  return visibleRange
    ? totalWidth / countWhiteKeysInRange(visibleRange)
    : totalWidth / WHITE_KEY_COUNT;
}

const _layoutCache = new Map<string, PianoKeyLayout>();
let _cachedWidth = -1;
let _cachedRangeKey = '';

export function getPianoKeyLayout(noteName: string, totalWidth: number, visibleRange?: VisibleRange | null): PianoKeyLayout {
  const rangeKey = visibleRange ? `${visibleRange.minNoteIdx}:${visibleRange.maxNoteIdx}` : '';
  if (totalWidth !== _cachedWidth || rangeKey !== _cachedRangeKey) {
    _layoutCache.clear();
    _cachedWidth = totalWidth;
    _cachedRangeKey = rangeKey;
  }

  const cacheKey = `${noteName}|${rangeKey}`;
  const cached = _layoutCache.get(cacheKey);
  if (cached) return cached;

  if (visibleRange) {
    const noteIdx = NOTE_NAMES.indexOf(noteName);
    const inRange = noteIdx >= visibleRange.minNoteIdx && noteIdx <= visibleRange.maxNoteIdx;
    if (!inRange) {
      const result: PianoKeyLayout = { x: -1000, width: 0, isBlack: noteName.includes('#') };
      _layoutCache.set(cacheKey, result);
      return result;
    }
    const visibleWhiteCount = countWhiteKeysInRange(visibleRange);
    const minWhiteIdx = getMinWhiteKeyIdx(visibleRange);
    const visibleKeyWidth = totalWidth / visibleWhiteCount;

    if (!noteName.includes('#')) {
      const idx = WHITE_KEY_INDEX[noteName] ?? 0;
      const result = { x: (idx - minWhiteIdx) * visibleKeyWidth, width: visibleKeyWidth, isBlack: false };
      _layoutCache.set(cacheKey, result);
      return result;
    } else {
      const naturalNote = noteName.replace('#', '');
      const leftIdx = WHITE_KEY_INDEX[naturalNote] ?? 0;
      const centerX = (leftIdx - minWhiteIdx + 0.5) * visibleKeyWidth;
      const blackKeyWidth = visibleKeyWidth * BLACK_KEY_WIDTH_RATIO;
      const result = { x: centerX - blackKeyWidth / 2, width: blackKeyWidth, isBlack: true };
      _layoutCache.set(cacheKey, result);
      return result;
    }
  }

  const whiteKeyWidth = totalWidth / WHITE_KEY_COUNT;
  const blackKeyWidth = whiteKeyWidth * BLACK_KEY_WIDTH_RATIO;

  let result: PianoKeyLayout;
  if (!noteName.includes('#')) {
    const idx = WHITE_KEY_INDEX[noteName] ?? 0;
    result = { x: idx * whiteKeyWidth, width: whiteKeyWidth, isBlack: false };
  } else {
    const leftIdx = BLACK_KEY_LEFT_WHITE[noteName] ?? 0;
    const centerX = (leftIdx + 0.5) * whiteKeyWidth;
    result = { x: centerX - blackKeyWidth / 2, width: blackKeyWidth, isBlack: true };
  }
  _layoutCache.set(cacheKey, result);
  return result;
}

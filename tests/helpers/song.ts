export interface NoteSpec {
  time: number;
  key: string;
  duration: number;
}

export interface SongData {
  title: string;
  artist: string;
  bpm: number;
  difficulty: string;
  notes: NoteSpec[];
  tracks?: { index: number; name: string; noteCount: number }[];
  selectedTrackIndices?: number[];
  trackHands?: Record<number, string>;
}

export function makeSong(notes: NoteSpec[], title = 'Test'): SongData {
  return { title, artist: 'Test', bpm: 120, difficulty: 'easy', notes };
}

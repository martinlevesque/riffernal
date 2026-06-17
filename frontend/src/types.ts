export interface Note {
  time: number;
  key: string;
  duration: number;
}

export interface SongNote extends Note {
  hit: boolean;
  missed: boolean;
  lane: number;
}

export interface ActiveNoteRender {
  lane: number;
  y: number;
  height: number;
  color: string;
  alpha: number;
  duration: number;
  key: string;
}

export interface Song {
  title: string;
  artist: string;
  bpm: number;
  difficulty: string;
  notes: Note[];
  imported?: boolean;
}

export interface HitResult {
  note: SongNote;
  result: 'PERFECT' | 'GREAT' | 'GOOD';
}

export interface Grade {
  grade: string;
  class: string;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number;
}

type GameState = 'menu' | 'playing' | 'results';
export type { GameState };

export type NoteCallback = (note: string, id: string) => void;
export type ConnectionChangeCallback = (connected: boolean, message: string) => void;

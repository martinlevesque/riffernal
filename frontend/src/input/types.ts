export const DEFAULT_KEYBOARD_VELOCITY = 100;

export type NoteOnCallback = (note: string, id: string, velocity: number) => void;
export type NoteOffCallback = (note: string, id: string) => void;
export type ConnectionChangeCallback = (connected: boolean, message: string) => void;

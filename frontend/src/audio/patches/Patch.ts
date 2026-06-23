export interface PatchNote {
  output: AudioNode;
  release(ctx: AudioContext, stopTime: number): void;
}

export interface Patch {
  name: string;
  build(ctx: AudioContext, freq: number, startTime: number, midi?: number): PatchNote;
}

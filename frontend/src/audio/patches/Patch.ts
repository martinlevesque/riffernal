export interface PatchNote {
  output: AudioNode;
  release(ctx: AudioContext, stopTime: number): void;
  /** ctx time when the voice is fully silent and can be dropped. Set only
   *  when the note was built with a known duration, i.e. its release is
   *  scheduled in the graph and no runtime release will follow; live presses
   *  release asynchronously via `release()` and stay unset. */
  endTime?: number;
}

export interface Patch {
  name: string;
  build(ctx: AudioContext, freq: number, startTime: number, midi?: number, duration?: number): PatchNote;
}

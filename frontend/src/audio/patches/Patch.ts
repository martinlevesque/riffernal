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
  /** `BaseAudioContext` so the same builders also render accompaniment
   *  buffers offline (OfflineAudioContext), not just live voices. */
  build(ctx: BaseAudioContext, freq: number, startTime: number, midi?: number, duration?: number): PatchNote;
  /** Reduced-cost voice of the same instrument, built for auto-played
   *  (background) voices so dense passages never alias a player's press;
   *  live presses always take the main `build`. */
  cheap?: Patch;
}

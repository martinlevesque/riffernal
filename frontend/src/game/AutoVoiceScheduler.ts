import type { Patch } from '../audio/patches/Patch.js';

export interface AutoVoiceEntry {
  /** Synth voice id (dedupes/steals by this key). */
  id: string;
  /** Note name as expected by Synth.noteOn. */
  noteName: string;
  midiOverride?: number;
  patch: Patch;
  /** Audio-clock start time (seconds) — fixed at enqueue, so a delayed
   *  build still lands the voice on time (Synth clamps late values). */
  when: number;
  /** Audible duration in real ms (already speed-adjusted). */
  durationMs: number;
}

export type AutoVoiceBuilder = (entry: AutoVoiceEntry) => void;

const MAX_BUILDS_PER_FRAME = 8;
const MIN_WINDOW_SEC = 0.001;

/** Queues ahead-of-time background voices and spreads their build cost
 *  across frames. A band-entry burst would otherwise build every voice's
 *  synth graph in the single frame that first crosses the schedule-ahead
 *  threshold — a multi-ms CPU spike that drops frames on slow machines.
 *  Each drain builds a proportional share: queue length scaled by
 *  frameDelta / time-until-earliest-voice, so a weak machine that renders
 *  at 30fps simply builds more per frame and still drains before voices
 *  are due. */
export class AutoVoiceScheduler {
  private _queue: AutoVoiceEntry[] = [];
  private _build: AutoVoiceBuilder;

  /** Built in the most recent drain (HUD diagnostic). */
  builtThisFrame = 0;
  /** Budget the most recent drain used (HUD diagnostic). */
  lastBudget = 0;

  constructor(build: AutoVoiceBuilder) {
    this._build = build;
  }

  get pending(): number {
    return this._queue.length;
  }

  enqueue(entry: AutoVoiceEntry): void {
    this._queue.push(entry);
  }

  /** Drops unbuilt voices (seek/restart: their `when` belongs to the old
   *  playback position; NoteManager resets `audioScheduled` so the notes
   *  re-enqueue in the new window). */
  clear(): void {
    this._queue.length = 0;
  }

  drain(audioNow: number, frameDeltaSec: number): void {
    this.builtThisFrame = 0;
    if (this._queue.length === 0) return;

    let earliest = Infinity;
    for (const entry of this._queue) {
      if (entry.when < earliest) earliest = entry.when;
    }
    const windowSec = Math.max(MIN_WINDOW_SEC, earliest - audioNow);

    const budget = Math.max(
      1,
      Math.min(MAX_BUILDS_PER_FRAME, Math.ceil(this._queue.length * frameDeltaSec / windowSec)),
    );
    this.lastBudget = budget;

    for (let i = 0; i < budget && this._queue.length > 0; i++) {
      this._build(this._queue.shift()!);
      this.builtThisFrame++;
    }
  }
}

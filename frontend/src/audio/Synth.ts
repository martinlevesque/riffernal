import { noteNameToMidi } from '../utils/helpers.js';
import { metalPatch } from './patches/metalPatch.js';
import type { Patch, PatchNote } from './patches/Patch.js';
import { hasUserGestured } from './userGesture.js';
import { isLowEndDevice } from '../utils/device.js';

const PRIO_FOREGROUND = 0;
const PRIO_BACKGROUND = 1;

interface ActiveNote {
  note: PatchNote;
  backgroundPrio: number;
}

export class Synth {
  private _ctx: AudioContext | null = null;
  private _masterGain: GainNode | null = null;
  private _compressor: DynamicsCompressorNode | null = null;
  private _activeNotes: Map<string, ActiveNote> = new Map();
  private _initialized = false;
  private _patch: Patch = metalPatch;
  private _bgCount = 0;
  // Bounded polyphony prevents runaway node counts when the audio thread
  // can't keep up. Background (auto-played) voices are evicted first.
  private _maxVoices = isLowEndDevice() ? 20 : 32;
  private _maxBackgroundVoices = isLowEndDevice() ? 12 : 24;

  init(): void {
    if (this._initialized) return;
    // biome-ignore lint/suspicious/noExplicitAny: vendor-prefixed AudioContext not in lib.dom types
    this._ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

    this._compressor = this._ctx.createDynamicsCompressor();
    this._compressor.threshold.value = -24;
    this._compressor.knee.value = 30;
    this._compressor.ratio.value = 12;
    this._compressor.attack.value = 0.003;
    this._compressor.release.value = 0.25;

    this._masterGain = this._ctx.createGain();
    this._masterGain.gain.value = 0.3;

    this._masterGain.connect(this._compressor);
    this._compressor.connect(this._ctx.destination);

    this._initialized = true;
  }

  resume(): void {
    if (this._ctx && this._ctx.state === 'suspended') {
      this._ctx.resume();
    }
  }

  /** Resolves true when audio is running or allowed to start, false if the
   *  browser still blocks it (no mouse key, keyboard key or touch since the
   *  page loaded). */
  async tryResume(timeoutMs = 500): Promise<boolean> {
    this.init();

    const ctx = this._ctx!;

    if (ctx.state === 'running') return true;

    const resumed = ctx.resume().catch((err) => console.error(err));

    // The context can take a while to report "running" after a gesture, so a
    // slow start must not be mistaken for a block.
    if (hasUserGestured()) return true;

    await Promise.race([resumed, new Promise((resolve) => setTimeout(resolve, timeoutMs))]);

    return (ctx.state as AudioContextState) === 'running';
  }

  setPatch(patch: Patch): void {
    this._patch = patch;
  }

  getPatch(): Patch {
    return this._patch;
  }

  noteOn(noteName: string, patch?: Patch, id?: string, midiOverride?: number): void {
    this.init();
    this.resume();

    const key = id ?? noteName;
    if (this._activeNotes.has(key)) {
      this.noteOff(key);
    }

    const noteMidi = noteNameToMidi(noteName);
    if (noteMidi < 0) return;

    const isBackground = key.startsWith('auto_');
    const prio = isBackground ? PRIO_BACKGROUND : PRIO_FOREGROUND;

    if (isBackground && this._bgCount >= this._maxBackgroundVoices) {
      this._stealOldestBackground();
    } else if (this._activeNotes.size >= this._maxVoices) {
      if (!this._stealOldestBackground()) {
        this._stealOldestAny();
      }
    }

    const freq = 440 * 2 ** ((noteMidi - 69) / 12);
    const midi = midiOverride ?? noteMidi;
    const now = this._ctx!.currentTime;

    const activePatch = patch ?? this._patch;
    const patchNote = activePatch.build(this._ctx!, freq, now, midi);
    patchNote.output.connect(this._masterGain!);
    this._activeNotes.set(key, { note: patchNote, backgroundPrio: prio });
    if (prio === PRIO_BACKGROUND) this._bgCount++;
  }

  /** Release and remove the oldest background voice. Returns true on success. */
  private _stealOldestBackground(): boolean {
    for (const [k, v] of this._activeNotes) {
      if (v.backgroundPrio !== PRIO_BACKGROUND) continue;
      const now = this._ctx!.currentTime;
      v.note.release(this._ctx!, now);
      this._activeNotes.delete(k);
      this._bgCount--;
      return true;
    }
    return false;
  }

  /** Release and remove the oldest voice of any kind. */
  private _stealOldestAny(): boolean {
    const key = this._activeNotes.keys().next().value;
    if (key === undefined) return false;
    const v = this._activeNotes.get(key);
    if (!v) return false;
    const now = this._ctx!.currentTime;
    v.note.release(this._ctx!, now);
    this._activeNotes.delete(key);
    if (v.backgroundPrio === PRIO_BACKGROUND) this._bgCount--;
    return true;
  }

  noteOff(noteName: string): void {
    const active = this._activeNotes.get(noteName);
    if (!active) return;

    const now = this._ctx!.currentTime;
    active.note.release(this._ctx!, now);
    this._activeNotes.delete(noteName);
    if (active.backgroundPrio === PRIO_BACKGROUND) this._bgCount--;
  }

  releaseAll(): void {
    for (const noteName of this._activeNotes.keys()) {
      this.noteOff(noteName);
    }
  }

  setVolume(value: number): void {
    if (this._masterGain) {
      this._masterGain.gain.value = value;
    }
  }
}

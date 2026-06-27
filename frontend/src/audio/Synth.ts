import { noteNameToMidi } from '../utils/helpers.js';
import { metalPatch } from './patches/metalPatch.js';
import type { Patch, PatchNote } from './patches/Patch.js';
import { isLowEndDevice } from '../utils/device.js';

const PRIO_FOREGROUND = 0;
const PRIO_BACKGROUND = 1;

interface ActiveNote {
  note: PatchNote;
  backgroundPrio: number;
}

export class Synth {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private activeNotes: Map<string, ActiveNote> = new Map();
  private initialized = false;
  private patch: Patch = metalPatch;
  private _bgCount = 0;
  // Bounded polyphony prevents runaway node counts when the audio thread
  // can't keep up. Background (auto-played) voices are evicted first.
  private maxVoices = isLowEndDevice() ? 20 : 32;
  private maxBackgroundVoices = isLowEndDevice() ? 12 : 24;

  init(): void {
    if (this.initialized) return;
    // biome-ignore lint/suspicious/noExplicitAny: vendor-prefixed AudioContext not in lib.dom types
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -24;
    this.compressor.knee.value = 30;
    this.compressor.ratio.value = 12;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.25;

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.3;

    this.masterGain.connect(this.compressor);
    this.compressor.connect(this.ctx.destination);

    this.initialized = true;
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setPatch(patch: Patch): void {
    this.patch = patch;
  }

  getPatch(): Patch {
    return this.patch;
  }

  noteOn(noteName: string, patch?: Patch, id?: string, midiOverride?: number): void {
    this.init();
    this.resume();

    const key = id ?? noteName;
    if (this.activeNotes.has(key)) {
      this.noteOff(key);
    }

    const isBackground = key.startsWith('auto_');
    const prio = isBackground ? PRIO_BACKGROUND : PRIO_FOREGROUND;

    if (isBackground && this._bgCount >= this.maxBackgroundVoices) {
      this._stealOldestBackground();
    } else if (this.activeNotes.size >= this.maxVoices) {
      if (!this._stealOldestBackground()) {
        this._stealOldestAny();
      }
    }

    const noteMidi = noteNameToMidi(noteName);
    if (noteMidi < 0) return;
    const freq = 440 * 2 ** ((noteMidi - 69) / 12);
    const midi = midiOverride ?? noteMidi;
    const now = this.ctx!.currentTime;

    const activePatch = patch ?? this.patch;
    const patchNote = activePatch.build(this.ctx!, freq, now, midi);
    patchNote.output.connect(this.masterGain!);
    this.activeNotes.set(key, { note: patchNote, backgroundPrio: prio });
    if (prio === PRIO_BACKGROUND) this._bgCount++;
  }

  /** Release and remove the oldest background voice. Returns true on success. */
  private _stealOldestBackground(): boolean {
    for (const [k, v] of this.activeNotes) {
      if (v.backgroundPrio !== PRIO_BACKGROUND) continue;
      const now = this.ctx!.currentTime;
      v.note.release(this.ctx!, now);
      this.activeNotes.delete(k);
      this._bgCount--;
      return true;
    }
    return false;
  }

  /** Release and remove the oldest voice of any kind. */
  private _stealOldestAny(): boolean {
    const key = this.activeNotes.keys().next().value;
    if (key === undefined) return false;
    const v = this.activeNotes.get(key);
    if (!v) return false;
    const now = this.ctx!.currentTime;
    v.note.release(this.ctx!, now);
    this.activeNotes.delete(key);
    if (v.backgroundPrio === PRIO_BACKGROUND) this._bgCount--;
    return true;
  }

  noteOff(noteName: string): void {
    const active = this.activeNotes.get(noteName);
    if (!active) return;

    const now = this.ctx!.currentTime;
    active.note.release(this.ctx!, now);
    this.activeNotes.delete(noteName);
    if (active.backgroundPrio === PRIO_BACKGROUND) this._bgCount--;
  }

  releaseAll(): void {
    for (const noteName of this.activeNotes.keys()) {
      this.noteOff(noteName);
    }
  }

  setVolume(value: number): void {
    if (this.masterGain) {
      this.masterGain.gain.value = value;
    }
  }
}

import { noteNameToMidi } from '../utils/helpers.js';
import { metalPatch } from './patches/metalPatch.js';
import type { Patch, PatchNote } from './patches/Patch.js';

interface ActiveNote {
  note: PatchNote;
}

export class Synth {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private activeNotes: Map<string, ActiveNote> = new Map();
  private initialized = false;
  private patch: Patch = metalPatch;

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

    const noteMidi = noteNameToMidi(noteName);
    if (noteMidi < 0) return;
    const freq = 440 * 2 ** ((noteMidi - 69) / 12);
    const midi = midiOverride ?? noteMidi;
    const now = this.ctx!.currentTime;

    const activePatch = patch ?? this.patch;
    const patchNote = activePatch.build(this.ctx!, freq, now, midi);
    patchNote.output.connect(this.masterGain!);
    this.activeNotes.set(key, { note: patchNote });
  }

  noteOff(noteName: string): void {
    const active = this.activeNotes.get(noteName);
    if (!active) return;

    const now = this.ctx!.currentTime;
    active.note.release(this.ctx!, now);
    this.activeNotes.delete(noteName);
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

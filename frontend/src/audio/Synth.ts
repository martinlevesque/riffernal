import { noteNameToMidi } from '../utils/helpers.js';

interface ActiveNote {
  osc1: OscillatorNode;
  osc2: OscillatorNode;
  osc3: OscillatorNode;
  gainNode: GainNode;
}

export class Synth {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private activeNotes: Map<string, ActiveNote> = new Map();
  private initialized = false;

  init(): void {
    if (this.initialized) return;
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

  noteOn(noteName: string): void {
    this.init();
    this.resume();

    if (this.activeNotes.has(noteName)) {
      this.noteOff(noteName);
    }

    const midi = noteNameToMidi(noteName);
    if (midi < 0) return;
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const now = this.ctx!.currentTime;

    const osc1 = this.ctx!.createOscillator();
    const osc2 = this.ctx!.createOscillator();
    const osc3 = this.ctx!.createOscillator();
    const gainNode = this.ctx!.createGain();

    osc1.type = 'triangle';
    osc1.frequency.value = freq;

    osc2.type = 'sine';
    osc2.frequency.value = freq * 2;

    osc3.type = 'sine';
    osc3.frequency.value = freq * 3;

    const gain1 = this.ctx!.createGain();
    const gain2 = this.ctx!.createGain();
    const gain3 = this.ctx!.createGain();
    gain1.gain.value = 0.6;
    gain2.gain.value = 0.2;
    gain3.gain.value = 0.05;

    osc1.connect(gain1);
    osc2.connect(gain2);
    osc3.connect(gain3);
    gain1.connect(gainNode);
    gain2.connect(gainNode);
    gain3.connect(gainNode);

    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(1, now + 0.005);
    gainNode.gain.exponentialRampToValueAtTime(0.5, now + 0.1);
    gainNode.gain.exponentialRampToValueAtTime(0.2, now + 0.5);

    gainNode.connect(this.masterGain!);

    osc1.start(now);
    osc2.start(now);
    osc3.start(now);

    this.activeNotes.set(noteName, { osc1, osc2, osc3, gainNode });
  }

  noteOff(noteName: string): void {
    const note = this.activeNotes.get(noteName);
    if (!note) return;

    const now = this.ctx!.currentTime;
    note.gainNode.gain.cancelScheduledValues(now);
    note.gainNode.gain.setValueAtTime(note.gainNode.gain.value, now);
    note.gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    const { osc1, osc2, osc3 } = note;
    osc1.stop(now + 0.2);
    osc2.stop(now + 0.2);
    osc3.stop(now + 0.2);

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

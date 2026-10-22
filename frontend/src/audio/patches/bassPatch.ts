import type { Patch, PatchNote } from './Patch.js';
import { applyEnvelope, applyEnvelopeWithRelease, type EnvelopePoint } from './shared.js';

const RELEASE_LEN = 0.15;
const STOP_TAIL = 0.2;

// Envelope aligned with metalPatch for consistent perceived timing
const ENVELOPE: EnvelopePoint[] = [
  { at: 0, to: 0, type: 'set' },
  { at: 0.002, to: 0.9, type: 'lin' },
  { at: 0.08, to: 0.6, type: 'exp' },
  { at: 0.4, to: 0.35, type: 'exp' },
];

export const bassPatch: Patch = {
  name: 'Bass',
  build(ctx, freq, startTime, _midi, duration) {
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();
    const filterNode = ctx.createBiquadFilter();

    osc1.type = 'sawtooth';
    osc1.frequency.value = freq;

    osc2.type = 'square';
    osc2.frequency.value = freq;
    osc2.detune.value = 5;

    const gain1 = ctx.createGain();
    const gain2 = ctx.createGain();
    gain1.gain.value = 0.5;
    gain2.gain.value = 0.3;

    filterNode.type = 'lowpass';
    filterNode.Q.value = 4;
    filterNode.frequency.setValueAtTime(1500, startTime);
    filterNode.frequency.exponentialRampToValueAtTime(600, startTime + 0.4);

    osc1.connect(gain1);
    osc2.connect(gain2);
    gain1.connect(filterNode);
    gain2.connect(filterNode);
    filterNode.connect(gainNode);

    osc1.start(startTime);
    osc2.start(startTime);

    const patchNote: PatchNote = {
      output: gainNode,
      release(_ctx: AudioContext, stopTime: number) {
        gainNode.gain.cancelScheduledValues(stopTime);
        gainNode.gain.setValueAtTime(gainNode.gain.value, stopTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, stopTime + RELEASE_LEN);
        osc1.stop(stopTime + STOP_TAIL);
        osc2.stop(stopTime + STOP_TAIL);
      },
    };

    if (duration === undefined) {
      applyEnvelope(gainNode.gain, startTime, ENVELOPE);
    } else {
      const silentAt = applyEnvelopeWithRelease(gainNode.gain, startTime, ENVELOPE, duration, RELEASE_LEN);
      const stopAt = silentAt + STOP_TAIL;
      osc1.stop(stopAt);
      osc2.stop(stopAt);
      patchNote.endTime = stopAt;
    }

    return patchNote;
  },
};

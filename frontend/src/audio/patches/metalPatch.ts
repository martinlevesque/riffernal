import type { Patch, PatchNote } from './Patch.js';
import { applyEnvelope, applyEnvelopeWithRelease, type EnvelopePoint } from './shared.js';

const RELEASE_LEN = 0.15;
const STOP_TAIL = 0.2;

const ENVELOPE: EnvelopePoint[] = [
  { at: 0, to: 0, type: 'set' },
  { at: 0.002, to: 1, type: 'lin' },
  { at: 0.08, to: 0.6, type: 'exp' },
  { at: 0.4, to: 0.35, type: 'exp' },
];

export const metalPatch: Patch = {
  name: 'Metal',
  build(ctx, freq, startTime, _midi, duration) {
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const osc3 = ctx.createOscillator();
    const gainNode = ctx.createGain();
    const filterNode = ctx.createBiquadFilter();

    osc1.type = 'sawtooth';
    osc1.frequency.value = freq;
    osc1.detune.value = -8;

    osc2.type = 'sawtooth';
    osc2.frequency.value = freq;
    osc2.detune.value = 8;

    osc3.type = 'square';
    osc3.frequency.value = freq * 2;

    const gain1 = ctx.createGain();
    const gain2 = ctx.createGain();
    const gain3 = ctx.createGain();
    gain1.gain.value = 0.45;
    gain2.gain.value = 0.45;
    gain3.gain.value = 0.15;

    filterNode.type = 'lowpass';
    filterNode.Q.value = 6;
    filterNode.frequency.setValueAtTime(4000, startTime);
    filterNode.frequency.exponentialRampToValueAtTime(2500, startTime + 0.4);

    osc1.connect(gain1);
    osc2.connect(gain2);
    osc3.connect(gain3);
    gain1.connect(filterNode);
    gain2.connect(filterNode);
    gain3.connect(filterNode);
    filterNode.connect(gainNode);

    osc1.start(startTime);
    osc2.start(startTime);
    osc3.start(startTime);

    const patchNote: PatchNote = {
      output: gainNode,
      release(_ctx, stopTime) {
        gainNode.gain.cancelScheduledValues(stopTime);
        gainNode.gain.setValueAtTime(gainNode.gain.value, stopTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, stopTime + RELEASE_LEN);
        osc1.stop(stopTime + STOP_TAIL);
        osc2.stop(stopTime + STOP_TAIL);
        osc3.stop(stopTime + STOP_TAIL);
      },
    };

    if (duration === undefined) {
      applyEnvelope(gainNode.gain, startTime, ENVELOPE);
    } else {
      const silentAt = applyEnvelopeWithRelease(gainNode.gain, startTime, ENVELOPE, duration, RELEASE_LEN);
      const stopAt = silentAt + STOP_TAIL;
      osc1.stop(stopAt);
      osc2.stop(stopAt);
      osc3.stop(stopAt);
      patchNote.endTime = stopAt;
    }

    return patchNote;
  },
};

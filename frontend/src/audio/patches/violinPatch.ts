import type { Patch, PatchNote } from './Patch.js';
import { applyEnvelope, applyEnvelopeWithRelease, type EnvelopePoint } from './shared.js';

const RELEASE_LEN = 0.25;
const STOP_TAIL = 0.3;

// Bowed string envelope: quick initial transient for sync, then sustained
// (a real violin sustains at near-constant amplitude while bowing)
const ENVELOPE: EnvelopePoint[] = [
  { at: 0, to: 0, type: 'set' },
  { at: 0.005, to: 0.5, type: 'lin' },
  { at: 0.035, to: 0.85, type: 'lin' },
  { at: 0.15, to: 0.75, type: 'exp' },
];

export const violinPatch: Patch = {
  name: 'Violin',
  build(ctx, freq, startTime, _midi, duration) {
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const osc3 = ctx.createOscillator();
    const gainNode = ctx.createGain();
    const highpassNode = ctx.createBiquadFilter();
    const lowpassNode = ctx.createBiquadFilter();
    const formant1 = ctx.createBiquadFilter();
    const formant2 = ctx.createBiquadFilter();
    const formant3 = ctx.createBiquadFilter();

    // Vibrato LFO — ramps in shortly after bow attack
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();

    osc1.type = 'sawtooth';
    osc1.frequency.value = freq;
    osc1.detune.value = -5;

    osc2.type = 'sawtooth';
    osc2.frequency.value = freq;
    osc2.detune.value = 5;

    osc3.type = 'triangle';
    osc3.frequency.value = freq;
    osc3.detune.value = 2;

    lfo.type = 'sine';
    lfo.frequency.value = 5.5;
    lfoGain.gain.setValueAtTime(0, startTime);
    lfoGain.gain.linearRampToValueAtTime(12, startTime + 0.1);
    lfo.connect(lfoGain);
    lfoGain.connect(osc1.detune);
    lfoGain.connect(osc2.detune);
    lfoGain.connect(osc3.detune);

    const gain1 = ctx.createGain();
    const gain2 = ctx.createGain();
    const gain3 = ctx.createGain();
    gain1.gain.value = 0.4;
    gain2.gain.value = 0.4;
    gain3.gain.value = 0.2;

    // Highpass to remove low rumble (violin body doesn't produce much below ~200Hz)
    highpassNode.type = 'highpass';
    highpassNode.frequency.value = 180;
    highpassNode.Q.value = 0.7;

    // Violin body formant resonance peaks
    formant1.type = 'peaking';
    formant1.frequency.value = 285;
    formant1.Q.value = 5;
    formant1.gain.value = 8;

    formant2.type = 'peaking';
    formant2.frequency.value = 920;
    formant2.Q.value = 6;
    formant2.gain.value = 6;

    formant3.type = 'peaking';
    formant3.frequency.value = 2800;
    formant3.Q.value = 8;
    formant3.gain.value = 5;

    // Gentle lowpass to tame harsh harmonics
    lowpassNode.type = 'lowpass';
    lowpassNode.Q.value = 0.5;
    lowpassNode.frequency.value = 6000;

    osc1.connect(gain1);
    osc2.connect(gain2);
    osc3.connect(gain3);
    gain1.connect(highpassNode);
    gain2.connect(highpassNode);
    gain3.connect(highpassNode);
    highpassNode.connect(formant1);
    formant1.connect(formant2);
    formant2.connect(formant3);
    formant3.connect(lowpassNode);
    lowpassNode.connect(gainNode);

    osc1.start(startTime);
    osc2.start(startTime);
    osc3.start(startTime);
    lfo.start(startTime);

    const patchNote: PatchNote = {
      output: gainNode,
      release(_ctx, stopTime) {
        gainNode.gain.cancelScheduledValues(stopTime);
        gainNode.gain.setValueAtTime(gainNode.gain.value, stopTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, stopTime + RELEASE_LEN);
        osc1.stop(stopTime + STOP_TAIL);
        osc2.stop(stopTime + STOP_TAIL);
        osc3.stop(stopTime + STOP_TAIL);
        lfo.stop(stopTime + STOP_TAIL);
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
      lfo.stop(stopAt);
      patchNote.endTime = stopAt;
    }

    return patchNote;
  },
};

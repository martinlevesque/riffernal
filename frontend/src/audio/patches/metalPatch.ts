import type { Patch } from './Patch.js';
import { cleanupOnEnded } from './shared.js';

export const metalPatch: Patch = {
  name: 'Metal',
  build(ctx, freq, startTime) {
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

    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(1, startTime + 0.002);
    gainNode.gain.exponentialRampToValueAtTime(0.6, startTime + 0.08);
    gainNode.gain.exponentialRampToValueAtTime(0.35, startTime + 0.4);

    osc1.start(startTime);
    osc2.start(startTime);
    osc3.start(startTime);
    cleanupOnEnded([osc1, osc2, osc3], [osc1, osc2, osc3, gain1, gain2, gain3, filterNode, gainNode]);

    return {
      output: gainNode,
      release(_ctx, stopTime) {
        gainNode.gain.cancelScheduledValues(stopTime);
        gainNode.gain.setValueAtTime(gainNode.gain.value, stopTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, stopTime + 0.15);
        osc1.stop(stopTime + 0.2);
        osc2.stop(stopTime + 0.2);
        osc3.stop(stopTime + 0.2);
      },
    };
  },
};

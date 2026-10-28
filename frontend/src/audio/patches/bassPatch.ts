import type { Patch } from './Patch.js';
import { cleanupOnEnded } from './shared.js';

export const bassPatch: Patch = {
  name: 'Bass',
  build(ctx, freq, startTime) {
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

    // Envelope aligned with metalPatch for consistent perceived timing
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(0.9, startTime + 0.002);
    gainNode.gain.exponentialRampToValueAtTime(0.6, startTime + 0.08);
    gainNode.gain.exponentialRampToValueAtTime(0.35, startTime + 0.4);

    osc1.start(startTime);
    osc2.start(startTime);
    cleanupOnEnded([osc1, osc2], [osc1, osc2, gain1, gain2, filterNode, gainNode]);

    return {
      output: gainNode,
      release(_ctx: AudioContext, stopTime: number) {
        gainNode.gain.cancelScheduledValues(stopTime);
        gainNode.gain.setValueAtTime(gainNode.gain.value, stopTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, stopTime + 0.15);
        osc1.stop(stopTime + 0.2);
        osc2.stop(stopTime + 0.2);
      },
    };
  },
};

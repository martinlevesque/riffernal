import type { Patch } from './Patch.js';
import { getDistortionCurve } from './shared.js';

function buildGuitar(ctx: AudioContext, freq: number, startTime: number, distortion: number): { output: GainNode; release: (ctx: AudioContext, stopTime: number) => void } {
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const gainNode = ctx.createGain();
  const filterNode = ctx.createBiquadFilter();
  const distortionNode = ctx.createWaveShaper();

  osc1.type = 'sawtooth';
  osc1.frequency.value = freq;
  osc1.detune.value = -7;

  osc2.type = 'sawtooth';
  osc2.frequency.value = freq;
  osc2.detune.value = 7;

  const gain1 = ctx.createGain();
  const gain2 = ctx.createGain();
  gain1.gain.value = 0.45;
  gain2.gain.value = 0.45;

  distortionNode.curve = getDistortionCurve(distortion);
  distortionNode.oversample = '2x';

  // Filter: start bright, settle to mid-range (aligned with metalPatch character)
  const filterStart = Math.min(5000, 3000 + distortion * 200);
  filterNode.type = 'lowpass';
  filterNode.Q.value = 4;
  filterNode.frequency.setValueAtTime(filterStart, startTime);
  filterNode.frequency.exponentialRampToValueAtTime(2500, startTime + 0.4);

  osc1.connect(gain1);
  osc2.connect(gain2);
  gain1.connect(distortionNode);
  gain2.connect(distortionNode);
  distortionNode.connect(filterNode);
  filterNode.connect(gainNode);

  // Envelope aligned with metalPatch for consistent perceived timing
  gainNode.gain.setValueAtTime(0, startTime);
  gainNode.gain.linearRampToValueAtTime(0.9, startTime + 0.002);
  gainNode.gain.exponentialRampToValueAtTime(0.6, startTime + 0.08);
  gainNode.gain.exponentialRampToValueAtTime(0.35, startTime + 0.4);

  osc1.start(startTime);
  osc2.start(startTime);

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
}

export const guitarCleanPatch: Patch = {
  name: 'Guitar Clean',
  build(ctx, freq, startTime) {
    return buildGuitar(ctx, freq, startTime, 0.5);
  },
};

export const guitarOverdrivenPatch: Patch = {
  name: 'Guitar Overdriven',
  build(ctx, freq, startTime) {
    return buildGuitar(ctx, freq, startTime, 4);
  },
};

export const guitarDistortionPatch: Patch = {
  name: 'Guitar Distortion',
  build(ctx, freq, startTime) {
    return buildGuitar(ctx, freq, startTime, 12);
  },
};

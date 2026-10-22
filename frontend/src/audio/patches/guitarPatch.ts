import type { Patch, PatchNote } from './Patch.js';
import { applyEnvelope, applyEnvelopeWithRelease, type EnvelopePoint } from './shared.js';
import { getDistortionCurve } from './shared.js';
import { isLowEndDevice } from '../../utils/device.js';

const RELEASE_LEN = 0.15;
const STOP_TAIL = 0.2;

// Envelope aligned with metalPatch for consistent perceived timing
const ENVELOPE: EnvelopePoint[] = [
  { at: 0, to: 0, type: 'set' },
  { at: 0.002, to: 0.9, type: 'lin' },
  { at: 0.08, to: 0.6, type: 'exp' },
  { at: 0.4, to: 0.35, type: 'exp' },
];

function buildGuitar(
  ctx: BaseAudioContext,
  freq: number,
  startTime: number,
  distortion: number,
  duration?: number,
  cheap = false,
): PatchNote {
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
  // '2x' is the most expensive node on the audio render thread; background
  // voices never earn it (live presses keep full quality).
  distortionNode.oversample = cheap || isLowEndDevice() ? 'none' : '2x';

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
}

function cheapVariant(name: string, distortion: number): Patch {
  return {
    name,
    build(ctx, freq, startTime, _midi, duration) {
      return buildGuitar(ctx, freq, startTime, distortion, duration, true);
    },
  };
}

export const guitarCleanPatch: Patch = {
  name: 'Guitar Clean',
  build(ctx, freq, startTime, _midi, duration) {
    return buildGuitar(ctx, freq, startTime, 0.5, duration);
  },
  cheap: cheapVariant('Guitar Clean', 0.5),
};

export const guitarOverdrivenPatch: Patch = {
  name: 'Guitar Overdriven',
  build(ctx, freq, startTime, _midi, duration) {
    return buildGuitar(ctx, freq, startTime, 4, duration);
  },
  cheap: cheapVariant('Guitar Overdriven', 4),
};

export const guitarDistortionPatch: Patch = {
  name: 'Guitar Distortion',
  build(ctx, freq, startTime, _midi, duration) {
    return buildGuitar(ctx, freq, startTime, 12, duration);
  },
  cheap: cheapVariant('Guitar Distortion', 12),
};

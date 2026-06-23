import type { Patch, PatchNote } from './Patch.js';

function isKick(midi: number): boolean { return midi === 35 || midi === 36; }
function isSnare(midi: number): boolean { return midi === 38 || midi === 40 || midi === 37; }
function isClosedHH(midi: number): boolean { return midi === 42 || midi === 44; }
function isOpenHH(midi: number): boolean { return midi === 46; }
function isTom(midi: number): boolean { return (midi >= 41 && midi <= 48) || (midi >= 50 && midi <= 51); }
function isCymbal(midi: number): boolean { return midi === 49 || midi === 52 || midi === 55 || midi === 57; }
function isClap(midi: number): boolean { return midi === 39; }
function isRide(midi: number): boolean { return midi === 51 || midi === 53 || midi === 59; }

function buildNoise(ctx: AudioContext, duration: number): { source: AudioBufferSourceNode; output: GainNode } {
  const sampleRate = ctx.sampleRate;
  const length = Math.ceil(sampleRate * duration);
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const output = ctx.createGain();
  source.connect(output);
  return { source, output };
}

function buildKick(ctx: AudioContext, _freq: number, startTime: number): PatchNote {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, startTime);
  osc.frequency.exponentialRampToValueAtTime(40, startTime + 0.08);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(1.2, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.35);

  osc.connect(gain);
  osc.start(startTime);
  osc.stop(startTime + 0.4);

  return { output: gain, release(_ctx, t) { osc.stop(t + 0.01); } };
}

function buildSnare(ctx: AudioContext, _freq: number, startTime: number): PatchNote {
  const noise = buildNoise(ctx, 0.25);
  const nGain = ctx.createGain();
  nGain.gain.setValueAtTime(0.8, startTime);
  nGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.2);
  noise.output.connect(nGain);

  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 2000;
  nGain.connect(filter);

  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = 200;
  const oGain = ctx.createGain();
  oGain.gain.setValueAtTime(0.5, startTime);
  oGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.08);
  osc.connect(oGain);
  osc.start(startTime);
  osc.stop(startTime + 0.15);

  const merger = ctx.createGain();
  filter.connect(merger);
  oGain.connect(merger);
  noise.source.start(startTime);
  noise.source.stop(startTime + 0.25);

  return { output: merger, release(_ctx, t) { osc.stop(t + 0.01); } };
}

function buildHH(ctx: AudioContext, _freq: number, startTime: number, open: boolean): PatchNote {
  const duration = open ? 0.4 : 0.08;
  const noise = buildNoise(ctx, duration + 0.05);
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = open ? 6000 : 8000;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(open ? 0.5 : 0.6, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  noise.output.connect(filter);
  filter.connect(gain);
  noise.source.start(startTime);
  noise.source.stop(startTime + duration + 0.05);

  return { output: gain, release() {} };
}

function buildTom(ctx: AudioContext, freq: number, startTime: number): PatchNote {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq * 2, startTime);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.5, startTime + 0.15);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.7, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3);

  osc.connect(gain);
  osc.start(startTime);
  osc.stop(startTime + 0.35);

  return { output: gain, release(_ctx, t) { osc.stop(t + 0.01); } };
}

function buildCymbal(ctx: AudioContext, _freq: number, startTime: number): PatchNote {
  const noise = buildNoise(ctx, 0.8);
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 5000;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.4, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.7);

  noise.output.connect(filter);
  filter.connect(gain);
  noise.source.start(startTime);
  noise.source.stop(startTime + 0.85);

  return { output: gain, release() {} };
}

function buildClap(ctx: AudioContext, _freq: number, startTime: number): PatchNote {
  const noise = buildNoise(ctx, 0.2);
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 2500;
  filter.Q.value = 3;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, startTime);
  for (let i = 0; i < 3; i++) {
    const t = startTime + i * 0.01;
    gain.gain.setValueAtTime(0.6, t);
    gain.gain.setValueAtTime(0, t + 0.005);
  }
  gain.gain.setValueAtTime(0.7, startTime + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.15);

  noise.output.connect(filter);
  filter.connect(gain);
  noise.source.start(startTime);
  noise.source.stop(startTime + 0.2);

  return { output: gain, release() {} };
}

function buildRide(ctx: AudioContext, _freq: number, startTime: number): PatchNote {
  const noise = buildNoise(ctx, 1.0);
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 10000;
  filter.Q.value = 2;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.3, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.9);

  noise.output.connect(filter);
  filter.connect(gain);
  noise.source.start(startTime);
  noise.source.stop(startTime + 1.05);

  return { output: gain, release() {} };
}

function buildPerc(ctx: AudioContext, freq: number, startTime: number): PatchNote {
  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.value = freq;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.3, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.1);
  osc.connect(gain);
  osc.start(startTime);
  osc.stop(startTime + 0.15);

  return { output: gain, release(_ctx, t) { osc.stop(t + 0.01); } };
}

export const drumPatch: Patch = {
  name: 'Drums',
  build(ctx, freq, startTime, midi) {
    const note = midi ?? 0;

    if (isKick(note)) return buildKick(ctx, freq, startTime);
    if (isSnare(note)) return buildSnare(ctx, freq, startTime);
    if (isClosedHH(note)) return buildHH(ctx, freq, startTime, false);
    if (isOpenHH(note)) return buildHH(ctx, freq, startTime, true);
    if (isClap(note)) return buildClap(ctx, freq, startTime);
    if (isRide(note)) return buildRide(ctx, freq, startTime);
    if (isCymbal(note)) return buildCymbal(ctx, freq, startTime);
    if (isTom(note)) return buildTom(ctx, freq, startTime);
    return buildPerc(ctx, freq, startTime);
  },
};

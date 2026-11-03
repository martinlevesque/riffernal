import type { Patch, PatchNote } from './Patch.js';
import { getDistortionCurve, cleanupOnEnded } from './shared.js';
import { isLowEndDevice } from '../../utils/device.js';

// On low-end devices the distortion waveshaper is skipped (a plain GainNode
// is returned instead) and 'none' oversampling is used otherwise, drastically
// cutting CPU per hit. The grit it adds is inaudible on small speakers.
function buildDistortion(ctx: AudioContext, amount: number, lowEnd: boolean): AudioNode {
  if (lowEnd) {
    return ctx.createGain();
  }
  const ws = ctx.createWaveShaper();
  ws.curve = getDistortionCurve(amount);
  ws.oversample = 'none';
  return ws;
}

function isKick(midi: number): boolean {
  return midi === 35 || midi === 36;
}
function isSnare(midi: number): boolean {
  return midi === 38 || midi === 40 || midi === 37;
}
function isClosedHH(midi: number): boolean {
  return midi === 42 || midi === 44;
}
function isOpenHH(midi: number): boolean {
  return midi === 46;
}
function isTom(midi: number): boolean {
  return (midi >= 41 && midi <= 48) || (midi >= 50 && midi <= 51);
}
function isCymbal(midi: number): boolean {
  return midi === 49 || midi === 52 || midi === 55 || midi === 57;
}
function isClap(midi: number): boolean {
  return midi === 39;
}
function isRide(midi: number): boolean {
  return midi === 51 || midi === 53 || midi === 59;
}

const _noiseBufferCache = new WeakMap<AudioContext, Map<number, AudioBuffer>>();

function _getNoiseBuffer(ctx: AudioContext, duration: number): AudioBuffer {
  let bucketMap = _noiseBufferCache.get(ctx);
  if (!bucketMap) {
    bucketMap = new Map();
    _noiseBufferCache.set(ctx, bucketMap);
  }
  const bucket = Math.round(duration * 10) / 10;
  let buffer = bucketMap.get(bucket);
  if (buffer) return buffer;

  const length = Math.ceil(ctx.sampleRate * bucket);
  buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  bucketMap.set(bucket, buffer);
  return buffer;
}

function buildNoise(
  ctx: AudioContext,
  duration: number,
): { source: AudioBufferSourceNode; output: GainNode } {
  const buffer = _getNoiseBuffer(ctx, duration);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const output = ctx.createGain();
  source.connect(output);
  return { source, output };
}

function buildKick(ctx: AudioContext, _freq: number, startTime: number): PatchNote {
  const lowEnd = isLowEndDevice();
  // Click transient — sharp high-frequency punch
  const clickOsc = ctx.createOscillator();
  clickOsc.type = 'square';
  clickOsc.frequency.setValueAtTime(800, startTime);
  clickOsc.frequency.exponentialRampToValueAtTime(100, startTime + 0.015);
  const clickGain = ctx.createGain();
  clickGain.gain.setValueAtTime(0.7, startTime);
  clickGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.03);
  clickOsc.connect(clickGain);
  clickOsc.start(startTime);
  clickOsc.stop(startTime + 0.05);

  // Sub body — deep sine sweep with more weight
  const subOsc = ctx.createOscillator();
  subOsc.type = 'sine';
  subOsc.frequency.setValueAtTime(200, startTime);
  subOsc.frequency.exponentialRampToValueAtTime(30, startTime + 0.12);
  const subGain = ctx.createGain();
  subGain.gain.setValueAtTime(1.4, startTime);
  subGain.gain.linearRampToValueAtTime(1.0, startTime + 0.05);
  subGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.45);
  subOsc.connect(subGain);
  subOsc.start(startTime);
  subOsc.stop(startTime + 0.5);

  const merger = ctx.createGain();
  clickGain.connect(merger);
  subGain.connect(merger);

  let harmOsc: OscillatorNode | null = null;
  let harmGain: GainNode | null = null;
  if (!lowEnd) {
    // Harmonic layer — adds growl and body
    harmOsc = ctx.createOscillator();
    harmOsc.type = 'triangle';
    harmOsc.frequency.setValueAtTime(100, startTime);
    harmOsc.frequency.exponentialRampToValueAtTime(35, startTime + 0.1);
    harmGain = ctx.createGain();
    harmGain.gain.setValueAtTime(0.5, startTime);
    harmGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3);
    harmOsc.connect(harmGain);
    harmOsc.start(startTime);
    harmOsc.stop(startTime + 0.35);
    harmGain.connect(merger);
  }

  // Distortion for grit
  const dist = buildDistortion(ctx, 3, lowEnd);
  merger.connect(dist);

  const sources: AudioScheduledSourceNode[] = [clickOsc, subOsc];
  const chain: AudioNode[] = [clickGain, subGain, merger, dist];
  if (harmOsc && harmGain) {
    sources.push(harmOsc);
    chain.push(harmGain);
  }
  cleanupOnEnded(sources, chain);

  if (lowEnd) {
    return {
      output: dist,
      release(_ctx, t) {
        clickOsc.stop(t + 0.01);
        subOsc.stop(t + 0.01);
      },
    };
  }
  return {
    output: dist,
    release(_ctx, t) {
      clickOsc.stop(t + 0.01);
      subOsc.stop(t + 0.01);
      harmOsc!.stop(t + 0.01);
    },
  };
}

function buildSnare(ctx: AudioContext, _freq: number, startTime: number): PatchNote {
  const lowEnd = isLowEndDevice();
  // Noise — longer, louder, more body
  const noise = buildNoise(ctx, 0.35);
  const nGain = ctx.createGain();
  nGain.gain.setValueAtTime(1.0, startTime);
  nGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3);
  noise.output.connect(nGain);

  // Bandpass for snare character
  const bpFilter = ctx.createBiquadFilter();
  bpFilter.type = 'bandpass';
  bpFilter.frequency.value = 3500;
  bpFilter.Q.value = 1.5;
  nGain.connect(bpFilter);

  // High-pass to remove mud
  const hpFilter = ctx.createBiquadFilter();
  hpFilter.type = 'highpass';
  hpFilter.frequency.value = 1800;
  bpFilter.connect(hpFilter);

  // Body — triangle oscillator for body and crack
  const bodyOsc = ctx.createOscillator();
  bodyOsc.type = 'triangle';
  bodyOsc.frequency.setValueAtTime(250, startTime);
  bodyOsc.frequency.exponentialRampToValueAtTime(120, startTime + 0.05);
  const bodyGain = ctx.createGain();
  bodyGain.gain.setValueAtTime(0.8, startTime);
  bodyGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.12);
  bodyOsc.connect(bodyGain);
  bodyOsc.start(startTime);
  bodyOsc.stop(startTime + 0.15);

  // Distortion for edge
  const dist = buildDistortion(ctx, 2, lowEnd);

  const merger = ctx.createGain();
  hpFilter.connect(merger);
  bodyGain.connect(merger);

  let ringOsc: OscillatorNode | null = null;
  let ringGain: GainNode | null = null;
  if (!lowEnd) {
    // Ring — metallic resonant tone for character
    ringOsc = ctx.createOscillator();
    ringOsc.type = 'sine';
    ringOsc.frequency.value = 1850;
    ringGain = ctx.createGain();
    ringGain.gain.setValueAtTime(0.15, startTime);
    ringGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.08);
    ringOsc.connect(ringGain);
    ringOsc.start(startTime);
    ringOsc.stop(startTime + 0.1);
    ringGain.connect(merger);
  }

  merger.connect(dist);
  noise.source.start(startTime);
  noise.source.stop(startTime + 0.35);

  const sources: AudioScheduledSourceNode[] = [noise.source, bodyOsc];
  const chain: AudioNode[] = [noise.output, nGain, bpFilter, hpFilter, bodyGain, merger, dist];
  if (ringOsc && ringGain) {
    sources.push(ringOsc);
    chain.push(ringGain);
  }
  cleanupOnEnded(sources, chain);

  if (lowEnd) {
    return {
      output: dist,
      release(_ctx, t) {
        bodyOsc.stop(t + 0.01);
      },
    };
  }
  return {
    output: dist,
    release(_ctx, t) {
      bodyOsc.stop(t + 0.01);
      ringOsc!.stop(t + 0.01);
    },
  };
}

function buildHH(ctx: AudioContext, _freq: number, startTime: number, open: boolean): PatchNote {
  const duration = open ? 0.55 : 0.08;
  const noise = buildNoise(ctx, duration + 0.05);

  // Two bandpass filters for metallic shimmer
  const bp1 = ctx.createBiquadFilter();
  bp1.type = 'bandpass';
  bp1.frequency.value = open ? 7000 : 10000;
  bp1.Q.value = 1.5;

  const bp2 = ctx.createBiquadFilter();
  bp2.type = 'highpass';
  bp2.frequency.value = open ? 5000 : 7000;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(open ? 0.7 : 0.8, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  noise.output.connect(bp1);
  bp1.connect(bp2);
  bp2.connect(gain);
  noise.source.start(startTime);
  noise.source.stop(startTime + duration + 0.05);
  cleanupOnEnded([noise.source], [noise.output, bp1, bp2, gain]);

  return { output: gain, release() {} };
}

function buildTom(ctx: AudioContext, freq: number, startTime: number): PatchNote {
  // Main body — deeper, punchier
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq * 2.5, startTime);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.4, startTime + 0.12);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.9, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.35);
  osc.connect(gain);
  osc.start(startTime);
  osc.stop(startTime + 0.4);

  // Click transient
  const clickOsc = ctx.createOscillator();
  clickOsc.type = 'triangle';
  clickOsc.frequency.setValueAtTime(freq * 4, startTime);
  clickOsc.frequency.exponentialRampToValueAtTime(freq, startTime + 0.02);
  const clickGain = ctx.createGain();
  clickGain.gain.setValueAtTime(0.5, startTime);
  clickGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.04);
  clickOsc.connect(clickGain);
  clickOsc.start(startTime);
  clickOsc.stop(startTime + 0.06);

  const merger = ctx.createGain();
  gain.connect(merger);
  clickGain.connect(merger);
  cleanupOnEnded([osc, clickOsc], [osc, clickOsc, gain, clickGain, merger]);

  return {
    output: merger,
    release(_ctx, t) {
      osc.stop(t + 0.01);
      clickOsc.stop(t + 0.01);
    },
  };
}

function buildCymbal(ctx: AudioContext, _freq: number, startTime: number): PatchNote {
  const lowEnd = isLowEndDevice();
  // Big, washy crash — on low-end, shorten to keep the noise buffer short.
  const dur = lowEnd ? 0.6 : 1.5;
  const noise = buildNoise(ctx, dur);

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 6000;
  bp.Q.value = 0.8;

  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 4000;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.7, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + (lowEnd ? 0.5 : 1.3));

  noise.output.connect(bp);
  bp.connect(hp);
  hp.connect(gain);
  noise.source.start(startTime);
  noise.source.stop(startTime + dur + 0.05);
  cleanupOnEnded([noise.source], [noise.output, bp, hp, gain]);

  return { output: gain, release() {} };
}

function buildClap(ctx: AudioContext, _freq: number, startTime: number): PatchNote {
  const noise = buildNoise(ctx, 0.25);
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 2500;
  filter.Q.value = 2;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, startTime);
  // Multiple rapid hits for clap character
  for (let i = 0; i < 4; i++) {
    const t = startTime + i * 0.008;
    gain.gain.setValueAtTime(0.8, t);
    gain.gain.setValueAtTime(0, t + 0.004);
  }
  gain.gain.setValueAtTime(0.9, startTime + 0.035);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.18);

  noise.output.connect(filter);
  filter.connect(gain);
  noise.source.start(startTime);
  noise.source.stop(startTime + 0.25);
  cleanupOnEnded([noise.source], [noise.output, filter, gain]);

  return { output: gain, release() {} };
}

function buildRide(ctx: AudioContext, _freq: number, startTime: number): PatchNote {
  const lowEnd = isLowEndDevice();
  // Ride with more ping and wash — on low-end, shorten the wash to save CPU.
  const noise = buildNoise(ctx, lowEnd ? 0.5 : 1.2);

  // Wash — bandpass noise body
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 10000;
  bp.Q.value = 1.5;

  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 6000;

  const washGain = ctx.createGain();
  const washDur = lowEnd ? 0.45 : 1.1;
  washGain.gain.setValueAtTime(0.4, startTime);
  washGain.gain.exponentialRampToValueAtTime(0.001, startTime + washDur);

  noise.output.connect(bp);
  bp.connect(hp);
  hp.connect(washGain);

  const merger = ctx.createGain();
  washGain.connect(merger);

  let pingOsc: OscillatorNode | null = null;
  let pingGain: GainNode | null = null;
  if (!lowEnd) {
    // Ping — bright metallic attack
    pingOsc = ctx.createOscillator();
    pingOsc.type = 'sine';
    pingOsc.frequency.value = 8000;
    pingGain = ctx.createGain();
    pingGain.gain.setValueAtTime(0.2, startTime);
    pingGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.15);
    pingOsc.connect(pingGain);
    pingOsc.start(startTime);
    pingOsc.stop(startTime + 0.2);
    pingGain.connect(merger);
  }

  noise.source.start(startTime);
  noise.source.stop(startTime + (lowEnd ? 0.55 : 1.25));

  const sources: AudioScheduledSourceNode[] = [noise.source];
  const chain: AudioNode[] = [noise.output, bp, hp, washGain, merger];
  if (pingOsc && pingGain) {
    sources.push(pingOsc);
    chain.push(pingGain);
  }
  cleanupOnEnded(sources, chain);

  if (lowEnd) {
    return { output: merger, release() {} };
  }
  return {
    output: merger,
    release(_ctx, t) {
      pingOsc!.stop(t + 0.01);
    },
  };
}

function buildPerc(ctx: AudioContext, freq: number, startTime: number): PatchNote {
  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.value = freq;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.35, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.1);
  osc.connect(gain);
  osc.start(startTime);
  osc.stop(startTime + 0.15);
  cleanupOnEnded([osc], [osc, gain]);

  return {
    output: gain,
    release(_ctx, t) {
      osc.stop(t + 0.01);
    },
  };
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

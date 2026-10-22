import type { Patch, PatchNote } from './Patch.js';
import { applyEnvelope, applyEnvelopeWithRelease, type EnvelopePoint } from './shared.js';
import { getDistortionCurve } from './shared.js';
import { isLowEndDevice } from '../../utils/device.js';

// On low-end devices the distortion waveshaper is skipped (a plain GainNode
// is returned instead) and 'none' oversampling is used otherwise, drastically
// cutting CPU per hit. The grit it adds is inaudible on small speakers.
function buildDistortion(ctx: BaseAudioContext, amount: number, lowEnd: boolean): AudioNode {
  if (lowEnd) {
    return ctx.createGain();
  }

  const ws = ctx.createWaveShaper();
  ws.curve = getDistortionCurve(amount);
  ws.oversample = 'none';

  return ws;
}

function isKick(midi: number): boolean { return midi === 35 || midi === 36; }
function isSnare(midi: number): boolean { return midi === 38 || midi === 40 || midi === 37; }
function isClosedHH(midi: number): boolean { return midi === 42 || midi === 44; }
function isOpenHH(midi: number): boolean { return midi === 46; }
function isTom(midi: number): boolean { return (midi >= 41 && midi <= 48) || (midi >= 50 && midi <= 51); }
function isCymbal(midi: number): boolean { return midi === 49 || midi === 52 || midi === 55 || midi === 57; }
function isClap(midi: number): boolean { return midi === 39; }
function isRide(midi: number): boolean { return midi === 51 || midi === 53 || midi === 59; }

const _noiseBufferCache = new WeakMap<BaseAudioContext, Map<number, AudioBuffer>>();

function _getNoiseBuffer(ctx: BaseAudioContext, duration: number): AudioBuffer {
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

function buildNoise(ctx: BaseAudioContext, duration: number): { source: AudioBufferSourceNode; output: GainNode } {
  const buffer = _getNoiseBuffer(ctx, duration);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const output = ctx.createGain();

  source.connect(output);
  return { source, output };
}

const LAYER_FADE = 0.05;
const LAYER_STOP_TAIL = 0.01;

/** Cuts a layer short when the note ends before its authored envelope has
 *  decayed: the envelope is rewritten to fade exactly at the note end and
 *  the sources re-stop earlier. Layers that are already silent inside the
 *  note are left untouched. Either way the final source end time is
 *  returned. */
function cutLayer(
  gain: GainNode,
  env: EnvelopePoint[],
  sources: AudioScheduledSourceNode[],
  startTime: number,
  duration: number,
  naturalEnd: number,
): number {
  if (env[env.length - 1].at <= duration) {
    // Already silent well before the note ends — play the authored decay and
    // keep the sources' natural stop times.
    applyEnvelope(gain.gain, startTime, env);
    return naturalEnd;
  }

  const silentAt = applyEnvelopeWithRelease(gain.gain, startTime, env, duration, LAYER_FADE);
  const stopAt = Math.min(startTime + naturalEnd, silentAt + LAYER_STOP_TAIL);
  for (const src of sources) {
    src.stop(stopAt);
  }

  return stopAt - startTime;
}

function drumNote(output: AudioNode, release: PatchNote['release'], endTime?: number): PatchNote {
  return endTime === undefined ? { output, release } : { output, release, endTime };
}

const KICK_CLICK_ENV: EnvelopePoint[] = [
  { at: 0, to: 0.7, type: 'set' },
  { at: 0.03, to: 0.001, type: 'exp' },
];

const KICK_SUB_ENV: EnvelopePoint[] = [
  { at: 0, to: 1.4, type: 'set' },
  { at: 0.05, to: 1.0, type: 'lin' },
  { at: 0.45, to: 0.001, type: 'exp' },
];

const KICK_HARM_ENV: EnvelopePoint[] = [
  { at: 0, to: 0.5, type: 'set' },
  { at: 0.3, to: 0.001, type: 'exp' },
];

// Click transient — sharp high-frequency punch. Sub body — deep sine sweep
// with more weight. Harmonic layer — adds growl and body.
function buildKick(ctx: BaseAudioContext, _freq: number, startTime: number, duration?: number): PatchNote {
  const lowEnd = isLowEndDevice();

  const clickOsc = ctx.createOscillator();
  clickOsc.type = 'square';
  clickOsc.frequency.setValueAtTime(800, startTime);
  clickOsc.frequency.exponentialRampToValueAtTime(100, startTime + 0.015);
  const clickGain = ctx.createGain();
  clickOsc.connect(clickGain);
  clickOsc.start(startTime);
  clickOsc.stop(startTime + 0.05);

  const subOsc = ctx.createOscillator();
  subOsc.type = 'sine';
  subOsc.frequency.setValueAtTime(200, startTime);
  subOsc.frequency.exponentialRampToValueAtTime(30, startTime + 0.12);
  const subGain = ctx.createGain();
  subOsc.connect(subGain);
  subOsc.start(startTime);
  subOsc.stop(startTime + 0.5);

  const merger = ctx.createGain();
  clickGain.connect(merger);
  subGain.connect(merger);

  const harmLayer = lowEnd ? null : ((): { osc: OscillatorNode; gain: GainNode } => {
    const h = ctx.createOscillator();
    h.type = 'triangle';
    h.frequency.setValueAtTime(100, startTime);
    h.frequency.exponentialRampToValueAtTime(35, startTime + 0.1);
    const hg = ctx.createGain();
    h.connect(hg);
    h.start(startTime);
    h.stop(startTime + 0.35);
    hg.connect(merger);
    return { osc: h, gain: hg };
  })();

  let endTime: number | undefined;
  if (duration === undefined) {
    applyEnvelope(clickGain.gain, startTime, KICK_CLICK_ENV);
    applyEnvelope(subGain.gain, startTime, KICK_SUB_ENV);
    if (harmLayer) applyEnvelope(harmLayer.gain.gain, startTime, KICK_HARM_ENV);
  } else {
    let end = Math.max(
      cutLayer(clickGain, KICK_CLICK_ENV, [clickOsc], startTime, duration, 0.05),
      cutLayer(subGain, KICK_SUB_ENV, [subOsc], startTime, duration, 0.5),
    );
    if (harmLayer) {
      end = Math.max(end, cutLayer(harmLayer.gain, KICK_HARM_ENV, [harmLayer.osc], startTime, duration, 0.35));
    }
    endTime = startTime + end;
  }

  // Distortion for grit
  const dist = buildDistortion(ctx, 3, lowEnd);
  merger.connect(dist);

  return drumNote(dist, (_ctx, t) => {
    clickOsc.stop(t + 0.01);
    subOsc.stop(t + 0.01);
    if (harmLayer) harmLayer.osc.stop(t + 0.01);
  }, endTime);
}

const SNARE_NOISE_ENV: EnvelopePoint[] = [
  { at: 0, to: 1.0, type: 'set' },
  { at: 0.3, to: 0.001, type: 'exp' },
];

const SNARE_BODY_ENV: EnvelopePoint[] = [
  { at: 0, to: 0.8, type: 'set' },
  { at: 0.12, to: 0.001, type: 'exp' },
];

const SNARE_RING_ENV: EnvelopePoint[] = [
  { at: 0, to: 0.15, type: 'set' },
  { at: 0.08, to: 0.001, type: 'exp' },
];

// Noise — longer, louder, more body. Body — triangle oscillator for body
// and crack. Ring — metallic resonant tone for character.
function buildSnare(ctx: BaseAudioContext, _freq: number, startTime: number, duration?: number): PatchNote {
  const lowEnd = isLowEndDevice();

  const noise = buildNoise(ctx, 0.35);
  const nGain = ctx.createGain();
  noise.output.connect(nGain);

  // Bandpass for snare character
  const bpFilter = ctx.createBiquadFilter();
  bpFilter.type = 'bandpass';
  bpFilter.frequency.value = 3500;
  bpFilter.Q.value = 1.5;

  // High-pass to remove mud
  const hpFilter = ctx.createBiquadFilter();
  hpFilter.type = 'highpass';
  hpFilter.frequency.value = 1800;

  nGain.connect(bpFilter);
  bpFilter.connect(hpFilter);

  const bodyOsc = ctx.createOscillator();
  bodyOsc.type = 'triangle';
  bodyOsc.frequency.setValueAtTime(250, startTime);
  bodyOsc.frequency.exponentialRampToValueAtTime(120, startTime + 0.05);
  const bodyGain = ctx.createGain();
  bodyOsc.connect(bodyGain);
  bodyOsc.start(startTime);
  bodyOsc.stop(startTime + 0.15);

  const dist = buildDistortion(ctx, 2, lowEnd);

  const merger = ctx.createGain();
  hpFilter.connect(merger);
  bodyGain.connect(merger);

  const ringLayer = lowEnd ? null : ((): { osc: OscillatorNode; gain: GainNode } => {
    const r = ctx.createOscillator();
    r.type = 'sine';
    r.frequency.value = 1850;
    const rg = ctx.createGain();
    r.connect(rg);
    r.start(startTime);
    r.stop(startTime + 0.1);
    rg.connect(merger);
    return { osc: r, gain: rg };
  })();

  merger.connect(dist);
  noise.source.start(startTime);
  noise.source.stop(startTime + 0.35);

  let endTime: number | undefined;
  if (duration === undefined) {
    applyEnvelope(nGain.gain, startTime, SNARE_NOISE_ENV);
    applyEnvelope(bodyGain.gain, startTime, SNARE_BODY_ENV);
    if (ringLayer) applyEnvelope(ringLayer.gain.gain, startTime, SNARE_RING_ENV);
  } else {
    let end = Math.max(
      cutLayer(nGain, SNARE_NOISE_ENV, [noise.source], startTime, duration, 0.35),
      cutLayer(bodyGain, SNARE_BODY_ENV, [bodyOsc], startTime, duration, 0.15),
    );
    if (ringLayer) {
      end = Math.max(end, cutLayer(ringLayer.gain, SNARE_RING_ENV, [ringLayer.osc], startTime, duration, 0.1));
    }
    endTime = startTime + end;
  }

  return drumNote(dist, (_ctx, t) => {
    bodyOsc.stop(t + 0.01);
    if (ringLayer) ringLayer.osc.stop(t + 0.01);
  }, endTime);
}

// Two bandpass filters for metallic shimmer on bandpassed noise.
function buildHH(ctx: BaseAudioContext, _freq: number, startTime: number, open: boolean, duration?: number): PatchNote {
  const hhDur = open ? 0.55 : 0.08;
  const noise = buildNoise(ctx, hhDur + 0.05);
  const HH_ENV: EnvelopePoint[] = [
    { at: 0, to: open ? 0.7 : 0.8, type: 'set' },
    { at: hhDur, to: 0.001, type: 'exp' },
  ];

  const bp1 = ctx.createBiquadFilter();
  bp1.type = 'bandpass';
  bp1.frequency.value = open ? 7000 : 10000;
  bp1.Q.value = 1.5;

  const bp2 = ctx.createBiquadFilter();
  bp2.type = 'highpass';
  bp2.frequency.value = open ? 5000 : 7000;

  const gain = ctx.createGain();

  noise.output.connect(bp1);
  bp1.connect(bp2);
  bp2.connect(gain);

  noise.source.start(startTime);
  noise.source.stop(startTime + hhDur + 0.05);

  if (duration === undefined) {
    applyEnvelope(gain.gain, startTime, HH_ENV);
    return drumNote(gain, () => { });
  }

  const end = startTime + cutLayer(gain, HH_ENV, [noise.source], startTime, duration, hhDur + 0.05);
  return drumNote(gain, () => { }, end);
}

const TOM_ENV: EnvelopePoint[] = [
  { at: 0, to: 0.9, type: 'set' },
  { at: 0.35, to: 0.001, type: 'exp' },
];

const TOM_CLICK_ENV: EnvelopePoint[] = [
  { at: 0, to: 0.5, type: 'set' },
  { at: 0.04, to: 0.001, type: 'exp' },
];

// Main body — deeper, punchier, plus a click transient.
function buildTom(ctx: BaseAudioContext, freq: number, startTime: number, duration?: number): PatchNote {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq * 2.5, startTime);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.4, startTime + 0.12);

  const gain = ctx.createGain();
  osc.connect(gain);
  osc.start(startTime);
  osc.stop(startTime + 0.4);

  const clickOsc = ctx.createOscillator();
  clickOsc.type = 'triangle';
  clickOsc.frequency.setValueAtTime(freq * 4, startTime);
  clickOsc.frequency.exponentialRampToValueAtTime(freq, startTime + 0.02);
  const clickGain = ctx.createGain();
  clickOsc.connect(clickGain);
  clickOsc.start(startTime);
  clickOsc.stop(startTime + 0.06);

  const merger = ctx.createGain();
  gain.connect(merger);
  clickGain.connect(merger);

  let endTime: number | undefined;
  if (duration === undefined) {
    applyEnvelope(gain.gain, startTime, TOM_ENV);
    applyEnvelope(clickGain.gain, startTime, TOM_CLICK_ENV);
  } else {
    endTime = startTime + Math.max(
      cutLayer(gain, TOM_ENV, [osc], startTime, duration, 0.4),
      cutLayer(clickGain, TOM_CLICK_ENV, [clickOsc], startTime, duration, 0.06),
    );
  }

  return drumNote(merger, (_ctx, t) => {
    osc.stop(t + 0.01);
    clickOsc.stop(t + 0.01);
  }, endTime);
}

// Big, washy crash — on low-end, shorten to keep the noise buffer short.
function buildCymbal(ctx: BaseAudioContext, _freq: number, startTime: number, duration?: number): PatchNote {
  const lowEnd = isLowEndDevice();
  const dur = lowEnd ? 0.6 : 1.5;
  const decay = lowEnd ? 0.5 : 1.3;
  const noise = buildNoise(ctx, dur);
  const CYM_ENV: EnvelopePoint[] = [
    { at: 0, to: 0.7, type: 'set' },
    { at: decay, to: 0.001, type: 'exp' },
  ];

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 6000;
  bp.Q.value = 0.8;

  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 4000;

  const gain = ctx.createGain();

  noise.output.connect(bp);
  bp.connect(hp);
  hp.connect(gain);

  noise.source.start(startTime);
  noise.source.stop(startTime + dur + 0.05);

  if (duration === undefined) {
    applyEnvelope(gain.gain, startTime, CYM_ENV);
    return drumNote(gain, () => { });
  }

  return drumNote(gain, () => { }, startTime + cutLayer(gain, CYM_ENV, [noise.source], startTime, duration, dur + 0.05));
}

const CLAP_ENV: EnvelopePoint[] = [
  { at: 0, to: 0.8, type: 'set' },
  { at: 0.004, to: 0, type: 'set' },
  { at: 0.008, to: 0.8, type: 'set' },
  { at: 0.012, to: 0, type: 'set' },
  { at: 0.016, to: 0.8, type: 'set' },
  { at: 0.02, to: 0, type: 'set' },
  { at: 0.024, to: 0.8, type: 'set' },
  { at: 0.028, to: 0, type: 'set' },
  { at: 0.035, to: 0.9, type: 'set' },
  { at: 0.18, to: 0.001, type: 'exp' },
];

// Multiple rapid hits for clap character.
function buildClap(ctx: BaseAudioContext, _freq: number, startTime: number, duration?: number): PatchNote {
  const noise = buildNoise(ctx, 0.25);
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 2500;
  filter.Q.value = 2;

  const gain = ctx.createGain();
  noise.output.connect(filter);
  filter.connect(gain);

  noise.source.start(startTime);
  noise.source.stop(startTime + 0.25);

  if (duration === undefined) {
    applyEnvelope(gain.gain, startTime, CLAP_ENV);
    return drumNote(gain, () => { });
  }

  return drumNote(gain, () => { }, startTime + cutLayer(gain, CLAP_ENV, [noise.source], startTime, duration, 0.25));
}

// Wash — bandpass noise body. Ping — bright metallic attack. On low-end,
// shorten the wash to save CPU.
const RIDE_PING_ENV: EnvelopePoint[] = [
  { at: 0, to: 0.2, type: 'set' },
  { at: 0.15, to: 0.001, type: 'exp' },
];

function buildRide(ctx: BaseAudioContext, _freq: number, startTime: number, duration?: number): PatchNote {
  const lowEnd = isLowEndDevice();
  const noise = buildNoise(ctx, lowEnd ? 0.5 : 1.2);
  const WASH_ENV: EnvelopePoint[] = [
    { at: 0, to: 0.4, type: 'set' },
    { at: lowEnd ? 0.45 : 1.1, to: 0.001, type: 'exp' },
  ];

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 10000;
  bp.Q.value = 1.5;

  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 6000;

  const washGain = ctx.createGain();
  noise.output.connect(bp);
  bp.connect(hp);
  hp.connect(washGain);

  const merger = ctx.createGain();
  washGain.connect(merger);

  const pingLayer = lowEnd ? null : ((): { osc: OscillatorNode; gain: GainNode } => {
    const p = ctx.createOscillator();
    p.type = 'sine';
    p.frequency.value = 8000;
    const pg = ctx.createGain();
    p.connect(pg);
    p.start(startTime);
    p.stop(startTime + 0.2);
    pg.connect(merger);
    return { osc: p, gain: pg };
  })();

  noise.source.start(startTime);
  noise.source.stop(startTime + (lowEnd ? 0.55 : 1.25));

  let endTime: number | undefined;
  if (duration === undefined) {
    applyEnvelope(washGain.gain, startTime, WASH_ENV);
    if (pingLayer) applyEnvelope(pingLayer.gain.gain, startTime, RIDE_PING_ENV);
  } else {
    let end = cutLayer(washGain, WASH_ENV, [noise.source], startTime, duration, lowEnd ? 0.55 : 1.25);
    if (pingLayer) {
      end = Math.max(end, cutLayer(pingLayer.gain, RIDE_PING_ENV, [pingLayer.osc], startTime, duration, 0.2));
    }
    endTime = startTime + end;
  }

  const release = (_ctx: AudioContext, t: number) => {
    if (pingLayer) pingLayer.osc.stop(t + 0.01);
  };

  return drumNote(merger, release, endTime);
}

const PERC_ENV: EnvelopePoint[] = [
  { at: 0, to: 0.35, type: 'set' },
  { at: 0.1, to: 0.001, type: 'exp' },
];

function buildPerc(ctx: BaseAudioContext, freq: number, startTime: number, duration?: number): PatchNote {
  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.value = freq;

  const gain = ctx.createGain();
  osc.connect(gain);
  osc.start(startTime);
  osc.stop(startTime + 0.15);

  let endTime: number | undefined;
  if (duration === undefined) {
    applyEnvelope(gain.gain, startTime, PERC_ENV);
  } else {
    endTime = startTime + cutLayer(gain, PERC_ENV, [osc], startTime, duration, 0.15);
  }

  return drumNote(gain, (_ctx, t) => {
    osc.stop(t + 0.01);
  }, endTime);
}

export const drumPatch: Patch = {
  name: 'Drums',
  build(ctx, freq, startTime, midi, duration) {
    const note = midi ?? 0;

    if (isKick(note)) return buildKick(ctx, freq, startTime, duration);
    if (isSnare(note)) return buildSnare(ctx, freq, startTime, duration);
    if (isClosedHH(note)) return buildHH(ctx, freq, startTime, false, duration);
    if (isOpenHH(note)) return buildHH(ctx, freq, startTime, true, duration);
    if (isClap(note)) return buildClap(ctx, freq, startTime, duration);
    if (isRide(note)) return buildRide(ctx, freq, startTime, duration);
    if (isCymbal(note)) return buildCymbal(ctx, freq, startTime, duration);
    if (isTom(note)) return buildTom(ctx, freq, startTime, duration);

    return buildPerc(ctx, freq, startTime, duration);
  },
};

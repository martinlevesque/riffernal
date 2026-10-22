const _distortionCurveCache = new Map<number, Float32Array<ArrayBuffer>>();

/** A gain-envelope way-point, at `at` seconds after the note start, ramping
 *  to `to` (`set` jumps, `lin` linear, `exp` exponential — WebAudio ramp
 *  semantics). Points must be in ascending time order; the first point
 *  should be at 0. */
export interface EnvelopePoint {
  at: number;
  to: number;
  type: 'set' | 'lin' | 'exp';
}

function schedulePoint(param: AudioParam, t: number, p: EnvelopePoint): void {
  if (p.type === 'set') param.setValueAtTime(p.to, t);
  else if (p.type === 'lin') param.linearRampToValueAtTime(p.to, t);
  else param.exponentialRampToValueAtTime(p.to, t);
}

/** Plays the whole envelope into `param`, for a live note whose end time is
 *  unknown. */
export function applyEnvelope(param: AudioParam, t0: number, pts: EnvelopePoint[]): void {
  for (const p of pts) {
    schedulePoint(param, t0 + p.at, p);
  }
}

/** Value of the authored envelope `dt` seconds after its start, evaluating
 *  the interp-curves the web audio ramps would draw. */
export function envelopeValueAt(pts: EnvelopePoint[], dt: number): number {
  if (dt <= pts[0].at) return pts[0].to;

  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (dt > p.at) continue;

    const prev = pts[i - 1];
    if (p.type === 'set') {
      // Held at the previous value until the jump itself.
      return dt === p.at ? p.to : prev.to;
    }

    const u = (dt - prev.at) / (p.at - prev.at);
    if (p.type === 'exp' && prev.to > 0 && p.to > 0) {
      return prev.to * (p.to / prev.to) ** u;
    }
    return prev.to + (p.to - prev.to) * u;
  }

  return pts[pts.length - 1].to;
}

/** Plays the envelope for a note of known `duration`: envelope points past
 *  the note end never reach the param (they would swell the gain back up
 *  after the fade), the fade anchors at the interpolated envelope value and
 *  decays to near-zero. Returns the time the envelope hits silence. */
export function applyEnvelopeWithRelease(
  param: AudioParam,
  t0: number,
  pts: EnvelopePoint[],
  duration: number,
  releaseLen: number,
): number {
  for (const p of pts) {
    if (p.at >= duration) break;
    schedulePoint(param, t0 + p.at, p);
  }

  const tStop = t0 + duration;
  const anchor = Math.max(envelopeValueAt(pts, duration), 0.001);
  param.setValueAtTime(anchor, tStop);
  param.exponentialRampToValueAtTime(0.001, tStop + releaseLen);
  return tStop + releaseLen;
}

export function getDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
  let curve = _distortionCurveCache.get(amount);
  if (curve) return curve;

  const samples = 256;
  curve = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x));
  }
  _distortionCurveCache.set(amount, curve);
  return curve;
}

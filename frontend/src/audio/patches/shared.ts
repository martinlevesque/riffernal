const _distortionCurveCache = new Map<number, Float32Array<ArrayBuffer>>();

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

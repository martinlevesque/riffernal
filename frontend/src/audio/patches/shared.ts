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

/** Disconnects every node of a finished voice once all of its sound sources
 *  have stopped. Without this, browsers keep whole voice graphs (gains,
 *  filters, shapers) referenced until GC decides otherwise, which builds up
 *  into slow garbage-collection pauses on weak hardware during dense
 *  sections. Per-source disconnect only after the LAST source ends, so
 *  longer sources keep playing through the shared chain. */
export function cleanupOnEnded(sources: AudioScheduledSourceNode[], chain: AudioNode[]): void {
  let remaining = sources.length;
  for (const source of sources) {
    source.onended = () => {
      source.onended = null;
      source.disconnect();
      remaining--;
      if (remaining === 0) {
        for (const node of chain) node.disconnect();
      }
    };
  }
}

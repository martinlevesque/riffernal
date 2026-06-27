// Coarse device-tier detection for performance scaling.
// A device is considered low-end when it has few CPU cores, little RAM,
// or a small viewport (typical of older Android tablets). These devices
// struggle with dense Web Audio graphs and high-DPI canvas rendering.
//
// Thresholds:
//   cores <= 4  : ARM big.LITTLE with 2+2 cores or older quad-core SoCs.
//                 The audio render thread runs on a single core, so
//                 fewer physical cores means less headroom.
//   memory <= 4 : 4 GB RAM or less. At 6 GB, Chrome + OS still leave
//                 enough room; below that GC pauses and OOM kills
//                 become frequent under heavy Web Audio load.
//   viewport < 900 : catches phone-class screens and narrow tablet
//                 layouts in portrait. Wide tablets in landscape are
//                 usually fine if they have decent RAM/CPU.

let _cached: boolean | null = null;

export function isLowEndDevice(): boolean {
  if (_cached !== null) return _cached;

  const nav = navigator;
  const cores = nav.hardwareConcurrency ?? 0;
  const memory = (nav as unknown as { deviceMemory?: number }).deviceMemory ?? 0;
  const smallViewport = typeof window !== 'undefined' ? window.innerWidth < 900 : false;

  // Treat unsupported signals (0) as "unknown", not low-end.
  const lowCores = cores > 0 && cores <= 4;
  const lowMemory = memory > 0 && memory <= 4;

  _cached = lowCores || lowMemory || smallViewport;
  return _cached;
}
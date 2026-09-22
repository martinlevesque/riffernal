export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Normalized 0..1 intensity derived from a MIDI velocity (1..127), with a
 *  gamma curve so the lower end of the range is still visibly different from
 *  silence while the high end still grows. */
export function velocityIntensity(velocity: number): number {
  return clamp(velocity / 127, 0, 1) ** 0.6;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function formatTime(seconds: number): string {
  // Preroll buffers can briefly leave playback time below zero.
  seconds = Math.max(0, seconds);
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatScore(score: number): string {
  return score.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function noteNameToMidi(name: string): number {
  const match = name.match(/^([A-G]#?)(\d)$/);
  if (!match) return -1;
  const noteMap: Record<string, number> = { 'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11 };

  return noteMap[match[1]] + (parseInt(match[2], 10) + 1) * 12;
}

export function midiToNoteName(midi: number): string {
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(midi / 12) - 1;
  const note = notes[midi % 12];
  return `${note}${octave}`;
}

export function reportError(context: string, err: unknown, opts?: { alert?: boolean }): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`${context}:`, err);
  if (opts?.alert) alert(`${context}: ${message}`);
}

export function parseSqlTimestamp(ts: string): Date {
  return new Date(`${ts.replace(' ', 'T')}Z`);
}

export function formatRelativeTime(ts: string | null | undefined, prefix = ''): string {
  if (!ts) return '';
  const date = parseSqlTimestamp(ts);
  if (Number.isNaN(date.getTime())) return '';

  const diffMin = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diffMin < 1) return `${prefix}just now`;
  if (diffMin < 60) return `${prefix}${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${prefix}${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${prefix}${diffDay}d ago`;
  const diffWk = Math.floor(diffDay / 7);
  if (diffWk < 5) return `${prefix}${diffWk}w ago`;
  return `${prefix}${date.toLocaleDateString()}`;
}

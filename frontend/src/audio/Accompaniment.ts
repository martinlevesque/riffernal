// Pre-rendered streaming accompaniment engine: renders the deterministic
// background tracks offline into 10s "chunk burst" buffers and plays them
// back as AudioBufferSources, collapsing per-note realtime work to a few
// scheduled sources + master chain (dense passages otherwise spend the
// audio render thread on ~150 live voices).
//
// Chunk layout makes buffers phase-correct without continuity math: a chunk
// renders only the notes STARTING inside its [start, start+10s) span, each
// rendered attack-to-release fully; consecutive buffers simply overlap so a
// first-chunk note's release decays past the boundary while the next chunk
// carries only fresh notes — no double-triggering, no envelope re-entry.

import { noteNameToMidi } from '../utils/helpers.js';
import type { Patch } from './patches/Patch.js';

export const ACCOMP_CHUNK_SECONDS = 10;
/** RAM guard for 8 GB machines: rendered-ahead window per enabled track
 *  (~4 chunks * ~2 MB mono 48 kHz), not whole-song buffers. */
export const ACCOMP_WINDOW_CHUNKS = 3;
/** Extra audio seconds after buffer start for releases/noise tails to decay
 *  before the buffer is evicted. Buffer length is capped separately. */
export const ACCOMP_CHUNK_TAIL = 1.0;
/** Cap for a chunk whose longest note outlives the +10s span: pads longer
 *  than ~18s get their sustain trimmed (release pulled inside the buffer). */
export const ACCOMP_MAX_CHUNK_SECONDS = 18;
/** Playback-rate correction authority per chunk handoff: ±0.2% over a 10s
 *  chunk converges a measured 15ms+ game/audio drift within one chunk. */
export const DRIFT_NUDGE_MAX = 0.002;
/** Drift smaller than this is left alone (below clock quantum noise). */
export const DRIFT_NUDGE_MIN_SECONDS = 0.015;
/** Playback entering an unrendered chunk starts degrading to the live-voice
 *  path after this grace period (render must normally finish ~10s early). */
export const DEGRADE_GRACE_SECONDS = 0.25;

const FREQUENCY_A4 = 440;

export interface AccompanimentNote {
  time: number;
  key: string;
  duration: number;
  rawMidi?: number;
  program?: number;
  channel?: number;
}

export interface AccompanimentTrack {
  index: number;
  enabled?: boolean;
  /** Time-sorted notes of this track (a copy; NoteManager mutates gameplay
   *  flags on shared SongNote objects). */
  notes: AccompanimentNote[];
}

export interface ChunkBufferLike {
  length: number;
  sampleRate: number;
}

export interface OfflineContextLike {
  destination: AudioNode;
  sampleRate: number;
  startRendering(): Promise<ChunkBufferLike>;
}

export interface AccompanimentDeps {
  ctx: AudioContext;
  master: AudioNode;
  patchFor(program: number, channel: number, background: boolean): Patch;
  tracks: AccompanimentTrack[];
  offlineFactory?: (seconds: number, sampleRate: number) => OfflineContextLike;
}

interface ScheduledSource {
  source: AudioBufferSourceNode;
  chunkIdx: number;
  startCtx: number;
  rate: number;
  bufferSec: number;
}

interface TrackState {
  index: number;
  gain: GainNode;
  enabled: boolean;
  notes: AccompanimentNote[];
  /** Rendered chunk index -> buffer (null for empty chunks). */
  chunks: Map<number, ChunkBufferLike | null>;
  /** Chunk index -> buffer play-span (seconds of audio). */
  bufferSecs: Map<number, number>;
  scheduled: Map<number, ScheduledSource>;
  queuedRenders: Set<number>;
}

/** Notes starting inside `[chunkStart, chunkStart + ACCOMP_CHUNK_SECONDS)`.
 *  Notes outliving the capped buffer get their duration trimmed so the
 *  release decay still ends inside the buffer; notes starting in an earlier
 *  chunk are never re-rendered. Returns copies only when durations get
 *  clamped — the inputs may be shared SongNote objects. */
export function selectChunkNotes(notes: AccompanimentNote[], chunkStart: number): AccompanimentNote[] {
  const chunkEnd = chunkStart + ACCOMP_CHUNK_SECONDS;
  const cap = chunkStart + ACCOMP_MAX_CHUNK_SECONDS - ACCOMP_CHUNK_TAIL;

  let lo = 0;
  let hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (notes[mid].time < chunkStart) lo = mid + 1;
    else hi = mid;
  }

  const out: AccompanimentNote[] = [];
  for (let i = lo; i < notes.length && notes[i].time < chunkEnd; i++) {
    const n = notes[i];
    const maxDuration = cap - n.time;
    if (n.duration <= maxDuration) {
      out.push(n);
    } else if (maxDuration > 0) {
      out.push({ ...n, duration: maxDuration });
    }
  }

  return out;
}

/** Audio seconds a chunk's buffer must hold: to its last note's natural end
 *  plus the tail margin (patches schedule their release decay past the note
 *  end; drums stay under ~0.35s). */
export function chunkBufferLengthSec(clampedNotes: AccompanimentNote[], chunkStart: number): number {
  let end = chunkStart;
  for (const n of clampedNotes) {
    if (n.time + n.duration > end) end = n.time + n.duration;
  }
  return Math.min(end - chunkStart + ACCOMP_CHUNK_TAIL, ACCOMP_MAX_CHUNK_SECONDS);
}

/** Playback rate for a chunk handoff measured `driftSec` behind/ahead of the
 *  game clock (drift > 0 = audio ahead of game → slow the next chunk down). */
export function driftCorrectionRate(driftSec: number, chunkLenSec: number): number {
  if (Math.abs(driftSec) < DRIFT_NUDGE_MIN_SECONDS) return 1;
  const rate = 1 - driftSec / chunkLenSec;
  return Math.max(1 - DRIFT_NUDGE_MAX, Math.min(1 + DRIFT_NUDGE_MAX, rate));
}

export function midiNoteToFrequency(midi: number): number {
  return FREQUENCY_A4 * 2 ** ((midi - 69) / 12);
}

export class AccompanimentEngine {
  private _ctx: AudioContext | null = null;
  private _patchFor: ((program: number, channel: number, background: boolean) => Patch) | null = null;
  private _tracks: TrackState[] = [];
  private _offlineFactory: (seconds: number, sampleRate: number) => OfflineContextLike
    = (sec, sr) => new OfflineAudioContext(1, Math.ceil(sec * sr), sr) as unknown as OfflineContextLike;

  private _running = false;
  private _paused = false;
  private _degraded = false;
  private _anchorCtx = 0;
  private _anchorSong = 0;
  private _renderInFlight = false;
  private _renderQueue: Array<{ track: TrackState; idx: number }> = [];
  /** Shared per-chunk playback rate (kept equal across tracks so they stay
   *  phase-aligned with each other). */
  private _chunkRates = new Map<number, number>();

  get running(): boolean {
    return this._running;
  }

  /** True for notes whose audio the engine owns (background-track notes).
   *  Intentionally independent of track enable state: a disabled track is
   *  silent-by-gain — its notes must never leak back to the live path. */
  handles(note: { track: number; selected: boolean }): boolean {
    if (!this._running || this._paused || this._degraded) return false;
    return !note.selected && this._tracks.some((t) => t.index === note.track);
  }

  attach(deps: AccompanimentDeps): void {
    this.dispose();

    this._ctx = deps.ctx;
    this._patchFor = deps.patchFor;
    if (deps.offlineFactory) this._offlineFactory = deps.offlineFactory;

    this._tracks = deps.tracks.map((track) => {
      const gain = deps.ctx.createGain();
      gain.gain.value = track.enabled === false ? 0 : 1;
      gain.connect(deps.master);

      return {
        index: track.index,
        gain,
        enabled: track.enabled !== false,
        notes: [...track.notes].sort((a, b) => a.time - b.time),
        chunks: new Map(),
        bufferSecs: new Map(),
        scheduled: new Map(),
        queuedRenders: new Set(),
      };
    });
  }

  /** Re-anchor playback at song position `pos` (hard re-sync: any scheduled
   *  sources stop and playback restarts from the chunk containing `pos`).
   *  Used for start, pause/resume, seek, loop wrap, learn-mode freezes and
   *  re-engaging after a speed fallback. */
  restartAt(pos: number, fromCtxTime?: number): void {
    if (!this._ctx) return;

    this._stopSources();

    this._running = true;
    this._paused = false;
    this._degraded = false;
    this._renderQueue.length = 0;
    this._chunkRates.clear();

    this._anchorCtx = fromCtxTime ?? this._ctx.currentTime;
    this._anchorSong = pos;
  }

  /** Stop scheduled sources and free the render queue; chunk buffers stay
   *  cached for a cheap `restartAt` resume. Also releases engine-ownership
   *  until the next restartAt. */
  pause(): void {
    if (!this._ctx) return;

    this._paused = true;
    this._stopSources();
  }

  /** Disengage for the rest of the playback (speed fallback): like pause,
   *  but `handles()` returns false so Game restores the live-voice path. */
  halt(): void {
    this.pause();
    this._running = false;
  }

  dispose(): void {
    this.halt();
    for (const track of this._tracks) {
      try {
        track.gain.disconnect();
      } catch (err) {
        console.error(err);
      }
    }
    this._tracks = [];
    this._renderQueue.length = 0;
    this._renderInFlight = false;
    this._chunkRates.clear();
    this._ctx = null;
    this._patchFor = null;
  }

  setTrackEnabled(trackIndex: number, enabled: boolean): void {
    const track = this._tracks.find((t) => t.index === trackIndex);
    if (!track || track.enabled === enabled) return;

    track.enabled = enabled;
    const now = this._ctx!.currentTime;
    track.gain.gain.setValueAtTime(track.gain.gain.value, now);
    track.gain.gain.linearRampToValueAtTime(enabled ? 1 : 0, now + 0.15);
  }

  /** Main-loop maintenance: queue renders for the sliding window, schedule
   *  sources for rendered chunks in (or reaching into) the playback span,
   *  apply drift correction at chunk handoffs, and evict what has played
   *  out. Degrades to the live-voice path if a chunk is still missing past
   *  its grace period. */
  tick(pos: number): void {
    if (!this._running || !this._ctx || this._paused || this._degraded) return;

    const now = this._ctx.currentTime;
    const currentIdx = Math.floor(pos / ACCOMP_CHUNK_SECONDS);

    for (const track of this._tracks) {
      if (!track.enabled) continue;

      for (let i = Math.max(0, currentIdx); i < currentIdx + ACCOMP_WINDOW_CHUNKS; i++) {
        if (!track.chunks.has(i) && !track.queuedRenders.has(i)) {
          track.queuedRenders.add(i);
          this._renderQueue.push({ track, idx: i });
        }
      }

      if (this._checkDegrade(track, pos, currentIdx)) {
        this._degrade();
        return;
      }

      this._scheduleTrack(track, currentIdx, pos, now);
      this._evictTrack(track, pos);
      this._evictRenders(track, currentIdx);
    }

    this._pump();
  }

  private _chunkStart(idx: number): number {
    return idx * ACCOMP_CHUNK_SECONDS;
  }

  private _checkDegrade(track: TrackState, pos: number, currentIdx: number): boolean {
    if (currentIdx < 0) return false;
    const graceAt = this._chunkStart(currentIdx) + DEGRADE_GRACE_SECONDS;
    return pos > graceAt && !track.chunks.has(currentIdx);
  }

  private _degrade(): void {
    this._degraded = true;
    this._renderQueue.length = 0;
    for (const track of this._tracks) track.queuedRenders.clear();
  }

  /** Schedule sources for the current and next chunk of the playback span.
   *  Deliberately only one boundary ahead: each late boundary handoff
   *  measures fresh game/audio drift and sets the NEXT chunk's rate, so
   *  corrections never race playback. Chunk renders still run a full
   *  window ahead. Idempotent via the scheduled map. */
  private _scheduleTrack(track: TrackState, currentIdx: number, pos: number, now: number): void {
    for (let i = Math.max(0, currentIdx); i <= currentIdx + 1; i++) {
      if (track.scheduled.has(i) || track.chunks.get(i) === null) continue;
      const bufferSec = track.bufferSecs.get(i);
      if (bufferSec === undefined) continue;

      const boundarySong = this._chunkStart(i);
      // Chunks already underway catch up at now with a song-time offset;
      // future boundaries schedule at their mapped context time, offset 0.
      const underway = boundarySong < pos;
      const when = underway ? now : this._boundaryCtxTime(track, i, boundarySong, now);
      const offsetSong = underway ? pos - boundarySong : 0;
      if (offsetSong < 0 || boundarySong + bufferSec <= pos) continue;

      const rate = this._handoffRate(track, pos, now);
      const source = this._ctx!.createBufferSource();
      source.buffer = track.chunks.get(i)! as unknown as AudioBuffer;
      source.playbackRate.value = rate;
      source.connect(track.gain);
      source.start(when, offsetSong * rate);

      track.scheduled.set(i, { source, chunkIdx: i, startCtx: when, rate, bufferSec });
    }
  }

  /** Context time when chunk `i`'s content begins: chained off the nearest
   *  earlier scheduled chunk's source (empty chunks in between keep still
   *  flowing at its rate), otherwise off the song-anchor. */
  private _boundaryCtxTime(track: TrackState, idx: number, boundarySong: number, now: number): number {
    for (let j = idx - 1; j >= 0; j--) {
      const prev = track.scheduled.get(j);
      if (!prev) continue;
      return prev.startCtx + (boundarySong - this._chunkStart(prev.chunkIdx)) / prev.rate;
    }

    const mapped = this._anchorCtx + (boundarySong - this._anchorSong);
    return Math.max(mapped, now);
  }

  /** Rate for a chunk's source: drift-corrected off the currently playing
   *  source at handoff (shared across tracks per chunk index). */
  private _handoffRate(track: TrackState, pos: number, now: number): number {
    const idx = Math.floor(pos / ACCOMP_CHUNK_SECONDS);
    const cached = this._chunkRates.get(idx);
    if (cached !== undefined) return cached;

    let rate = 1;
    for (const entry of track.scheduled.values()) {
      const endCtx = entry.startCtx + entry.bufferSec / entry.rate;
      if (entry.startCtx <= now && now < endCtx) {
        const audioPos = this._chunkStart(entry.chunkIdx) + (now - entry.startCtx) * entry.rate;
        rate = driftCorrectionRate(audioPos - pos, ACCOMP_CHUNK_SECONDS);
        break;
      }
    }

    this._chunkRates.set(idx, rate);
    return rate;
  }

  private _evictTrack(track: TrackState, pos: number): void {
    for (const [idx, entry] of track.scheduled) {
      if (pos > this._chunkStart(idx) + entry.bufferSec + ACCOMP_CHUNK_TAIL) {
        track.scheduled.delete(idx);
      }
    }

    // Empty-chunk markers are kept: deleting them would re-queue the
    // (no-op) renders every tick.
    for (const [idx, buffer] of track.chunks) {
      if (buffer === null) continue;
      if (pos > this._chunkStart(idx) + (track.bufferSecs.get(idx) ?? 0) + ACCOMP_CHUNK_TAIL) {
        track.chunks.delete(idx);
        track.bufferSecs.delete(idx);
      }
    }

    this._chunkRates.forEach((_, idx) => {
      if (idx < Math.floor(pos / ACCOMP_CHUNK_SECONDS) - 1) this._chunkRates.delete(idx);
    });
  }

  private _evictRenders(track: TrackState, currentIdx: number): void {
    for (const idx of track.queuedRenders) {
      if (idx < currentIdx) track.queuedRenders.delete(idx);
    }
  }

  private _stopSources(): void {
    const now = this._ctx?.currentTime ?? 0;
    for (const track of this._tracks) {
      for (const entry of track.scheduled.values()) {
        entry.source.stop(now);
      }
      track.scheduled.clear();
    }
  }

  /** Serialize offline renders: one OfflineAudioContext in flight at a time
   *  (each also yields to the event loop between chunks — the main thread
   *  only builds the patch graphs). */
  private _pump(): void {
    if (this._renderInFlight) return;

    const job = this._renderQueue.shift();
    if (!job) return;

    this._renderInFlight = true;
    const proceed = (): void => {
      this._renderInFlight = false;
      this._pump();
    };

    this._renderTrackChunk(job.track, job.idx)
      .then(proceed)
      .catch((err) => {
        if (this._running && !this._degraded) this._degrade();
        console.error(err);
        proceed();
      });
  }

  private async _renderTrackChunk(track: TrackState, idx: number): Promise<void> {
    try {
      const chunkStart = this._chunkStart(idx);
      const notes = selectChunkNotes(track.notes, chunkStart);

      if (notes.length === 0) {
        track.chunks.set(idx, null);
        track.bufferSecs.set(idx, ACCOMP_CHUNK_TAIL);
        return;
      }

      const bufferSec = chunkBufferLengthSec(notes, chunkStart);
      const ctx = this._offlineFactory(bufferSec, this._ctx!.sampleRate);
      const destination = ctx.destination;

      for (const note of notes) {
        const midi = note.rawMidi ?? noteNameToMidi(note.key);
        const patchNote = this._patchFor!(note.program ?? -1, note.channel ?? 0, false)
          .build(ctx as unknown as BaseAudioContext, midiNoteToFrequency(midi), note.time - chunkStart, midi, note.duration);
        patchNote.output.connect(destination);
      }

      const buffer = await ctx.startRendering();
      track.chunks.set(idx, buffer as ChunkBufferLike);
      track.bufferSecs.set(idx, bufferSec);
    } finally {
      track.queuedRenders.delete(idx);
    }
  }
}

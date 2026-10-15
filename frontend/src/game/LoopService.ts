// Manages saved loops (zero or many), the boundary-definition draft
// flow, and the active playback "chain": enabled loops sorted by start
// time, played in sequence with a wrap-back to the first at the end.
//
// Coordinates with Game: Game owns seekTo + resetFromTime; this class
// only decides whether/where to rewind and exposes bounds/scoring
// helpers.

import { LoopDefinitionState } from './Loop.js';

/** One saved loop. `id` is the persisted DB row id; `name` is the
 *  user-facing label (null when unnamed). */
export interface SavedLoop {
  id: number;
  startTime: number;
  endTime: number;
  enabled: boolean;
  name: string | null;
}

/** Fields a caller may change on a saved loop after creation. `id` and
 *  `startTime` are immutable — they identify the row and order the chain. */
export interface LoopUpdates {
  enabled?: boolean;
  endTime?: number;
  name?: string | null;
}

export class LoopService {
  /** All saved loops for the current song, kept sorted by startTime —
   *  the same order the API returns them in — so the management panel
   *  renders rows in time order even for mid-session additions. */
  loops: SavedLoop[] = [];
  /** Position within the active chain. null when not chaining (zero
   *  enabled loops, or chain deliberately not engaged yet). */
  currentIndex: number | null = null;

  /** Draft boundaries from the in-progress define flow. */
  draftStart: number | null = null;
  draftEnd: number | null = null;
  definitionState: LoopDefinitionState = LoopDefinitionState.Off;

  /** Enabled loops, sorted by startTime. Derived from `loops`.
   *  Cached and rebuilt on each mutation: the game loop reads this
   *  getter several times per frame, so it must not filter+sort each
   *  time. Consumers must treat the result as read-only. */
  private _chainCache: SavedLoop[] = [];

  get chain(): readonly SavedLoop[] {
    return this._chainCache;
  }

  /** True when the chain has at least one loop and a currentIndex set. */
  get active(): boolean {
    return this.currentIndex !== null && this.chain.length > 0;
  }

  /** The currently-playing loop, or null when not chaining. */
  get current(): SavedLoop | null {
    const chain = this.chain;
    if (this.currentIndex === null || this.currentIndex < 0 || this.currentIndex >= chain.length) {
      return null;
    }
    return chain[this.currentIndex];
  }

  // -- Single-loop forwarding (kept for Renderer/Game compat) ---------------

  get start(): number | null { return this.current?.startTime ?? null; }
  get end(): number | null { return this.current?.endTime ?? null; }

  /** Row label for management UIs: the saved name, or a positional
   *  default ("Loop N", 1-based in start order) when unnamed. */
  displayName(loop: SavedLoop): string {
    if (loop.name) return loop.name;
    const index = this.loops.findIndex((l) => l.id === loop.id);
    return `Loop ${index + 1}`;
  }

  /** Begin defining a new loop draft. Discards any in-progress draft. */
  beginDefine(): void {
    this.definitionState = LoopDefinitionState.Start;
    this.draftStart = null;
    this.draftEnd = null;
  }

  /** Set draft boundaries during the define flow. Returns the new phase.
   *  Does NOT auto-activate — completing the end boundary just lands the
   *  draft for explicit save by the UI. */
  setBoundary(time: number): LoopDefinitionState {
    if (this.definitionState === LoopDefinitionState.Start) {
      this.draftStart = time;
      this.definitionState = LoopDefinitionState.End;
      return LoopDefinitionState.End;
    }

    if (this.definitionState === LoopDefinitionState.End) {
      if (this.draftStart !== null && time < this.draftStart) {
        this.draftEnd = this.draftStart;
        this.draftStart = time;
      } else {
        this.draftEnd = time;
      }
      this.definitionState = LoopDefinitionState.Off;
      return LoopDefinitionState.Off;
    }
    return this.definitionState;
  }

  /** Abort the draft and return to idle. */
  cancelDraft(): void {
    this.draftStart = null;
    this.draftEnd = null;
    this.definitionState = LoopDefinitionState.Off;
  }

  /** True when a draft has both boundaries picked but not yet saved. */
  get hasDraft(): boolean {
    return this.draftStart !== null && this.draftEnd !== null;
  }

  /** Replace the saved-loop set (used on game start after fetching). */
  setLoops(loops: SavedLoop[]): void {
    this.loops = [...loops].sort((a, b) => a.startTime - b.startTime);
    this._rebuildChain();
  }

  /** Add a freshly-persisted saved loop to the local set. Sort is
   *  stable, so an equal startTime lands after existing ones, matching
   *  the API's id-ascending tiebreak. */
  addLoop(loop: SavedLoop): void {
    this.loops.push(loop);
    this.loops.sort((a, b) => a.startTime - b.startTime);
    if (loop.enabled) this._rebuildChain();
  }

  /** Update a saved loop from a whitelist of fields. Unknown fields and
   *  unknown ids are ignored. The chain is rebuilt once for the whole
   *  change set (`enabled` and endTime affect it; name doesn't, but the
   *  rebuild is a cheap filter+sort over the saved set). */
  updateLoop(id: number, updates: LoopUpdates): void {    const loop = this.loops.find((l) => l.id === id);
    if (!loop) return;

    if (updates.enabled !== undefined) loop.enabled = updates.enabled;
    if (updates.endTime !== undefined) loop.endTime = updates.endTime;
    if (updates.name !== undefined) loop.name = updates.name;

    this._rebuildChain();
  }

  /** Remove a saved loop from the local set. The caller (Game) handles
   *  chain/currentIndex revalidation. */
  remove(id: number): void {
    this.loops = this.loops.filter((l) => l.id !== id);
    this._rebuildChain();
  }

  /** Start time of the next saved loop that begins after `startTime`, as
   *  the exclusive bound for growing that loop: the chain plays loops in
   *  start order, so a loop must never extend into another loop's span.
   *  Disabled loops count too, so re-enabling cannot create overlaps.
   *  null when no loop starts later. */
  nextStartAfter(startTime: number): number | null {
    let next: number | null = null;

    for (const l of this.loops) {
      if (l.startTime <= startTime) continue;
      if (next === null || l.startTime < next) next = l.startTime;
    }

    return next;
  }

  /** Reset all state (fresh game start). */
  clear(): void {
    this.loops = [];
    this.currentIndex = null;
    this.draftStart = null;
    this.draftEnd = null;
    this.definitionState = LoopDefinitionState.Off;
    this._rebuildChain();
  }

  private _rebuildChain(): void {
    this._chainCache = this.loops
      .filter((l) => l.enabled)
      .sort((a, b) => a.startTime - b.startTime);
  }

  /** Advance to the next loop in the chain, wrapping to 0 at the end.
   *  Caller should seekTo the new loop's start. Returns the new current
   *  loop, or null if the chain is empty. */
  advance(): SavedLoop | null {
    const chain = this.chain;
    if (chain.length === 0) {
      this.currentIndex = null;
      return null;
    }
    this.currentIndex = this.currentIndex === null
      ? 0
      : (this.currentIndex + 1) % chain.length;
    return chain[this.currentIndex];
  }

  /** Engage the chain from the first loop. Returns true when engaged. */
  engage(): boolean {
    const chain = this.chain;
    if (chain.length === 0) {
      this.currentIndex = null;
      return false;
    }
    this.currentIndex = 0;
    return true;
  }

  /** Stop chaining (zero enabled loops, or chain deliberately
   *  disengaged). Leaves the saved set intact. */
  disengage(): void {
    this.currentIndex = null;
  }

  /** Snapshot of chain + draft state for rendering. */
  snapshot(): {
    chain: readonly SavedLoop[];
    currentIndex: number | null;
    draftStart: number | null;
    draftEnd: number | null;
    defining: LoopDefinitionState;
  } {
    return {
      chain: this.chain,
      currentIndex: this.currentIndex,
      draftStart: this.draftStart,
      draftEnd: this.draftEnd,
      defining: this.definitionState,
    };
  }
}
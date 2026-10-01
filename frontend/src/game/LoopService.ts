// Manages saved loops (zero or many), the boundary-definition draft
// flow, and the active playback "chain": enabled loops sorted by start
// time, played in sequence with a wrap-back to the first at the end.
//
// Coordinates with Game: Game owns seekTo + resetFromTime; this class
// only decides whether/where to rewind and exposes bounds/scoring
// helpers.

import { LoopDefinitionState } from './Loop.js';

/** One saved loop. `id` is the persisted DB row id. */
export interface SavedLoop {
  id: number;
  startTime: number;
  endTime: number;
  enabled: boolean;
}

export class LoopService {
  /** All saved loops for the current song. Order matches insertion; the
   *  chain re-sorts by startTime on every recompute. */
  loops: SavedLoop[] = [];
  /** Position within the active chain. null when not chaining (zero
   *  enabled loops, or chain deliberately not engaged yet). */
  currentIndex: number | null = null;

  /** Draft boundaries from the in-progress define flow. */
  draftStart: number | null = null;
  draftEnd: number | null = null;
  definitionState: LoopDefinitionState = LoopDefinitionState.Off;

  /** Enabled loops, sorted by startTime. Derived from `loops`.
   *  Cached and rebuilt lazily on mutation: the game loop reads this
   *  getter several times per frame, so it must not filter+sort each
   *  time. */
  private _chainCache: SavedLoop[] = [];

  get chain(): SavedLoop[] {
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
    this.loops = loops;
    this._rebuildChain();
  }

  /** Add a freshly-persisted saved loop to the local set. */
  addLoop(loop: SavedLoop): void {
    this.loops.push(loop);
    if (loop.enabled) this._rebuildChain();
  }

  /** Update a saved loop's enabled flag. The chain and currentIndex are
   *  recomputed by the caller (Game) via engage/disengage/seek as needed. */
  setEnabled(id: number, enabled: boolean): void {
    const loop = this.loops.find((l) => l.id === id);
    if (!loop) return;
    loop.enabled = enabled;
    this._rebuildChain();
  }

  /** Remove a saved loop from the local set. The caller (Game) handles
   *  chain/currentIndex revalidation. */
  remove(id: number): void {
    this.loops = this.loops.filter((l) => l.id !== id);
    this._rebuildChain();
  }

  /** Update a saved loop's end time. */
  setEndTime(id: number, endTime: number): void {
    const loop = this.loops.find((l) => l.id === id);
    if (!loop) return;
    loop.endTime = endTime;
    this._rebuildChain();
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
    chain: SavedLoop[];
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
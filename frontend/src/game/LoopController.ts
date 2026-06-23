import { LoopDefinitionState } from './Loop.js';

export class LoopController {
  start: number | null = null;
  end: number | null = null;
  active = false;
  definitionState: LoopDefinitionState = LoopDefinitionState.Off;

  /** Begin defining a loop. Replaces any previously active/stored loop. */
  beginDefine(): void {
    this.definitionState = LoopDefinitionState.Start;
    this.active = false;
    this.start = null;
    this.end = null;
  }

  /** Set loop boundaries during the define flow. Returns the new phase. */
  setBoundary(time: number): LoopDefinitionState {
    if (this.definitionState === LoopDefinitionState.Start) {
      this.start = time;
      this.definitionState = LoopDefinitionState.End;
      return LoopDefinitionState.End;
    }
    if (this.definitionState === LoopDefinitionState.End) {
      if (this.start !== null && time < this.start) {
        this.end = this.start;
        this.start = time;
      } else {
        this.end = time;
      }
      this.definitionState = LoopDefinitionState.Off;
      this.active = true;
      return LoopDefinitionState.Off;
    }
    return this.definitionState;
  }

  /** Deactivate the loop but keep stored boundaries. */
  deactivate(): void {
    this.active = false;
  }

  /** Clear loop state fully. */
  clear(): void {
    this.start = null;
    this.end = null;
    this.active = false;
    this.definitionState = LoopDefinitionState.Off;
  }

  /** Returns true if the loop should rewind at the given time. */
  shouldRewind(currentTime: number, loopEffectiveEnd: number): boolean {
    return this.active && this.start !== null && this.end !== null && currentTime >= loopEffectiveEnd;
  }

  /** Snapshot of loop state for rendering. */
  snapshot(): { start: number | null; end: number | null; active: boolean; defining: LoopDefinitionState } {
    return { start: this.start, end: this.end, active: this.active, defining: this.definitionState };
  }
}

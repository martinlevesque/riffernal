export interface DebugFrameStats {
  /** rAF delta for this frame (wall seconds). */
  frameDeltaSec: number;
  /** Time spent inside the main-loop body (ms). */
  workMs: number;
  /** Audio-context clock (seconds). */
  audioNow: number;
  /** Wall clock (seconds). */
  wallNow: number;
  /** Game playback position (song seconds). */
  currentTime: number;
  /** Playback speed multiplier. */
  speedMultiplier: number;
  voices: number;
  backgroundVoices: number;
  /** Voices waiting to be built by the scheduler. */
  pendingBuilds: number;
  /** Synth noteOn builds since context init (monotonic). */
  totalBuilds: number;
}

const FRAME_WINDOW = 60;
const DRIFT_WINDOW_SEC = 2;

/** Rolling frame/audio statistics for the debug HUD. Pure math, no DOM —
 *  unit-testable headless. */
export class DebugStatsTracker {
  private _deltas: number[] = [];
  private _workMs: number[] = [];
  private _wallAnchor = -1;
  private _audioAnchor = 0;
  private _buildsAnchor = 0;

  fps = 0;
  avgFrameMs = 0;
  maxFrameMs = 0;
  maxWorkMs = 0;
  driftMsPerSec = 0;
  buildsPerSec = 0;

  /** Absorbs one frame's stats and returns the display lines. */
  update(s: DebugFrameStats): string[] {
    this._deltas.push(s.frameDeltaSec);
    if (this._deltas.length > FRAME_WINDOW) this._deltas.shift();
    this._workMs.push(s.workMs);
    if (this._workMs.length > FRAME_WINDOW) this._workMs.shift();

    let deltaSum = 0;
    let workMax = 0;
    for (let i = 0; i < this._deltas.length; i++) {
      deltaSum += this._deltas[i];
    }
    for (let i = 0; i < this._workMs.length; i++) {
      if (this._workMs[i] > workMax) workMax = this._workMs[i];
    }
    const avgDelta = deltaSum / this._deltas.length;
    this.fps = avgDelta > 0 ? Math.round(1 / avgDelta) : 0;
    this.avgFrameMs = Math.round(avgDelta * 1000 * 10) / 10;
    this.maxFrameMs = Math.max(this.maxFrameMs, Math.round(s.frameDeltaSec * 1000 * 10) / 10);
    this.maxWorkMs = Math.max(this.maxWorkMs, Math.round(workMax * 10) / 10);

    if (this._wallAnchor < 0) {
      this._wallAnchor = s.wallNow;
      this._audioAnchor = s.audioNow;
      this._buildsAnchor = s.totalBuilds;
    } else if (s.wallNow - this._wallAnchor >= DRIFT_WINDOW_SEC) {
      const elapsed = s.wallNow - this._wallAnchor;
      // Positive drift = wall time outgrew audio time = the audio thread
      // consumed less than real time (starved or saturated).
      this.driftMsPerSec = Math.round(((elapsed - (s.audioNow - this._audioAnchor)) * 1000 / elapsed) * 100) / 100;
      this.buildsPerSec = Math.round((s.totalBuilds - this._buildsAnchor) / elapsed);
      this._wallAnchor = s.wallNow;
      this._audioAnchor = s.audioNow;
      this._buildsAnchor = s.totalBuilds;
    }

    return this.lines(s);
  }

  private lines(s: DebugFrameStats): string[] {
    const drift = this.driftMsPerSec >= 0 ? `+${this.driftMsPerSec}` : `${this.driftMsPerSec}`;
    return [
      `fps ${this.fps}  frame ${this.avgFrameMs}ms  max ${this.maxFrameMs}ms`,
      `work max ${this.maxWorkMs}ms`,
      `audio drift ${drift}ms/s  builds ${this.buildsPerSec}/s`,
      `voices ${s.voices} (bg ${s.backgroundVoices})  queue ${s.pendingBuilds}`,
      `t ${s.currentTime.toFixed(2)}s  x${s.speedMultiplier}`,
    ];
  }
}

/** Hidden-by-default overlay showing per-frame diagnostics. Toggled with F8
 *  (or `?debug=1`); used to diagnose gameplay sluggishness on weak
 *  machines — fps/frame/work show where time goes, drift shows whether the
 *  audio thread keeps up, voices/queue show polyphony pressure. */
export class DebugHud {
  visible = false;
  private _tracker = new DebugStatsTracker();
  private _el: HTMLDivElement | null = null;

  toggle(): void {
    this.visible ? this.hide() : this.show();
  }

  show(): void {
    this.visible = true;
    if (!this._el) {
      this._el = document.createElement('div');
      this._el.className = 'pixel-box-inset debug-hud';
      const style = this._el.style;
      style.position = 'fixed';
      style.top = '8px';
      style.left = '8px';
      style.zIndex = '9999';
      style.padding = '6px 10px';
      style.fontFamily = 'monospace';
      style.fontSize = 'var(--fs-smallest)';
      style.lineHeight = '1.5';
      style.whiteSpace = 'pre';
      style.pointerEvents = 'none';
      style.color = '#7fff9f';
      document.body.appendChild(this._el);
    }
    this._el.classList.remove('hidden');
  }

  hide(): void {
    this.visible = false;
    this._el?.classList.add('hidden');
  }

  update(stats: DebugFrameStats): void {
    if (!this.visible || !this._el) return;

    const lines = this._tracker.update(stats);
    this._el.textContent = lines.join('\n');
  }
}

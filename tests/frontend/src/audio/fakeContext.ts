/** Minimal record-only Web Audio stub for bun:test unit specs. Nodes capture
 *  every property, parameter automation event, connection, start and stop so
 *  patch graphs can be asserted without a real AudioContext. */

export interface FakeParamEvent {
  type: 'set' | 'lin' | 'exp' | 'cancel';
  time: number;
  value?: number;
}

export class FakeAudioParam {
  value = 1;
  readonly events: FakeParamEvent[] = [];

  setValueAtTime(value: number, time: number): void {
    this.events.push({ type: 'set', value, time });
  }

  linearRampToValueAtTime(value: number, time: number): void {
    this.events.push({ type: 'lin', value, time });
  }

  exponentialRampToValueAtTime(value: number, time: number): void {
    this.events.push({ type: 'exp', value, time });
  }

  cancelScheduledValues(time: number): void {
    this.events.push({ type: 'cancel', time });
  }

  /** First event with the given type and (absolute) scheduled time. */
  first(type: FakeParamEvent['type'], time: number): FakeParamEvent | null {
    for (const e of this.events) {
      if (e.type === type && e.time === time) return e;
    }
    return null;
  }
}

type FakeNodeKind = 'oscillator' | 'gain' | 'biquadfilter' | 'waveshaper' | 'bufferSource' | 'compressor' | 'destination';

const PARAMS_BY_KIND: Record<FakeNodeKind, string[]> = {
  oscillator: ['frequency', 'detune'],
  gain: ['gain'],
  biquadfilter: ['frequency', 'Q', 'gain'],
  waveshaper: [],
  bufferSource: [],
  compressor: ['threshold', 'knee', 'ratio', 'attack', 'release'],
  destination: [],
};

export class FakeNode {
  readonly kind: FakeNodeKind;
  readonly connections: FakeNode[] = [];
  readonly starts: number[] = [];
  readonly stops: number[] = [];
  // Mutable per-slot params so `node.gain.value = x` style writes stay valid;
  // these DO NOT exist for nodes whose params list is empty.
  [key: string]: unknown;

  constructor(kind: FakeNodeKind) {
    this.kind = kind;

    for (const name of PARAMS_BY_KIND[kind]) {
      this[name] = new FakeAudioParam();
    }
  }

  connect(target: FakeNode): FakeNode {
    this.connections.push(target);
    return target;
  }

  start(time?: number): void {
    this.starts.push(time ?? 0);
  }

  stop(time: number): void {
    this.stops.push(time);
  }
}

export class FakeContext {
  currentTime = 0;
  readonly sampleRate = 48000;
  readonly destination: FakeNode;
  /** Every created node, in creation order. */
  readonly nodes: FakeNode[] = [];

  constructor() {
    this.destination = this.createNode('destination');
  }

  createOscillator(): FakeNode {
    return this.createNode('oscillator');
  }

  createGain(): FakeNode {
    return this.createNode('gain');
  }

  createBiquadFilter(): FakeNode {
    return this.createNode('biquadfilter');
  }

  createWaveShaper(): FakeNode {
    return this.createNode('waveshaper');
  }

  createBufferSource(): FakeNode {
    return this.createNode('bufferSource');
  }

  createDynamicsCompressor(): FakeNode {
    return this.createNode('compressor');
  }

  createBuffer(channels: number, length: number, sampleRate: number): {
    channels: number;
    length: number;
    sampleRate: number;
    getChannelData: (index: number) => Float32Array;
  } {
    return {
      channels,
      length,
      sampleRate,
      getChannelData: () => new Float32Array(length),
    };
  }

  /** Filters the created nodes by kind, in creation order. */
  ofKind(kind: FakeNodeKind): FakeNode[] {
    return this.nodes.filter((n) => n.kind === kind);
  }

  /** The first (optionally kind-scoped) node with any scheduled events, i.e.
   *  the voice's envelope gain. */
  enveloped(kind?: FakeNodeKind): FakeNode {
    for (const n of this.nodes) {
      if (kind !== undefined && n.kind !== kind) continue;
      const params = Object.values(n).filter((v) => v instanceof FakeAudioParam);
      if (params.some((p) => (p as FakeAudioParam).events.length > 0)) return n;
    }
    throw new Error('no envelope-bearing node found — was the note built with gain automation?');
  }

  private createNode(kind: FakeNodeKind): FakeNode {
    const node = new FakeNode(kind);
    this.nodes.push(node);
    return node;
  }
}

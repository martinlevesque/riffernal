declare module 'gifenc' {
  export interface GifWriteFrameOptions {
    palette?: number[][];
    transparent?: boolean;
    transparentIndex?: number;
    delay?: number;
    repeat?: number;
    dispose?: number;
  }

  export interface GifEncoder {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      options?: GifWriteFrameOptions,
    ): void;

    finish(): void;

    bytes(): Uint8Array;
  }

  export function GIFEncoder(options?: {
    auto?: boolean;
    initialCapacity?: number;
  }): GifEncoder;

  export function quantize(
    data: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: { format?: 'rgb565' | 'rgb444' | 'rgba4444' },
  ): number[][];

  export function applyPalette(
    data: Uint8Array | Uint8ClampedArray,
    palette: number[][],
    format?: 'rgb565' | 'rgb444' | 'rgba4444',
  ): Uint8Array;
}

declare module 'pngjs' {
  export interface PngData {
    width: number;
    height: number;
    data: Buffer;
  }

  export class PNG {
    static sync: { read(buffer: Buffer): PngData };

    width: number;

    height: number;

    data: Buffer;
  }
}

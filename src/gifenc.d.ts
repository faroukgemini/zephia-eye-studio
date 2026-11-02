declare module 'gifenc' {
  export interface GifEncoder {
    writeFrame(index: Uint8Array, width: number, height: number, opts?: {
      palette?: number[][]
      delay?: number
      repeat?: number
      transparent?: boolean
      transparentIndex?: number
    }): void
    finish(): void
    bytes(): Uint8Array
  }
  export function GIFEncoder(opts?: { auto?: boolean }): GifEncoder
  export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number, options?: {
    format?: string
    oneBitAlpha?: boolean | number
    clearAlpha?: boolean
  }): number[][]
  export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: number[][], format?: string): Uint8Array
}

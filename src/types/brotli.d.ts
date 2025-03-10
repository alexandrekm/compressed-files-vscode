declare module 'brotli' {
  export function compress(buffer: Buffer | Uint8Array, options?: any): Uint8Array;
  export function decompress(buffer: Buffer | Uint8Array, options?: any): Uint8Array;
}
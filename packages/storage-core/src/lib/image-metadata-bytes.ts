/**
 * Shared types and byte helpers for the JPEG, PNG and WebP metadata
 * strippers. Framework-independent.
 */

export type StrippableImageFormat = 'jpeg' | 'png' | 'webp';

export type ImageMetadataStripResult =
  | {
      ok: true;
      format: StrippableImageFormat;
      bytes: Uint8Array;
      /** False when the input carried nothing to remove (bytes are the input). */
      changed: boolean;
      /** Segments or chunks dropped or rewritten, plus one for trailing bytes. */
      removed: number;
    }
  | { ok: false; reason: 'unsupported' | 'malformed' };

export const MALFORMED = { ok: false, reason: 'malformed' } as const;

/**
 * Upper bound on dropped or rewritten blocks in one file. Camera and editor
 * output carries a few dozen at most; a file built from millions of tiny
 * blocks is rejected instead of being rebuilt piece by piece.
 */
export const MAX_REMOVED_BLOCKS = 4096;

export function fourcc(input: Uint8Array, offset: number) {
  if (offset + 4 > input.length) return '';
  return String.fromCharCode(
    input[offset]!,
    input[offset + 1]!,
    input[offset + 2]!,
    input[offset + 3]!
  );
}

export function concat(parts: readonly Uint8Array[]) {
  let length = 0;
  for (const part of parts) length += part.length;
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

/**
 * Output assembled from ranges of the input and inserted blocks. Adjacent
 * kept ranges merge, so the number of parts grows only with removals and
 * insertions, never with the number of blocks kept.
 */
export class ByteRanges {
  private readonly parts: Uint8Array[] = [];
  private start = -1;
  private end = -1;

  constructor(private readonly input: Uint8Array) {}

  keep(start: number, end: number) {
    if (start >= end) return;
    if (this.end === start) {
      this.end = end;
      return;
    }
    this.flush();
    this.start = start;
    this.end = end;
  }

  insert(bytes: Uint8Array) {
    this.flush();
    this.parts.push(bytes);
  }

  /** A boundary that a later `insertAt` can target. */
  mark() {
    this.flush();
    return this.parts.length;
  }

  insertAt(boundary: number, bytes: Uint8Array) {
    this.flush();
    this.parts.splice(boundary, 0, bytes);
  }

  bytes() {
    this.flush();
    return concat(this.parts);
  }

  private flush() {
    if (this.start < 0) return;
    this.parts.push(this.input.subarray(this.start, this.end));
    this.start = -1;
    this.end = -1;
  }
}

export function done(
  format: StrippableImageFormat,
  input: Uint8Array,
  output: () => Uint8Array,
  removed: number
): ImageMetadataStripResult {
  if (removed === 0) {
    return { ok: true, format, bytes: input, changed: false, removed: 0 };
  }
  return { ok: true, format, bytes: output(), changed: true, removed };
}

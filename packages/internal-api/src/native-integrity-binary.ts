import { Decoder } from 'cbor-x';
import { z } from 'zod';

export function decodeBase64(value: string, maxBytes: number): Buffer {
  if (
    typeof value !== 'string' ||
    value.length > Math.ceil((maxBytes * 4) / 3) + 4 ||
    !/^[A-Za-z0-9+/_-]+={0,2}$/.test(value)
  )
    throw new Error('invalid-binary');
  const bytes = Buffer.from(value, 'base64');
  if (
    !bytes.length ||
    bytes.length > maxBytes ||
    value.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_') !==
      bytes.toString('base64url')
  )
    throw new Error('invalid-binary');
  return bytes;
}
export function decodeHash(value: string): Buffer {
  const bytes = decodeBase64(value, 32);
  if (bytes.length !== 32) throw new Error('invalid-hash');
  return bytes;
}

/** Reject allocation bombs, indefinite containers, tags and deep objects before decoding. */
export function readIntegrityCbor(bytes: Buffer): {
  value: unknown;
  byteLength: number;
} {
  let position = 0;
  let nodes = 0;
  const walk = (depth: number) => {
    if (++nodes > 128 || depth > 8 || position >= bytes.length)
      throw new Error('invalid-cbor');
    const initial = bytes[position++];
    if (initial === undefined) throw new Error('invalid-cbor');
    const major = initial >> 5;
    const additional = initial & 31;
    let size = additional;
    if (additional >= 24) {
      const width = 2 ** (additional - 24);
      if (width > 4 || position + width > bytes.length)
        throw new Error('invalid-cbor');
      size = bytes.readUIntBE(position, width);
      position += width;
    }
    if (major === 0 || major === 1 || (major === 7 && additional <= 23)) return;
    if (major === 2 || major === 3) {
      if (size > 32_768 || position + size > bytes.length)
        throw new Error('invalid-cbor');
      position += size;
    } else if (major === 4 || major === 5) {
      if (size > 32) throw new Error('invalid-cbor');
      for (let index = 0; index < size * (major === 5 ? 2 : 1); index++)
        walk(depth + 1);
    } else throw new Error('invalid-cbor');
  };
  walk(0);
  return {
    value: new Decoder({ mapsAsObjects: true, useRecords: false }).decode(
      bytes.subarray(0, position)
    ),
    byteLength: position,
  };
}
export function decodeIntegrityCbor(bytes: Buffer): unknown {
  const result = readIntegrityCbor(bytes);
  if (result.byteLength !== bytes.length) throw new Error('invalid-cbor');
  return result.value;
}
export const integrityBytesSchema = z
  .instanceof(Uint8Array)
  .transform((value) => Buffer.from(value));

type DerNode = { tag: number; value: Buffer; children: DerNode[] };
export function parseIntegrityDer(bytes: Buffer, depth = 0): DerNode[] {
  if (depth > 12 || bytes.length > 16_384) throw new Error('invalid-der');
  let offset = 0;
  const nodes: DerNode[] = [];
  while (offset < bytes.length) {
    if (nodes.length >= 128) throw new Error('invalid-der');
    const tag = bytes[offset++];
    const initial = bytes[offset++];
    if (tag === undefined || initial === undefined)
      throw new Error('invalid-der');
    let length = initial;
    if (initial & 128) {
      const width = initial & 127;
      if (!width || width > 3 || offset + width > bytes.length)
        throw new Error('invalid-der');
      length = bytes.readUIntBE(offset, width);
      offset += width;
    }
    if (offset + length > bytes.length) throw new Error('invalid-der');
    const value = bytes.subarray(offset, offset + length);
    offset += length;
    nodes.push({
      tag,
      value,
      children: tag & 32 ? parseIntegrityDer(value, depth + 1) : [],
    });
  }
  return nodes;
}

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  buildOrientationTiff,
  EXIF_HEADER,
  readExifOrientation,
  readTiffOrientation,
} from './image-metadata-exif';
import {
  type ImageMetadataStripResult,
  sniffImageFormat,
  stripImageMetadata,
} from './image-metadata-strip';
import {
  PLAIN_JPEG,
  PLAIN_PNG,
  PLAIN_WEBP,
  TAGGED_JPEG,
  TAGGED_PNG,
  TAGGED_WEBP,
} from './image-metadata-strip.fixtures';

const LEAKS = ['TestCam', 'SerialABC123', 'SecretCity', 'xmpmeta', 'adobe'];
const ALL = [
  TAGGED_JPEG,
  TAGGED_PNG,
  TAGGED_WEBP,
  PLAIN_JPEG,
  PLAIN_PNG,
  PLAIN_WEBP,
];

function stripped(input: Uint8Array) {
  const result = stripImageMetadata(input);
  if (!result.ok) throw new Error(`strip failed: ${result.reason}`);
  return result;
}

function latin1(bytes: Uint8Array) {
  return Buffer.from(bytes).toString('latin1');
}

function concat(...parts: Uint8Array[]) {
  return new Uint8Array(Buffer.concat(parts));
}

/** JPEG marker sequence up to the first scan, with each APP1's orientation. */
function jpegMarkers(bytes: Uint8Array) {
  const markers: string[] = [];
  let position = 2;
  while (position + 4 <= bytes.length) {
    const marker = bytes[position + 1]!;
    const length = (bytes[position + 2]! << 8) | bytes[position + 3]!;
    const payload = bytes.subarray(position + 4, position + 2 + length);
    markers.push(
      marker === 0xe1
        ? `APP1:orientation=${readExifOrientation(payload)}:${payload.length}`
        : marker.toString(16)
    );
    if (marker === 0xda) break;
    position += 2 + length;
  }
  return markers;
}

function chunkTypes(bytes: Uint8Array, start: number, littleEndian: boolean) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const types: string[] = [];
  let position = start;
  while (position + 8 <= bytes.length) {
    const size = littleEndian
      ? view.getUint32(position + 4, true)
      : view.getUint32(position);
    const type = littleEndian
      ? latin1(bytes.subarray(position, position + 4))
      : latin1(bytes.subarray(position + 4, position + 8));
    types.push(type);
    position += littleEndian ? 8 + size + (size & 1) : 12 + size;
  }
  return types;
}

function jpegSegment(marker: number, payload: Uint8Array) {
  const length = payload.length + 2;
  return concat(
    Uint8Array.of(0xff, marker, length >> 8, length & 0xff),
    payload
  );
}

describe('sniffImageFormat', () => {
  it('reads magic bytes, not names or declared types', () => {
    expect(sniffImageFormat(TAGGED_JPEG)).toBe('jpeg');
    expect(sniffImageFormat(TAGGED_PNG)).toBe('png');
    expect(sniffImageFormat(TAGGED_WEBP)).toBe('webp');
    expect(sniffImageFormat(new TextEncoder().encode('GIF89a...'))).toBe('gif');
    expect(sniffImageFormat(new TextEncoder().encode('<svg/>'))).toBeNull();
    expect(sniffImageFormat(new Uint8Array())).toBeNull();
  });
});

describe('stripImageMetadata', () => {
  it('removes EXIF, GPS and XMP from JPEG and keeps ICC and orientation', () => {
    const result = stripped(TAGGED_JPEG);
    const text = latin1(result.bytes);
    for (const leak of LEAKS) expect(text).not.toContain(leak);
    expect(jpegMarkers(TAGGED_JPEG)).toContain('e2');
    expect(jpegMarkers(result.bytes)).toEqual([
      'APP1:orientation=6:32',
      'e2',
      'db',
      'db',
      'c0',
      'c4',
      'c4',
      'c4',
      'c4',
      'da',
    ]);
    expect(text).toContain('ICC_PROFILE');
    expect(result).toMatchObject({ changed: true, format: 'jpeg', removed: 2 });
    expect(result.bytes.length).toBeLessThan(TAGGED_JPEG.length);
  });

  it('removes eXIf and zTXt from PNG and keeps iCCP and orientation', () => {
    const result = stripped(TAGGED_PNG);
    const text = latin1(result.bytes);
    for (const leak of LEAKS) expect(text).not.toContain(leak);
    expect(chunkTypes(TAGGED_PNG, 8, false)).toEqual(
      expect.arrayContaining(['eXIf', 'zTXt'])
    );
    expect(chunkTypes(result.bytes, 8, false)).toEqual([
      'IHDR',
      'eXIf',
      'iCCP',
      'pHYs',
      'IDAT',
      'IEND',
    ]);
    const exif = result.bytes.subarray(41, 41 + 26);
    expect(readTiffOrientation(exif)).toBe(6);
  });

  it('removes EXIF and XMP from WebP, clears the XMP flag and keeps ICC', () => {
    const result = stripped(TAGGED_WEBP);
    const text = latin1(result.bytes);
    for (const leak of LEAKS) expect(text).not.toContain(leak);
    expect(chunkTypes(TAGGED_WEBP, 12, true)).toEqual(
      expect.arrayContaining(['EXIF', 'XMP '])
    );
    expect(chunkTypes(result.bytes, 12, true)).toEqual([
      'VP8X',
      'ICCP',
      'VP8 ',
      'EXIF',
    ]);
    const flags = result.bytes[20]!;
    expect(flags & 0x04).toBe(0);
    expect(flags & 0x08).toBe(0x08);
    expect(flags & 0x20).toBe(0x20);
    const view = new DataView(result.bytes.buffer, result.bytes.byteOffset);
    expect(view.getUint32(4, true)).toBe(result.bytes.length - 8);
  });

  it('returns metadata-free images unchanged', () => {
    for (const input of [PLAIN_JPEG, PLAIN_PNG, PLAIN_WEBP]) {
      const result = stripped(input);
      expect(result.changed).toBe(false);
      expect(result.bytes).toBe(input);
    }
  });

  it('is idempotent, including the orientation block it writes', () => {
    for (const input of ALL) {
      const once = stripped(input);
      const twice = stripped(once.bytes);
      expect(twice.changed).toBe(false);
      expect(twice.bytes).toEqual(once.bytes);
    }
  });

  it('writes no orientation block for the default orientation', () => {
    const exif = concat(EXIF_HEADER, buildOrientationTiff(1));
    const extra = new TextEncoder().encode('Model: SerialABC123');
    const input = concat(
      PLAIN_JPEG.subarray(0, 2),
      jpegSegment(0xe1, concat(exif, extra)),
      PLAIN_JPEG.subarray(2)
    );
    const result = stripped(input);
    expect(result.bytes).toEqual(PLAIN_JPEG);
  });

  it('drops comments, IPTC, MPF and bytes after the end marker', () => {
    const secret = new TextEncoder().encode('SerialABC123');
    const input = concat(
      PLAIN_JPEG.subarray(0, 2),
      jpegSegment(0xfe, secret),
      jpegSegment(0xed, secret),
      jpegSegment(0xe2, concat(new TextEncoder().encode('MPF\0'), secret)),
      PLAIN_JPEG.subarray(2),
      secret
    );
    const result = stripped(input);
    expect(result.removed).toBe(4);
    expect(result.bytes).toEqual(PLAIN_JPEG);
  });

  it('keeps the JFIF header but drops its thumbnail', () => {
    const jfif = Uint8Array.of(
      0x4a,
      0x46,
      0x49,
      0x46,
      0,
      1,
      2,
      0,
      0,
      1,
      0,
      1,
      2,
      1
    );
    const thumbnail = new Uint8Array(2 * 1 * 3).fill(0x7f);
    const input = concat(
      PLAIN_JPEG.subarray(0, 2),
      jpegSegment(0xe0, concat(jfif, thumbnail)),
      PLAIN_JPEG.subarray(2)
    );
    const result = stripped(input);
    const header = jfif.slice();
    header[12] = 0;
    header[13] = 0;
    expect(result.bytes).toEqual(
      concat(
        PLAIN_JPEG.subarray(0, 2),
        jpegSegment(0xe0, header),
        PLAIN_JPEG.subarray(2)
      )
    );
    expect(stripped(result.bytes).changed).toBe(false);
  });

  it('drops non-JFIF APP0 blocks and rejects JPEG extension markers', () => {
    const secret = new TextEncoder().encode('JFXX SerialABC123');
    const withJfxx = concat(
      PLAIN_JPEG.subarray(0, 2),
      jpegSegment(0xe0, secret),
      PLAIN_JPEG.subarray(2)
    );
    expect(stripped(withJfxx).bytes).toEqual(PLAIN_JPEG);
    for (const marker of [0xc8, 0xf0, 0xf7, 0xfd]) {
      const input = concat(
        PLAIN_JPEG.subarray(0, 2),
        jpegSegment(marker, secret),
        PLAIN_JPEG.subarray(2)
      );
      expect(stripImageMetadata(input)).toEqual({
        ok: false,
        reason: 'malformed',
      });
    }
  });

  it('drops PNG text chunks and bytes after IEND', () => {
    const tail = new TextEncoder().encode('SerialABC123');
    const result = stripped(concat(PLAIN_PNG, tail));
    expect(result.bytes).toEqual(PLAIN_PNG);
  });

  it('drops bytes past the RIFF size', () => {
    const tail = new TextEncoder().encode('SerialABC123');
    const result = stripped(concat(PLAIN_WEBP, tail));
    expect(result.bytes).toEqual(PLAIN_WEBP);
  });

  it('fails closed on inconsistent containers', () => {
    const malformed: Uint8Array[] = [
      TAGGED_JPEG.subarray(0, 10),
      concat(PLAIN_JPEG.subarray(0, 2), Uint8Array.of(0xff, 0xe1, 0xff, 0xff)),
      concat(PLAIN_JPEG.subarray(0, 2), Uint8Array.of(0xff, 0x00)),
      TAGGED_JPEG.subarray(0, 372),
      PLAIN_PNG.subarray(0, PLAIN_PNG.length - 12),
      concat(PLAIN_PNG.subarray(0, 8), PLAIN_PNG.subarray(33)),
    ];
    const badRiff = PLAIN_WEBP.slice();
    new DataView(badRiff.buffer).setUint32(4, 1_000_000, true);
    malformed.push(badRiff);
    for (const input of malformed) {
      expect(stripImageMetadata(input)).toEqual({
        ok: false,
        reason: 'malformed',
      });
    }
  });

  it('leaves unsupported formats to the caller', () => {
    expect(
      stripImageMetadata(new TextEncoder().encode('GIF89a\x01\x00'))
    ).toEqual({ ok: false, reason: 'unsupported' });
  });
});

describe('stripImageMetadata hardening', () => {
  const secret = new TextEncoder().encode('SerialABC123');

  function pngChunk(type: string, data: Uint8Array) {
    const chunk = new Uint8Array(12 + data.length);
    const view = new DataView(chunk.buffer);
    view.setUint32(0, data.length);
    chunk.set(new TextEncoder().encode(type), 4);
    chunk.set(data, 8);
    return chunk; // CRC is not checked by the stripper.
  }

  function withPngChunk(chunk: Uint8Array) {
    return concat(PLAIN_PNG.subarray(0, 33), chunk, PLAIN_PNG.subarray(33));
  }

  it('treats any SOI as a JPEG candidate and refuses one that does not parse', () => {
    const odd = concat(
      Uint8Array.of(0xff, 0xd8, 0, 0),
      TAGGED_JPEG.subarray(2)
    );
    expect(sniffImageFormat(odd)).toBe('jpeg');
    expect(stripImageMetadata(odd)).toEqual({ ok: false, reason: 'malformed' });
  });

  it('keeps both spellings of the PNG HDR chunks', () => {
    for (const [type, size] of [
      ['cLLI', 8],
      ['cLLi', 8],
      ['mDCV', 24],
      ['mDCv', 24],
    ] as const) {
      const input = withPngChunk(pngChunk(type, new Uint8Array(size)));
      expect(stripped(input).changed).toBe(false);
    }
  });

  it('requires a JPEG end marker', () => {
    expect(stripImageMetadata(PLAIN_JPEG.subarray(0, -2))).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });

  it('clamps the Adobe header and rejects an oversized DRI', () => {
    const adobe = concat(
      new TextEncoder().encode('Adobe'),
      Uint8Array.of(0, 100, 0, 0, 0, 0, 1)
    );
    const result = stripped(
      concat(
        PLAIN_JPEG.subarray(0, 2),
        jpegSegment(0xee, concat(adobe, secret)),
        PLAIN_JPEG.subarray(2)
      )
    );
    expect(latin1(result.bytes)).not.toContain('SerialABC123');
    expect(result.bytes).toEqual(
      concat(
        PLAIN_JPEG.subarray(0, 2),
        jpegSegment(0xee, adobe),
        PLAIN_JPEG.subarray(2)
      )
    );
    expect(
      stripImageMetadata(
        concat(
          PLAIN_JPEG.subarray(0, 2),
          jpegSegment(0xdd, concat(Uint8Array.of(0, 4), secret)),
          PLAIN_JPEG.subarray(2)
        )
      )
    ).toEqual({ ok: false, reason: 'malformed' });
  });

  it('writes the orientation block after a JFIF header that follows EXIF', () => {
    const jfif = Uint8Array.of(
      0x4a,
      0x46,
      0x49,
      0x46,
      0,
      1,
      2,
      0,
      0,
      1,
      0,
      1,
      0,
      0
    );
    const exif = concat(EXIF_HEADER, buildOrientationTiff(6), secret);
    const result = stripped(
      concat(
        PLAIN_JPEG.subarray(0, 2),
        jpegSegment(0xe1, exif),
        jpegSegment(0xe0, jfif),
        PLAIN_JPEG.subarray(2)
      )
    );
    expect(jpegMarkers(result.bytes).slice(0, 2)).toEqual([
      'e0',
      'APP1:orientation=6:32',
    ]);
  });

  it('rejects PNG data hidden in IEND or unknown critical chunks', () => {
    const iend = PLAIN_PNG.slice(0, -12);
    expect(stripImageMetadata(concat(iend, pngChunk('IEND', secret)))).toEqual({
      ok: false,
      reason: 'malformed',
    });
    expect(stripImageMetadata(withPngChunk(pngChunk('ZZZZ', secret)))).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });

  it('drops named palettes and fixed-size chunks with extra data', () => {
    for (const chunk of [
      pngChunk('sPLT', concat(secret, Uint8Array.of(0, 8))),
      pngChunk('pHYs', concat(new Uint8Array(9), secret)),
      pngChunk('gAMA', concat(new Uint8Array(4), secret)),
    ]) {
      const result = stripped(withPngChunk(chunk));
      expect(result.bytes).toEqual(PLAIN_PNG);
    }
  });

  it('rejects WebP animation frames that carry metadata chunks', () => {
    const view = new DataView(PLAIN_WEBP.buffer, PLAIN_WEBP.byteOffset);
    const vp8Size = view.getUint32(16, true);
    const vp8 = PLAIN_WEBP.subarray(12, 20 + vp8Size + (vp8Size & 1));
    const exif = concat(
      new TextEncoder().encode('EXIF'),
      Uint8Array.of(12, 0, 0, 0),
      secret
    );
    const frame = concat(new Uint8Array(16), vp8, exif);
    const anmf = concat(
      new TextEncoder().encode('ANMF'),
      Uint8Array.of(frame.length & 0xff, frame.length >> 8, 0, 0),
      frame
    );
    const vp8x = concat(
      new TextEncoder().encode('VP8X'),
      Uint8Array.of(10, 0, 0, 0, 0x02, 0, 0, 0, 15, 0, 0, 7, 0, 0)
    );
    const body = concat(new TextEncoder().encode('WEBP'), vp8x, anmf);
    const riff = concat(
      new TextEncoder().encode('RIFF'),
      Uint8Array.of(body.length & 0xff, (body.length >> 8) & 0xff, 0, 0),
      body
    );
    expect(stripImageMetadata(riff)).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });

  it('bounds work on files built from huge numbers of tiny blocks', () => {
    const markers = new Uint8Array(12 * 1024 * 1024);
    for (let index = 0; index < markers.length; index += 2) {
      markers[index] = 0xff;
      markers[index + 1] = 0x01;
    }
    const standalone = concat(PLAIN_JPEG.subarray(0, 2), markers);
    expect(stripImageMetadata(standalone)).toEqual({
      ok: false,
      reason: 'malformed',
    });

    const comments = Array.from({ length: 5000 }, () =>
      jpegSegment(0xfe, Uint8Array.of(0x41))
    );
    expect(
      stripImageMetadata(
        concat(PLAIN_JPEG.subarray(0, 2), ...comments, PLAIN_JPEG.subarray(2))
      )
    ).toEqual({ ok: false, reason: 'malformed' });

    // Many kept chunks are fine: they coalesce into one output range.
    const idat = pngChunk('IDAT', new Uint8Array());
    const many = new Uint8Array(Buffer.concat(Array(200_000).fill(idat)));
    const started = performance.now();
    const result = stripImageMetadata(
      concat(
        PLAIN_PNG.subarray(0, 33),
        many,
        pngChunk('tEXt', secret),
        PLAIN_PNG.subarray(33)
      )
    );
    expect(result).toMatchObject({ ok: true, changed: true, removed: 1 });
    expect(performance.now() - started).toBeLessThan(2000);
  });
});

describe('stripImageMetadata properties', () => {
  const mutated = fc
    .tuple(
      fc.constantFrom(...ALL),
      fc.array(fc.tuple(fc.nat(), fc.integer({ min: 0, max: 255 })), {
        maxLength: 8,
      }),
      fc.option(fc.nat(), { nil: undefined })
    )
    .map(([fixture, flips, cut]) => {
      const bytes = fixture.slice(
        0,
        cut === undefined ? undefined : cut % (fixture.length + 1)
      );
      for (const [index, value] of flips) {
        if (bytes.length > 0) bytes[index % bytes.length] = value;
      }
      return bytes;
    });

  function checkOk(input: Uint8Array, result: ImageMetadataStripResult) {
    if (!result.ok) return;
    expect(result.bytes.length).toBeLessThanOrEqual(input.length + 34);
    const again = stripImageMetadata(result.bytes);
    expect(again).toMatchObject({ ok: true, changed: false });
  }

  it('never throws on arbitrary bytes', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 512 }), (input) => {
        checkOk(input, stripImageMetadata(input));
      }),
      { numRuns: 2000 }
    );
  });

  it('never throws on corrupted images, and stripped output is stable', () => {
    fc.assert(
      fc.property(mutated, (input) => {
        checkOk(input, stripImageMetadata(input));
      }),
      { numRuns: 3000 }
    );
  });

  it('never keeps injected metadata segments', () => {
    const marker = fc.constantFrom(0xe1, 0xe3, 0xe9, 0xed, 0xef, 0xfe);
    fc.assert(
      fc.property(
        fc.array(fc.tuple(marker, fc.uint8Array({ maxLength: 64 })), {
          minLength: 1,
          maxLength: 6,
        }),
        (segments) => {
          const secret = new TextEncoder().encode('SerialABC123');
          const input = concat(
            PLAIN_JPEG.subarray(0, 2),
            ...segments.map(([code, payload]) =>
              jpegSegment(code, concat(secret, payload))
            ),
            PLAIN_JPEG.subarray(2)
          );
          const result = stripped(input);
          expect(latin1(result.bytes)).not.toContain('SerialABC123');
          expect(result.bytes).toEqual(PLAIN_JPEG);
        }
      ),
      { numRuns: 500 }
    );
  });
});

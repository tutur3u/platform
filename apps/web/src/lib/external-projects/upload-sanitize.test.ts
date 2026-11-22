import { createHash } from 'node:crypto';
import {
  PLAIN_PNG,
  TAGGED_JPEG,
  TAGGED_PNG,
  TAGGED_WEBP,
} from '@tuturuuu/storage-core/image-metadata-strip.fixtures';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import {
  mayCarryImage,
  sanitizeExternalProjectUpload,
} from './upload-sanitize';

vi.mock('server-only', () => ({}));

const sha256 = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');

function sanitized(input: Uint8Array) {
  const result = sanitizeExternalProjectUpload(input);
  if (!result.ok) throw new Error(result.reason);
  return result;
}

describe('sanitizeExternalProjectUpload', () => {
  it.each([
    ['jpeg', TAGGED_JPEG],
    ['png', TAGGED_PNG],
    ['webp', TAGGED_WEBP],
  ])(
    'strips %s metadata and keeps a decodable, upright image',
    async (_, input) => {
      const result = sanitized(input);
      const metadata = await sharp(Buffer.from(result.bytes)).metadata();

      expect(result.metadataStripped).toBe(true);
      expect(result.contentSha256).toBe(sha256(result.bytes));
      expect(metadata).toMatchObject({ width: 16, height: 8, orientation: 6 });
      expect(metadata.icc).toBeDefined();
      expect(metadata.xmp).toBeUndefined();
      expect(Buffer.from(result.bytes).toString('latin1')).not.toMatch(
        /SerialABC123|TestCam|SecretCity/
      );
      const exif = metadata.exif ? Buffer.from(metadata.exif) : Buffer.alloc(0);
      expect(exif.byteLength).toBeLessThanOrEqual(32);
      await expect(
        sharp(Buffer.from(result.bytes)).raw().toBuffer()
      ).resolves.toHaveLength(16 * 8 * 3);
    }
  );

  it('decides by the bytes, not the declared type', () => {
    // The signature takes no declared type: a JPEG labelled anything is stripped.
    expect(sanitized(TAGGED_JPEG).metadataStripped).toBe(true);
  });

  it('stores other formats as received', () => {
    const wav = new TextEncoder().encode('RIFF\u0004\u0000\u0000\u0000WAVE');
    const result = sanitized(wav);
    expect(result.bytes).toBe(wav);
    expect(result.metadataStripped).toBe(false);
    expect(result.contentSha256).toBe(sha256(wav));
  });

  it('keeps clean images byte-identical', () => {
    const result = sanitized(PLAIN_PNG);
    expect(result.bytes).toBe(PLAIN_PNG);
    expect(result.metadataStripped).toBe(false);
  });

  it('refuses an image that does not parse and logs only the reason', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(sanitizeExternalProjectUpload(TAGGED_JPEG.subarray(0, 10))).toEqual({
      ok: false,
      reason: 'malformed_image',
    });
    expect(warn).toHaveBeenCalledWith('External project upload image refused', {
      format: 'jpeg',
      reason: 'malformed',
    });
    warn.mockRestore();
  });
});

describe('mayCarryImage', () => {
  it.each([
    [{ contentType: 'image/jpeg' }, true],
    [{ contentType: 'image/jpg' }, true],
    [{ contentType: 'IMAGE/WEBP; q=1' }, true],
    [{ filename: 'photo.JPG' }, true],
    [{ contentType: 'application/octet-stream', filename: 'a.jpeg' }, true],
    [{ contentType: '', filename: 'scan.png' }, true],
    [{ contentType: 'image/gif' }, true],
    [{ contentType: 'application/octet-stream', filename: 'anim.gif' }, true],
    [{ filename: 'photo.HEIC' }, true],
    [{ contentType: 'audio/wav', filename: 'voice.wav' }, false],
    [{ filename: 'archive.zip' }, false],
    [{}, false],
  ])('%o -> %s', (input, expected) => {
    expect(mayCarryImage(input)).toBe(expected);
  });
});

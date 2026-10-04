import {
  type ProfileMediaKind,
  ProfileUploadError,
} from '@tuturuuu/storage-core/profile-upload-budget';
import sharp from 'sharp';

export const PROFILE_MEDIA_OUTPUT_BYTES = {
  avatar: 1_000_000,
  banner: 2_000_000,
} as const;
const dimensions = { avatar: [1024, 1024], banner: [2560, 1440] } as const;
const supportedFormats = new Set(['jpeg', 'png', 'webp', 'gif']);

// Inspect magic bytes before passing untrusted input to the native decoder.
function isRasterImage(input: Buffer) {
  return (
    input.subarray(0, 3).equals(Buffer.from([255, 216, 255])) ||
    input
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    ['GIF87a', 'GIF89a'].includes(input.subarray(0, 6).toString('ascii')) ||
    (input.subarray(0, 4).toString('ascii') === 'RIFF' &&
      input.subarray(8, 12).toString('ascii') === 'WEBP')
  );
}

/** Static, oriented, metadata-free artwork. Never persist the original bytes. */
export async function optimizeProfileMedia(
  input: Buffer,
  kind: ProfileMediaKind
) {
  if (!isRasterImage(input))
    throw new ProfileUploadError('Invalid profile image', 400);
  const image = sharp(input, {
    limitInputPixels: 20_000_000,
    failOn: 'warning',
    pages: 1,
  });
  try {
    const metadata = await image.metadata();
    if (!metadata.format || !supportedFormats.has(metadata.format))
      throw new ProfileUploadError('Unsupported profile image', 400);
    const [width, height] = dimensions[kind];
    for (const scale of [1, 0.7]) {
      for (const quality of [85, 72, 60]) {
        const output = await image
          .clone()
          .rotate()
          .resize({
            width: Math.round(width * scale),
            height: Math.round(height * scale),
            fit: 'inside',
            withoutEnlargement: true,
          })
          .webp({ quality, effort: 4 })
          .timeout({ seconds: 3 })
          .toBuffer();
        if (output.length <= PROFILE_MEDIA_OUTPUT_BYTES[kind]) return output;
      }
    }
    throw new ProfileUploadError('Optimized image exceeds the size limit', 413);
  } catch (error) {
    if (error instanceof ProfileUploadError) throw error;
    throw new ProfileUploadError(
      'Invalid or excessively complex profile image',
      400
    );
  } finally {
    image.destroy();
  }
}

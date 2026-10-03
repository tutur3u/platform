export type ProfileMediaKind = 'avatar' | 'banner';
export const PROFILE_MEDIA_SOURCE_BYTES = {
  avatar: 2 * 1024 ** 2,
  banner: 5 * 1024 ** 2,
} as const;
export const PROFILE_MEDIA_OUTPUT_BYTES = {
  avatar: 1_000_000,
  banner: 2_000_000,
} as const;

/** Browser optimization before transport; the server independently verifies/re-encodes. */
export async function optimizeProfileMediaFile(
  file: File,
  kind: ProfileMediaKind
): Promise<File> {
  if (
    !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(
      file.type
    ) ||
    !file.size ||
    file.size > PROFILE_MEDIA_SOURCE_BYTES[kind]
  )
    throw new Error('Invalid profile image');
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Invalid profile image'));
      image.src = url;
    });
    if (
      !image.naturalWidth ||
      !image.naturalHeight ||
      image.naturalWidth * image.naturalHeight > 20_000_000
    )
      throw new Error('Invalid profile image');
    const width = kind === 'avatar' ? 1024 : 2560;
    const height = kind === 'avatar' ? 1024 : 1440;
    const ratio = Math.min(
      1,
      width / image.naturalWidth,
      height / image.naturalHeight
    );
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image optimization unavailable');
    for (const scale of [1, 0.7, 0.49]) {
      canvas.width = Math.max(
        1,
        Math.round(image.naturalWidth * ratio * scale)
      );
      canvas.height = Math.max(
        1,
        Math.round(image.naturalHeight * ratio * scale)
      );
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.85, 0.72, 0.6]) {
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, 'image/webp', quality)
        );
        if (!blob) throw new Error('Image optimization unavailable');
        if (blob.size <= PROFILE_MEDIA_OUTPUT_BYTES[kind]) {
          const extension =
            blob.type === 'image/webp'
              ? 'webp'
              : blob.type === 'image/jpeg'
                ? 'jpg'
                : 'png';
          return new File([blob], `${kind}.${extension}`, { type: blob.type });
        }
      }
    }
    throw new Error('Optimized image exceeds the size limit');
  } finally {
    image.onload = null;
    image.onerror = null;
    URL.revokeObjectURL(url);
  }
}

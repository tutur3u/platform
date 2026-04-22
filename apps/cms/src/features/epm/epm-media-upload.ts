'use client';

const OPTIMIZABLE_EPM_IMAGE_TYPES = new Set([
  'image/avif',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export function shouldOptimizeEpmMediaUpload(file: Blob) {
  return OPTIMIZABLE_EPM_IMAGE_TYPES.has(file.type);
}

export async function optimizeEpmMediaUpload(file: File) {
  if (!shouldOptimizeEpmMediaUpload(file)) {
    return file;
  }

  try {
    const imageCompression = (await import('browser-image-compression'))
      .default;

    const compressedBlob = await imageCompression(file, {
      maxSizeMB: 12,
      maxWidthOrHeight: 4096,
      useWebWorker: true,
      initialQuality: 0.82,
      fileType: file.type,
    });

    const optimizedFile = new File([compressedBlob], file.name, {
      type: compressedBlob.type || file.type,
      lastModified: file.lastModified,
    });

    return optimizedFile.size < file.size ? optimizedFile : file;
  } catch (error) {
    console.warn('EPM media optimization failed, using original file', {
      error,
      filename: file.name,
      type: file.type,
    });
    return file;
  }
}

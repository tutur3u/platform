'use client';

const OPTIMIZABLE_CMS_IMAGE_TYPES = new Set([
  'image/avif',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export function shouldOptimizeCmsMediaUpload(file: Blob) {
  return OPTIMIZABLE_CMS_IMAGE_TYPES.has(file.type);
}

export async function optimizeCmsMediaUpload(file: File) {
  if (!shouldOptimizeCmsMediaUpload(file)) {
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
    console.warn('CMS media optimization failed, using original file', {
      error,
      filename: file.name,
      type: file.type,
    });
    return file;
  }
}

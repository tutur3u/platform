const OPTIMIZABLE_WHITEBOARD_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/avif',
]);

export function shouldOptimizeWhiteboardImage(file: Blob) {
  return OPTIMIZABLE_WHITEBOARD_IMAGE_TYPES.has(file.type);
}

export async function optimizeWhiteboardImageUpload(file: File) {
  if (!shouldOptimizeWhiteboardImage(file)) {
    return file;
  }

  try {
    const imageCompression = (await import('browser-image-compression'))
      .default;

    const compressedBlob = await imageCompression(file, {
      maxSizeMB: 10,
      maxWidthOrHeight: 4096,
      useWebWorker: true,
      initialQuality: 0.82,
      fileType: file.type,
    });

    return new File([compressedBlob], file.name, {
      type: compressedBlob.type || file.type,
      lastModified: Date.now(),
    });
  } catch (error) {
    console.warn('Whiteboard image optimization failed, using original file', {
      error,
      filename: file.name,
      type: file.type,
    });
    return file;
  }
}

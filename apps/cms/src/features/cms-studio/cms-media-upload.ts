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

function formatCmsAudioDuration(seconds: number) {
  const roundedSeconds = Math.round(seconds);
  const minutes = Math.floor(roundedSeconds / 60);
  const remainingSeconds = roundedSeconds % 60;

  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

export type CmsAudioUploadMetadata = {
  contentType: string;
  duration: string | null;
  durationSeconds: number | null;
  filename: string;
  size: number;
};

export async function readCmsAudioUploadMetadata(
  file: File
): Promise<CmsAudioUploadMetadata> {
  if (typeof document === 'undefined' || typeof URL === 'undefined') {
    return {
      contentType: file.type,
      duration: null,
      durationSeconds: null,
      filename: file.name,
      size: file.size,
    };
  }

  return new Promise((resolve) => {
    const audio = document.createElement('audio');
    const objectUrl = URL.createObjectURL(file);

    const cleanup = () => {
      audio.removeAttribute('src');
      URL.revokeObjectURL(objectUrl);
    };

    const complete = (durationSeconds: number | null) => {
      cleanup();
      resolve({
        contentType: file.type,
        duration:
          durationSeconds && durationSeconds > 0
            ? formatCmsAudioDuration(durationSeconds)
            : null,
        durationSeconds,
        filename: file.name,
        size: file.size,
      });
    };

    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      complete(
        Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : null
      );
    };
    audio.onerror = () => complete(null);
    audio.src = objectUrl;
  });
}

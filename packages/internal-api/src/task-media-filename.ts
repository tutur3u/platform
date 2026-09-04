const TASK_MEDIA_EXTENSIONS_BY_MIME_TYPE: Readonly<Record<string, string>> = {
  'image/avif': 'avif',
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/x-m4v': 'm4v',
};

function getTaskMediaExtension(contentType: string): string | undefined {
  const normalizedType = contentType.split(';', 1)[0]?.trim().toLowerCase();
  return normalizedType
    ? TASK_MEDIA_EXTENSIONS_BY_MIME_TYPE[normalizedType]
    : undefined;
}

export function resolveTaskMediaUploadFilename(file: File): string {
  const filename = file.name.trim();
  const extension = getTaskMediaExtension(file.type);

  if (!filename) {
    return extension ? `pasted-image.${extension}` : 'pasted-image';
  }

  if (!extension || /\.[a-z0-9]+$/i.test(filename)) {
    return filename;
  }

  return `${filename}.${extension}`;
}

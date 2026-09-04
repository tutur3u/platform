const IMAGE_EXTENSIONS_BY_MIME_TYPE: Readonly<Record<string, string>> = {
  'image/avif': 'avif',
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
};

function normalizeClipboardImageFile(file: File, clipboardType: string): File {
  const type = file.type || clipboardType;
  const normalizedType = type.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  const extension = IMAGE_EXTENSIONS_BY_MIME_TYPE[normalizedType];
  const currentName = file.name.trim();
  const name =
    currentName && (/\.[a-z0-9]+$/i.test(currentName) || !extension)
      ? currentName
      : `${currentName || 'pasted-image'}${extension ? `.${extension}` : ''}`;

  if (name === file.name && type === file.type) {
    return file;
  }

  return new File([file], name, {
    lastModified: file.lastModified,
    type,
  });
}

export function getClipboardImageFiles(
  items: DataTransferItemList | DataTransferItem[]
): File[] {
  return Array.from(items)
    .map((item) => {
      if (!item.type.startsWith('image/')) return null;
      const file = item.getAsFile();
      return file ? normalizeClipboardImageFile(file, item.type) : null;
    })
    .filter((file): file is File => file !== null);
}

import type { StorageObject } from '@tuturuuu/types/primitives/StorageObject';

export const driveFileKinds = [
  'image',
  'video',
  'audio',
  'pdf',
  'document',
  'sheet',
  'archive',
  'code',
  'other',
] as const;

export type DriveFileKind = (typeof driveFileKinds)[number];

/** Kinds offered as search chips, in display order. */
export const driveTypeFilters = [
  'image',
  'video',
  'pdf',
  'document',
  'sheet',
  'archive',
] as const;

export type DriveTypeFilter = (typeof driveTypeFilters)[number];

const extensionKinds: Record<string, DriveFileKind> = {};
const register = (kind: DriveFileKind, extensions: string[]) => {
  for (const extension of extensions) extensionKinds[extension] = kind;
};

register('image', [
  'apng',
  'avif',
  'bmp',
  'gif',
  'heic',
  'heif',
  'ico',
  'jpeg',
  'jpg',
  'png',
  'svg',
  'tif',
  'tiff',
  'webp',
]);
register('video', ['avi', 'm4v', 'mkv', 'mov', 'mp4', 'webm']);
register('audio', ['aac', 'flac', 'm4a', 'mp3', 'ogg', 'wav']);
register('pdf', ['pdf']);
register('document', ['doc', 'docx', 'md', 'odt', 'pages', 'rtf', 'txt']);
register('sheet', ['csv', 'numbers', 'ods', 'tsv', 'xls', 'xlsx']);
register('archive', ['7z', 'bz2', 'gz', 'rar', 'tar', 'tgz', 'zip']);
register('code', [
  'c',
  'cpp',
  'css',
  'html',
  'java',
  'js',
  'json',
  'jsx',
  'php',
  'py',
  'rs',
  'ts',
  'tsx',
  'xml',
  'yaml',
  'yml',
]);

const mimeKinds: [prefix: string, kind: DriveFileKind][] = [
  ['image/', 'image'],
  ['video/', 'video'],
  ['audio/', 'audio'],
  ['application/pdf', 'pdf'],
  ['text/csv', 'sheet'],
  ['application/vnd.ms-excel', 'sheet'],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml', 'sheet'],
  [
    'application/vnd.openxmlformats-officedocument.wordprocessingml',
    'document',
  ],
  ['application/msword', 'document'],
  ['application/zip', 'archive'],
  ['application/x-7z-compressed', 'archive'],
  ['application/gzip', 'archive'],
];

export function getFileExtension(name?: string | null) {
  if (!name?.includes('.')) return '';
  return name.split('.').pop()?.toLowerCase() ?? '';
}

function getMimeType(item: Pick<StorageObject, 'metadata'>) {
  const metadata = item.metadata;
  const mime = metadata?.mimetype ?? metadata?.mimeType ?? metadata?.mediaType;
  return typeof mime === 'string' ? mime.toLowerCase() : null;
}

/** Classifies a file by MIME type, then extension; never call it on folders. */
export function getDriveFileKind(
  item: Pick<StorageObject, 'metadata' | 'name'>
): DriveFileKind {
  const mime = getMimeType(item);
  if (mime) {
    const match = mimeKinds.find(([prefix]) => mime.startsWith(prefix));
    if (match) return match[1];
  }

  return extensionKinds[getFileExtension(item.name)] ?? 'other';
}

/**
 * Tints for the thumbnail and icon tile of each kind. Folders and kinds
 * without a defined tint use the neutral accent surface.
 */
export const driveKindTint: Record<DriveFileKind | 'folder', string> = {
  folder: 'bg-accent text-foreground',
  image: 'bg-dynamic-blue/10 text-dynamic-blue',
  video: 'bg-dynamic-purple/10 text-dynamic-purple',
  pdf: 'bg-dynamic-orange/10 text-dynamic-orange',
  sheet: 'bg-dynamic-green/10 text-dynamic-green',
  archive: 'bg-dynamic-yellow/10 text-dynamic-yellow',
  audio: 'bg-accent text-muted-foreground',
  document: 'bg-accent text-muted-foreground',
  code: 'bg-accent text-muted-foreground',
  other: 'bg-accent text-muted-foreground',
};

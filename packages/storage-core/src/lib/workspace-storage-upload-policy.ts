const WORKSPACE_STORAGE_MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

const WORKSPACE_STORAGE_ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'text/markdown',
  'application/zip',
  'application/x-zip-compressed',
  'application/json',
]);

const WORKSPACE_STORAGE_GENERIC_ALLOWED_MIME_TYPES = new Set([
  'application/octet-stream',
  'binary/octet-stream',
]);

const WORKSPACE_STORAGE_ALLOWED_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.txt',
  '.csv',
  '.md',
  '.zip',
  '.json',
]);

const EXTERNAL_PROJECT_ASSET_MIME_TYPES = new Set([
  ...WORKSPACE_STORAGE_ALLOWED_MIME_TYPES,
  'audio/aac',
  'audio/flac',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'video/mp4',
]);

const EXTERNAL_PROJECT_ASSET_EXTENSIONS = new Set([
  ...WORKSPACE_STORAGE_ALLOWED_EXTENSIONS,
  '.aac',
  '.flac',
  '.m4a',
  '.mp3',
  '.mp4',
  '.oga',
  '.ogg',
  '.wav',
  '.webm',
]);

export type WorkspaceStorageUploadPolicyResult =
  | {
      ok: true;
      contentType?: string;
    }
  | {
      ok: false;
      message: string;
      status: number;
    };

function normalizeContentType(contentType?: string) {
  const normalized = contentType?.split(';', 1)[0]?.trim().toLowerCase();
  return normalized || undefined;
}

export function getWorkspaceStorageFileExtension(fileName: string) {
  const lastDotIndex = fileName.lastIndexOf('.');
  return lastDotIndex === -1 ? '' : fileName.slice(lastDotIndex).toLowerCase();
}

export function validateWorkspaceStorageUploadMetadata({
  allowExternalProjectAssets = false,
  contentType,
  filename,
  size,
}: {
  allowExternalProjectAssets?: boolean;
  contentType?: string;
  filename: string;
  size?: number;
}): WorkspaceStorageUploadPolicyResult {
  if (size === undefined || !Number.isFinite(size) || !Number.isInteger(size)) {
    return {
      ok: false,
      message: 'A valid file size is required',
      status: 400,
    };
  }

  if (size <= 0) {
    return {
      ok: false,
      message: 'File is empty',
      status: 400,
    };
  }

  if (size > WORKSPACE_STORAGE_MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      message: 'File size exceeds 100 MB limit',
      status: 413,
    };
  }

  const normalizedContentType = normalizeContentType(contentType);
  const allowedMimeTypes = allowExternalProjectAssets
    ? EXTERNAL_PROJECT_ASSET_MIME_TYPES
    : WORKSPACE_STORAGE_ALLOWED_MIME_TYPES;
  const allowedExtensions = allowExternalProjectAssets
    ? EXTERNAL_PROJECT_ASSET_EXTENSIONS
    : WORKSPACE_STORAGE_ALLOWED_EXTENSIONS;
  const fileExtension = getWorkspaceStorageFileExtension(filename);
  const hasAllowedExtension =
    !!fileExtension && allowedExtensions.has(fileExtension);
  const hasAllowedMimeType =
    !!normalizedContentType && allowedMimeTypes.has(normalizedContentType);
  const hasGenericMimeType =
    !!normalizedContentType &&
    WORKSPACE_STORAGE_GENERIC_ALLOWED_MIME_TYPES.has(normalizedContentType);
  const hasExplicitMimeType = !!normalizedContentType;
  const isValid =
    (hasAllowedExtension && (hasAllowedMimeType || hasGenericMimeType)) ||
    (!fileExtension && hasAllowedMimeType) ||
    (!hasExplicitMimeType && hasAllowedExtension);

  if (!isValid) {
    return {
      ok: false,
      message: 'File type not allowed',
      status: 415,
    };
  }

  return {
    ok: true,
    contentType: normalizedContentType,
  };
}

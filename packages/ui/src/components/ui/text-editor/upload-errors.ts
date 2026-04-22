type UploadErrorLike = {
  name?: string;
  code?: string;
  status?: number;
  statusCode?: number;
  message?: string;
};

const UPLOAD_ERROR_MESSAGES = {
  insufficient_permissions:
    'You do not have permission to upload media in this editor.',
  pending_permission_check:
    'Checking upload permissions. Please try again in a moment.',
  file_too_large: 'This file is too large to upload.',
  storage_quota_exceeded:
    'Storage quota exceeded. Please free up space and try again.',
  network_error:
    'Network error while uploading. Please check your connection and try again.',
} as const;

export function getKnownUploadErrorKey(
  error: unknown
): keyof typeof UPLOAD_ERROR_MESSAGES | null {
  if (!(error instanceof Error)) {
    return null;
  }

  const errorLike = error as UploadErrorLike;
  const code = errorLike.code?.toUpperCase();
  const name = errorLike.name ?? error.name;
  const message = (errorLike.message ?? error.message ?? '').toLowerCase();

  if (code === 'PENDING_PERMISSION_CHECK') {
    return 'pending_permission_check';
  }

  if (
    code === 'INSUFFICIENT_PERMISSIONS' ||
    code === 'FORBIDDEN' ||
    code === 'PERMISSION_DENIED' ||
    code === '42501' ||
    errorLike.status === 401 ||
    errorLike.status === 403 ||
    errorLike.statusCode === 401 ||
    errorLike.statusCode === 403 ||
    message.includes('permission') ||
    message.includes('forbidden') ||
    message.includes('not authorized') ||
    name === 'PermissionError'
  ) {
    return 'insufficient_permissions';
  }

  if (
    code === 'FILE_TOO_LARGE' ||
    code === 'PAYLOAD_TOO_LARGE' ||
    errorLike.status === 413 ||
    name === 'SizeLimitError'
  ) {
    return 'file_too_large';
  }

  if (name === 'StorageQuotaError') {
    return 'storage_quota_exceeded';
  }

  if (
    error.name === 'AbortError' ||
    code === 'NETWORK_ERROR' ||
    (error instanceof TypeError &&
      (message.includes('network') || message.includes('fetch')))
  ) {
    return 'network_error';
  }

  return null;
}

export function getUploadErrorMessage(
  error: unknown,
  fallback: string
): string {
  const knownErrorKey = getKnownUploadErrorKey(error);
  if (knownErrorKey) {
    return UPLOAD_ERROR_MESSAGES[knownErrorKey];
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallback;
}

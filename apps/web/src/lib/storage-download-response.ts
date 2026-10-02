import { StorageDownloadError } from '@tuturuuu/storage-core/storage-download-token';
import { NextResponse } from 'next/server';

export function storageDownloadErrorResponse(error: unknown) {
  if (!(error instanceof StorageDownloadError)) return null;
  return NextResponse.json(
    {
      message: error.message,
      code: error.status === 404 ? 'FILE_NOT_FOUND' : 'STORAGE_UNAVAILABLE',
    },
    {
      status: error.status,
      headers: {
        'Cache-Control': 'private, no-store',
        ...(error.retryAfter
          ? { 'Retry-After': String(error.retryAfter) }
          : {}),
      },
    }
  );
}

export function encodeDownloadFilename(value: string) {
  return encodeURIComponent(value).replace(
    /[!'()*]/gu,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

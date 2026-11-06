import { isExcludedDrivePath } from '@tuturuuu/storage-core/drive-path-policy';
import type { NextResponse } from 'next/server';
import { createErrorResponse } from '@/lib/api-middleware';

export function rejectReservedStoragePath(
  wsId: string,
  path: string
): NextResponse | null {
  if (!isExcludedDrivePath(wsId, path)) {
    return null;
  }

  return createErrorResponse(
    'Forbidden',
    'This storage path is managed by its owning application API.',
    403,
    'STORAGE_RESERVED_PATH'
  );
}

import { isReservedMobileDeploymentDrivePath } from '@tuturuuu/storage-core/mobile-deployment/storage-policy';
import type { NextResponse } from 'next/server';
import { createErrorResponse } from '@/lib/api-middleware';

export function rejectReservedStoragePath(
  wsId: string,
  path: string
): NextResponse | null {
  if (!isReservedMobileDeploymentDrivePath(wsId, path)) {
    return null;
  }

  return createErrorResponse(
    'Forbidden',
    'Mobile deployment vault files are managed by the mobile deployment API.',
    403,
    'STORAGE_RESERVED_PATH'
  );
}

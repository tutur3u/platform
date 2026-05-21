import { sanitizeFilename, sanitizePath } from '@tuturuuu/utils/storage-path';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { canAccessFinanceTransactionStoragePath } from '@/lib/finance-transaction-storage-access';
import { triggerWorkspaceStorageAutoExtract } from '@/lib/workspace-storage-auto-extract';
import type { WorkspaceStorageRouteAuthContext } from '../route-auth';
import {
  logWorkspaceStorageRouteError,
  resolveWorkspaceStorageRouteAuth,
} from '../route-auth';

const finalizeUploadSchema = z.object({
  path: z.string().min(1).max(1024),
  contentType: z.string().max(255).optional(),
  originalFilename: z.string().max(255).optional(),
});

function canFinalizeUploadForPath(
  permissions: WorkspaceStorageRouteAuthContext['permissions'],
  path: string
) {
  if (!permissions) {
    return false;
  }

  if (!permissions.withoutPermission('manage_drive')) {
    return true;
  }

  if (
    path.startsWith('external-projects/') &&
    permissions.containsPermission('manage_external_projects')
  ) {
    return true;
  }

  return (
    path.startsWith('user-groups/') &&
    permissions.containsPermission('update_user_groups')
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const auth = await resolveWorkspaceStorageRouteAuth(request, wsId);
    if (!auth.ok) {
      return auth.response;
    }
    const { normalizedWsId, permissions, userId } = auth.context;

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json(
        { message: 'Invalid request body' },
        { status: 400 }
      );
    }

    const parsed = finalizeUploadSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: parsed.error.issues },
        { status: 400 }
      );
    }

    const sanitizedPath = sanitizePath(parsed.data.path);
    if (sanitizedPath === null) {
      return NextResponse.json({ message: 'Invalid path' }, { status: 400 });
    }

    const canFinalizeUpload =
      canFinalizeUploadForPath(permissions, sanitizedPath) ||
      (await canAccessFinanceTransactionStoragePath({
        access: 'write',
        normalizedWsId,
        path: sanitizedPath,
        permissions,
        userId,
      }));

    if (!canFinalizeUpload) {
      return NextResponse.json(
        { message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const sanitizedFilename = parsed.data.originalFilename
      ? sanitizeFilename(parsed.data.originalFilename) || undefined
      : undefined;

    const autoExtract = await triggerWorkspaceStorageAutoExtract(
      normalizedWsId,
      {
        path: sanitizedPath,
        contentType: parsed.data.contentType,
        originalFilename: sanitizedFilename,
        requestOrigin: new URL(request.url).origin,
      }
    );

    return NextResponse.json({
      message: 'Upload finalized successfully',
      autoExtract,
    });
  } catch (error) {
    logWorkspaceStorageRouteError('Finalize upload error:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

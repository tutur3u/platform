import { sanitizeFilename, sanitizePath } from '@tuturuuu/utils/storage-path';
import { generateRandomUUID } from '@tuturuuu/utils/uuid-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { canAccessFinanceTransactionStoragePath } from '@/lib/finance-transaction-storage-access';
import {
  createWorkspaceStorageUploadPayload,
  WorkspaceStorageError,
} from '@/lib/workspace-storage-provider';
import type { WorkspaceStorageRouteAuthContext } from '../route-auth';
import {
  logWorkspaceStorageRouteError,
  resolveWorkspaceStorageRouteAuth,
} from '../route-auth';

const uploadUrlSchema = z.object({
  filename: z.string().min(1).max(255),
  path: z.string().max(1024).optional(),
  upsert: z.boolean().optional(),
  size: z.number().int().min(0).optional(),
});

function canCreateUploadUrlForPath(
  permissions: WorkspaceStorageRouteAuthContext['permissions'],
  path: string
) {
  if (!permissions) {
    return false;
  }

  if (!permissions.withoutPermission('manage_drive')) {
    return true;
  }

  return (
    path.startsWith('external-projects/') &&
    permissions.containsPermission('manage_external_projects')
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

    const parsed = uploadUrlSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: parsed.error.issues },
        { status: 400 }
      );
    }

    const sanitizedPath = sanitizePath(parsed.data.path || '');
    if (sanitizedPath === null) {
      return NextResponse.json({ message: 'Invalid path' }, { status: 400 });
    }

    const canCreateUploadUrl =
      canCreateUploadUrlForPath(permissions, sanitizedPath) ||
      (await canAccessFinanceTransactionStoragePath({
        access: 'write',
        normalizedWsId,
        path: sanitizedPath,
        permissions,
        userId,
      }));

    if (!canCreateUploadUrl) {
      return NextResponse.json(
        { message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const sanitizedFilename = sanitizeFilename(parsed.data.filename);
    if (!sanitizedFilename) {
      return NextResponse.json(
        { message: 'Invalid filename' },
        { status: 400 }
      );
    }

    const filenameWithSuffix =
      parsed.data.upsert === true
        ? sanitizedFilename
        : `${generateRandomUUID()}-${sanitizedFilename}`;

    const uploadPayload = await createWorkspaceStorageUploadPayload(
      normalizedWsId,
      filenameWithSuffix,
      {
        path: sanitizedPath,
        upsert: parsed.data.upsert ?? false,
        size: parsed.data.size,
      }
    );

    return NextResponse.json({
      signedUrl: uploadPayload.signedUrl,
      token: uploadPayload.token,
      headers: uploadPayload.headers,
      path: uploadPayload.path,
      fullPath: uploadPayload.fullPath,
    });
  } catch (error) {
    if (error instanceof WorkspaceStorageError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status }
      );
    }

    logWorkspaceStorageRouteError('Upload URL error:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

import { sanitizePath } from '@tuturuuu/utils/storage-path';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { canAccessFinanceTransactionStoragePath } from '@/lib/finance-transaction-storage-access';
import { isReservedMobileDeploymentDrivePath } from '@/lib/mobile-deployment/storage-policy';
import {
  deleteWorkspaceStorageObjectByPath,
  WorkspaceStorageError,
} from '@/lib/workspace-storage-provider';
import {
  FINANCE_TRANSACTION_STORAGE_APP_SESSION_TARGETS,
  logWorkspaceStorageRouteError,
  resolveWorkspaceStorageRouteAuth,
} from '../route-auth';

const deleteObjectSchema = z.object({
  path: z.string().min(1),
});

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;
  const auth = await resolveWorkspaceStorageRouteAuth(request, wsId, {
    appSessionTargets: FINANCE_TRANSACTION_STORAGE_APP_SESSION_TARGETS,
  });
  if (!auth.ok) {
    return auth.response;
  }
  const { normalizedWsId, permissions, supabase, userId } = auth.context;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: 'Invalid request body' },
      { status: 400 }
    );
  }

  const parsed = deleteObjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request body' },
      { status: 400 }
    );
  }

  const rawPath = parsed.data.path;
  const prefix = `${normalizedWsId}/`;
  const relativePath = rawPath.startsWith(prefix)
    ? rawPath.substring(prefix.length)
    : rawPath;
  const sanitizedPath = sanitizePath(relativePath);

  if (!sanitizedPath) {
    return NextResponse.json(
      { message: 'Invalid request path' },
      { status: 400 }
    );
  }

  if (isReservedMobileDeploymentDrivePath(normalizedWsId, sanitizedPath)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const canDeleteStorageObject =
    !permissions.withoutPermission('manage_drive') ||
    (await canAccessFinanceTransactionStoragePath({
      access: 'write',
      normalizedWsId,
      path: sanitizedPath,
      permissions,
      supabase,
      userId,
    }));

  if (!canDeleteStorageObject) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  try {
    await deleteWorkspaceStorageObjectByPath(normalizedWsId, sanitizedPath);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof WorkspaceStorageError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status }
      );
    }

    logWorkspaceStorageRouteError('Failed to delete storage object:', error);
    return NextResponse.json(
      { message: 'Failed to delete storage object' },
      { status: 500 }
    );
  }
}

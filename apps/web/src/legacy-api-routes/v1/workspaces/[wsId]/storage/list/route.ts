import {
  filterReservedMobileDeploymentDriveEntries,
  isReservedMobileDeploymentDrivePath,
} from '@tuturuuu/storage-core/mobile-deployment/storage-policy';
import {
  listWorkspaceStorageDirectory,
  WorkspaceStorageError,
} from '@tuturuuu/storage-core/workspace-storage-provider';
import {
  MAX_MEDIUM_TEXT_LENGTH,
  MAX_SEARCH_LENGTH,
  MAX_SHORT_TEXT_LENGTH,
} from '@tuturuuu/utils/constants';
import { sanitizePath } from '@tuturuuu/utils/storage-path';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { canAccessFinanceTransactionStoragePath } from '@/lib/finance-transaction-storage-access';
import {
  FINANCE_TRANSACTION_STORAGE_APP_SESSION_TARGETS,
  logWorkspaceStorageRouteError,
  resolveWorkspaceStorageRouteAuth,
} from '../route-auth';

const listQuerySchema = z.object({
  path: z.string().max(MAX_MEDIUM_TEXT_LENGTH).optional().default(''),
  search: z.string().max(MAX_SEARCH_LENGTH).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_SHORT_TEXT_LENGTH).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  sortBy: z.enum(['name', 'created_at', 'updated_at', 'size']).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const auth = await resolveWorkspaceStorageRouteAuth(request, wsId, {
      appSessionTargets: FINANCE_TRANSACTION_STORAGE_APP_SESSION_TARGETS,
    });
    if (!auth.ok) {
      return auth.response;
    }
    const { normalizedWsId, permissions, supabase, userId } = auth.context;

    const { searchParams } = new URL(request.url);
    const parsed = listQuerySchema.safeParse({
      path: searchParams.get('path') ?? undefined,
      search: searchParams.get('search') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
      offset: searchParams.get('offset') ?? undefined,
      sortBy: searchParams.get('sortBy') ?? undefined,
      sortOrder: searchParams.get('sortOrder') ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid query params', errors: parsed.error.issues },
        { status: 400 }
      );
    }

    const { path, search, limit, offset, sortBy, sortOrder } = parsed.data;
    const sanitizedPath = sanitizePath(path);
    if (sanitizedPath === null) {
      return NextResponse.json({ message: 'Invalid path' }, { status: 400 });
    }

    if (
      sanitizedPath &&
      isReservedMobileDeploymentDrivePath(normalizedWsId, sanitizedPath)
    ) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const canListStorage =
      !permissions.withoutPermission('manage_drive') ||
      (await canAccessFinanceTransactionStoragePath({
        access: 'read',
        normalizedWsId,
        path: sanitizedPath,
        permissions,
        supabase,
        userId,
      }));

    if (!canListStorage) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const result = await listWorkspaceStorageDirectory(normalizedWsId, {
      path: sanitizedPath,
      search,
      limit,
      offset,
      sortBy,
      sortOrder,
    });

    return NextResponse.json({
      data: filterReservedMobileDeploymentDriveEntries(
        normalizedWsId,
        sanitizedPath,
        result.data
      ),
      pagination: {
        limit,
        offset,
        total: result.total,
      },
    });
  } catch (error) {
    if (error instanceof WorkspaceStorageError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status }
      );
    }

    logWorkspaceStorageRouteError(
      'Unexpected workspace storage list error:',
      error
    );
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

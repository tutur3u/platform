import { createDynamicAdminClient } from '@tuturuuu/supabase/next/server';
import { sanitizePath } from '@tuturuuu/utils/storage-path';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { canAccessFinanceTransactionStoragePath } from '@/lib/finance-transaction-storage-access';
import {
  FINANCE_TRANSACTION_STORAGE_APP_SESSION_TARGETS,
  logWorkspaceStorageRouteError,
  resolveWorkspaceStorageRouteAuth,
} from '../../route-auth';

const routeParamsSchema = z.object({
  id: z.guid(),
  wsId: z.string().min(1),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ wsId: string; id: string }> }
) {
  try {
    const parsedParams = routeParamsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return NextResponse.json(
        { message: 'Invalid route params', errors: parsedParams.error.issues },
        { status: 400 }
      );
    }

    const { wsId, id } = parsedParams.data;
    const auth = await resolveWorkspaceStorageRouteAuth(request, wsId, {
      appSessionTargets: FINANCE_TRANSACTION_STORAGE_APP_SESSION_TARGETS,
    });
    if (!auth.ok) {
      return auth.response;
    }
    const { normalizedWsId, permissions, userId } = auth.context;

    const supabase = await createDynamicAdminClient();
    const { data: object, error } = await supabase
      .schema('storage')
      .from('objects')
      .select('id, name, metadata, bucket_id, created_at, updated_at')
      .eq('id', id)
      .single();

    if (error || !object) {
      return NextResponse.json({ message: 'File not found' }, { status: 404 });
    }

    // Ensure the file belongs to the workspace
    const prefix = `${normalizedWsId}/`;
    if (!object.name.startsWith(prefix)) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const relativePath = object.name.substring(prefix.length);
    const sanitizedPath = sanitizePath(relativePath);
    if (!sanitizedPath) {
      return NextResponse.json(
        { message: 'Invalid file path' },
        { status: 400 }
      );
    }

    const canReadStorageObject =
      !permissions.withoutPermission('view_drive') ||
      (await canAccessFinanceTransactionStoragePath({
        access: 'read',
        normalizedWsId,
        path: sanitizedPath,
        permissions,
        userId,
      }));

    if (!canReadStorageObject) {
      return NextResponse.json(
        { message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      data: {
        id: object.id,
        name: object.name.split('/').pop() || '',
        path: sanitizedPath,
        fullPath: object.name,
        bucketId: object.bucket_id,
        size: (object.metadata as any)?.size ?? 0,
        mimetype:
          (object.metadata as any)?.mimetype || 'application/octet-stream',
        createdAt: object.created_at,
        updatedAt: object.updated_at,
      },
    });
  } catch (error) {
    logWorkspaceStorageRouteError(
      'Unexpected error fetching storage object by ID:',
      error
    );
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

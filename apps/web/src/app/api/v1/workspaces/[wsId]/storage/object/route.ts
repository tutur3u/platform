import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import { sanitizePath } from '@tuturuuu/utils/storage-path';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { canAccessFinanceTransactionStoragePath } from '@/lib/finance-transaction-storage-access';
import {
  deleteWorkspaceStorageObjectByPath,
  WorkspaceStorageError,
} from '@/lib/workspace-storage-provider';

const deleteObjectSchema = z.object({
  path: z.string().min(1),
});

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;
  const supabase = await createClient(request);
  const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

  if (authError || !user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);
  const permissions = await getPermissions({ wsId: normalizedWsId, request });

  if (!permissions) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

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

  const canDeleteStorageObject =
    !permissions.withoutPermission('manage_drive') ||
    (await canAccessFinanceTransactionStoragePath({
      access: 'write',
      normalizedWsId,
      path: sanitizedPath,
      permissions,
      userId: user.id,
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

    console.error('Failed to delete storage object:', error);
    return NextResponse.json(
      { message: 'Failed to delete storage object' },
      { status: 500 }
    );
  }
}

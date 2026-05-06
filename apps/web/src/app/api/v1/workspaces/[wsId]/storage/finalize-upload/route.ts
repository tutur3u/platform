import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { sanitizeFilename, sanitizePath } from '@tuturuuu/utils/storage-path';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { triggerWorkspaceStorageAutoExtract } from '@/lib/workspace-storage-auto-extract';

const finalizeUploadSchema = z.object({
  path: z.string().min(1).max(1024),
  contentType: z.string().max(255).optional(),
  originalFilename: z.string().max(255).optional(),
});

function canFinalizeUploadForPath(
  permissions: Awaited<ReturnType<typeof getPermissions>>,
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

function getFinanceTransactionIdFromStoragePath(path: string) {
  const segments = path.split('/').filter(Boolean);
  if (
    segments[0] !== 'finance' ||
    segments[1] !== 'transactions' ||
    !segments[2]
  ) {
    return null;
  }

  return segments[2];
}

async function canFinalizeFinanceTransactionUploadForPath({
  normalizedWsId,
  path,
  permissions,
  userId,
}: {
  normalizedWsId: string;
  path: string;
  permissions: Awaited<ReturnType<typeof getPermissions>>;
  userId: string;
}) {
  if (!permissions) {
    return false;
  }

  const transactionId = getFinanceTransactionIdFromStoragePath(path);
  if (!transactionId) {
    return false;
  }

  const sbAdmin = await createAdminClient();
  const { data: transaction } = await sbAdmin
    .from('wallet_transactions')
    .select('creator_id, workspace_wallets!wallet_id(ws_id)')
    .eq('id', transactionId)
    .maybeSingle();

  const transactionWorkspaceId = (
    transaction?.workspace_wallets as { ws_id?: string } | null | undefined
  )?.ws_id;

  if (transactionWorkspaceId !== normalizedWsId) {
    return false;
  }

  if (permissions.containsPermission('update_transactions')) {
    return true;
  }

  if (!permissions.containsPermission('create_transactions')) {
    return false;
  }

  const { data: linkedUser } = await sbAdmin
    .from('workspace_user_linked_users')
    .select('virtual_user_id')
    .eq('platform_user_id', userId)
    .eq('ws_id', normalizedWsId)
    .maybeSingle();

  return (
    !!linkedUser?.virtual_user_id &&
    linkedUser.virtual_user_id === transaction?.creator_id
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
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
      (await canFinalizeFinanceTransactionUploadForPath({
        normalizedWsId,
        path: sanitizedPath,
        permissions,
        userId: user.id,
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
    console.error('Finalize upload error:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
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

    if (!canFinalizeUploadForPath(permissions, sanitizedPath)) {
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

import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import { sanitizeFilename, sanitizePath } from '@tuturuuu/utils/storage-path';
import { generateRandomUUID } from '@tuturuuu/utils/uuid-helper';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  createWorkspaceStorageUploadPayload,
  WorkspaceStorageError,
} from '@/lib/workspace-storage-provider';

const uploadUrlSchema = z.object({
  filename: z.string().min(1).max(255),
  path: z.string().max(1024).optional(),
  upsert: z.boolean().optional(),
  size: z.number().int().min(0).optional(),
});

function canCreateUploadUrlForPath(
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

    if (!canCreateUploadUrlForPath(permissions, sanitizedPath)) {
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

    console.error('Upload URL error:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import {
  sanitizeFilename,
  sanitizeFolderName,
  sanitizePath,
} from '@tuturuuu/utils/storage-path';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  renameWorkspaceStorageEntry,
  WorkspaceStorageError,
} from '@/lib/workspace-storage-provider';

const renameStorageObjectSchema = z.object({
  path: z.string().default(''),
  currentName: z.string().min(1),
  newName: z.string().min(1),
  isFolder: z.boolean().default(false),
});

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
    const permissions = await getPermissions({
      wsId: normalizedWsId,
      request,
    });

    if (!permissions) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    if (permissions.withoutPermission('manage_drive')) {
      return NextResponse.json(
        { message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const parsed = renameStorageObjectSchema.safeParse(await request.json());

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

    const sanitizeName = parsed.data.isFolder
      ? sanitizeFolderName
      : sanitizeFilename;

    const currentName = sanitizeName(parsed.data.currentName);
    const newName = sanitizeName(parsed.data.newName);

    if (!currentName || !newName) {
      return NextResponse.json({ message: 'Invalid name' }, { status: 400 });
    }

    if (currentName === newName) {
      return NextResponse.json({ message: 'Nothing changed' });
    }

    await renameWorkspaceStorageEntry(normalizedWsId, {
      path: sanitizedPath,
      currentName,
      newName,
      isFolder: parsed.data.isFolder,
    });

    return NextResponse.json({
      message: parsed.data.isFolder
        ? 'Folder renamed successfully'
        : 'File renamed successfully',
      data: { previousName: currentName, name: newName },
    });
  } catch (error) {
    if (error instanceof WorkspaceStorageError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status }
      );
    }

    console.error('Unexpected error renaming storage object:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

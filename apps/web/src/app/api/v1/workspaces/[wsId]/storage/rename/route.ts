import { posix } from 'node:path';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { StorageDatabase } from '@tuturuuu/types/primitives/StorageObject';
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

const renameStorageObjectSchema = z.object({
  path: z.string().default(''),
  currentName: z.string().min(1),
  newName: z.string().min(1),
  isFolder: z.boolean().default(false),
});

function isConflictStorageError(error: {
  message?: string;
  status?: number;
  statusCode?: string | number;
}) {
  return (
    error.status === 409 ||
    error.statusCode === 409 ||
    error.statusCode === '409' ||
    /already exists|duplicate/i.test(error.message ?? '')
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const supabase = await createClient(request);
    const sbAdmin = await createAdminClient();
    const storageAdmin = await createAdminClient<StorageDatabase>();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

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

    const currentBasePath = sanitizedPath
      ? posix.join(normalizedWsId, sanitizedPath, currentName)
      : posix.join(normalizedWsId, currentName);
    const nextBasePath = sanitizedPath
      ? posix.join(normalizedWsId, sanitizedPath, newName)
      : posix.join(normalizedWsId, newName);

    if (parsed.data.isFolder) {
      const { data: existingObjects, error: existingError } = await storageAdmin
        .schema('storage')
        .from('objects')
        .select('name')
        .eq('bucket_id', 'workspaces')
        .like('name', `${currentBasePath}/%`)
        .order('name', { ascending: true });

      if (existingError) {
        return NextResponse.json(
          { message: 'Failed to load folder contents' },
          { status: 500 }
        );
      }

      if (!existingObjects || existingObjects.length === 0) {
        return NextResponse.json(
          { message: 'Folder not found' },
          { status: 404 }
        );
      }

      const { data: conflictingObject, error: conflictError } =
        await storageAdmin
          .schema('storage')
          .from('objects')
          .select('name')
          .eq('bucket_id', 'workspaces')
          .like('name', `${nextBasePath}/%`)
          .limit(1)
          .maybeSingle();

      if (conflictError) {
        return NextResponse.json(
          { message: 'Failed to validate destination folder' },
          { status: 500 }
        );
      }

      if (conflictingObject) {
        return NextResponse.json(
          { message: 'Folder already exists' },
          { status: 409 }
        );
      }

      for (const object of existingObjects) {
        const destination = object.name.replace(currentBasePath, nextBasePath);
        const { error } = await sbAdmin.storage
          .from('workspaces')
          .move(object.name, destination);

        if (error) {
          return NextResponse.json(
            {
              message: isConflictStorageError(error)
                ? 'Folder already exists'
                : 'Failed to rename folder',
            },
            { status: isConflictStorageError(error) ? 409 : 500 }
          );
        }
      }

      return NextResponse.json({
        message: 'Folder renamed successfully',
        data: { previousName: currentName, name: newName },
      });
    }

    const { error } = await sbAdmin.storage
      .from('workspaces')
      .move(currentBasePath, nextBasePath);

    if (error) {
      return NextResponse.json(
        {
          message: isConflictStorageError(error)
            ? 'File already exists'
            : 'Failed to rename file',
        },
        { status: isConflictStorageError(error) ? 409 : 500 }
      );
    }

    return NextResponse.json({
      message: 'File renamed successfully',
      data: { previousName: currentName, name: newName },
    });
  } catch (error) {
    console.error('Unexpected error renaming storage object:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

import { posix } from 'node:path';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  MAX_MEDIUM_TEXT_LENGTH,
  MAX_NAME_LENGTH,
} from '@tuturuuu/utils/constants';
import { sanitizeFolderName, sanitizePath } from '@tuturuuu/utils/storage-path';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const createFolderSchema = z.object({
  path: z.string().max(MAX_MEDIUM_TEXT_LENGTH).default(''),
  name: z
    .string()
    .min(1)
    .max(MAX_NAME_LENGTH)
    .regex(
      /^[a-zA-Z0-9-_\s]+$/,
      'Folder name can only contain letters, numbers, spaces, hyphens, and underscores'
    ),
});

const EMPTY_FOLDER_PLACEHOLDER = '.emptyFolderPlaceholder';

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

    const parsed = createFolderSchema.safeParse(await request.json());

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

    const sanitizedName = sanitizeFolderName(parsed.data.name);
    if (!sanitizedName) {
      return NextResponse.json(
        { message: 'Invalid folder name' },
        { status: 400 }
      );
    }

    const folderPath = sanitizedPath
      ? posix.join(
          normalizedWsId,
          sanitizedPath,
          sanitizedName,
          EMPTY_FOLDER_PLACEHOLDER
        )
      : posix.join(normalizedWsId, sanitizedName, EMPTY_FOLDER_PLACEHOLDER);

    const relativePath = sanitizedPath
      ? posix.join(sanitizedPath, sanitizedName)
      : sanitizedName;

    const { data, error } = await sbAdmin.storage
      .from('workspaces')
      .upload(folderPath, new Uint8Array(0), {
        contentType: 'text/plain',
        upsert: false,
      });

    if (error) {
      console.error('Error creating folder:', error);

      if (isConflictStorageError(error)) {
        return NextResponse.json(
          { message: 'Folder already exists' },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { message: 'Failed to create folder' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'Folder created successfully',
      data: {
        path: relativePath,
        fullPath: data.path,
      },
    });
  } catch (error) {
    console.error('Unexpected error creating folder:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const supabase = await createClient(request);
    const sbAdmin = await createAdminClient();

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

    const parsed = z
      .object({
        path: z.string().max(MAX_MEDIUM_TEXT_LENGTH).default(''),
        name: z.string().min(1).max(MAX_NAME_LENGTH),
      })
      .safeParse(await request.json());

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

    const sanitizedName = sanitizeFolderName(parsed.data.name);
    if (!sanitizedName) {
      return NextResponse.json(
        { message: 'Invalid folder name' },
        { status: 400 }
      );
    }

    const folderPrefix = sanitizedPath
      ? posix.join(normalizedWsId, sanitizedPath, sanitizedName)
      : posix.join(normalizedWsId, sanitizedName);

    const { data: objects, error: listError } = await sbAdmin.storage
      .from('workspaces')
      .list(folderPrefix, {
        limit: 1000,
        offset: 0,
      });

    if (listError) {
      return NextResponse.json(
        { message: 'Failed to load folder contents' },
        { status: 500 }
      );
    }

    const paths = (objects || []).map((object) =>
      posix.join(folderPrefix, object.name)
    );

    if (paths.length === 0) {
      return NextResponse.json(
        { message: 'Folder not found' },
        { status: 404 }
      );
    }

    const { error: removeError } = await sbAdmin.storage
      .from('workspaces')
      .remove(paths);

    if (removeError) {
      return NextResponse.json(
        { message: 'Failed to delete folder' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, message: 'Folder deleted' });
  } catch (error) {
    console.error('Unexpected error deleting folder:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

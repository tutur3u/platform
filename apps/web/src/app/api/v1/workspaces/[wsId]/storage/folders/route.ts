import {
  MAX_MEDIUM_TEXT_LENGTH,
  MAX_NAME_LENGTH,
} from '@tuturuuu/utils/constants';
import { sanitizeFolderName, sanitizePath } from '@tuturuuu/utils/storage-path';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  createWorkspaceStorageFolderObject,
  deleteWorkspaceStorageFolderByPath,
  WorkspaceStorageError,
} from '@/lib/workspace-storage-provider';
import {
  logWorkspaceStorageRouteError,
  resolveWorkspaceStorageRouteAuth,
} from '../route-auth';

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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const auth = await resolveWorkspaceStorageRouteAuth(request, wsId);
    if (!auth.ok) {
      return auth.response;
    }
    const { normalizedWsId, permissions } = auth.context;

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

    const data = await createWorkspaceStorageFolderObject(
      normalizedWsId,
      sanitizedPath,
      sanitizedName
    );

    return NextResponse.json({
      message: 'Folder created successfully',
      data: {
        path: data.path,
        fullPath: data.fullPath,
      },
    });
  } catch (error) {
    if (error instanceof WorkspaceStorageError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status }
      );
    }

    logWorkspaceStorageRouteError('Unexpected error creating folder:', error);
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
    const auth = await resolveWorkspaceStorageRouteAuth(request, wsId);
    if (!auth.ok) {
      return auth.response;
    }
    const { normalizedWsId, permissions } = auth.context;

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

    await deleteWorkspaceStorageFolderByPath(
      normalizedWsId,
      sanitizedPath,
      sanitizedName
    );

    return NextResponse.json({ success: true, message: 'Folder deleted' });
  } catch (error) {
    if (error instanceof WorkspaceStorageError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status }
      );
    }

    logWorkspaceStorageRouteError('Unexpected error deleting folder:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

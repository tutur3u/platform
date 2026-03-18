import {
  MAX_LONG_TEXT_LENGTH,
  MAX_NAME_LENGTH,
} from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { extractWhiteboardImageFileIds } from '@/lib/whiteboards';
import { requireWhiteboardAccess } from '../access';

const paramsSchema = z.object({
  boardId: z.string().uuid(),
  wsId: z.string().min(1),
});

const updateWhiteboardSchema = z
  .object({
    title: z.string().trim().min(1).max(MAX_NAME_LENGTH).optional(),
    description: z
      .string()
      .trim()
      .max(MAX_LONG_TEXT_LENGTH)
      .nullable()
      .optional(),
    snapshot: z.json().nullable().optional(),
    archived_at: z.string().datetime().nullable().optional(),
    updated_at: z.string().datetime().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

const STORAGE_LIST_LIMIT = 1000;

function getWhiteboardStoragePrefix(wsId: string, boardId: string) {
  return `${wsId}/whiteboards/${boardId}/`;
}

async function listWhiteboardStoragePaths(
  sbAdmin: any,
  storagePrefix: string
): Promise<string[]> {
  const pendingPaths = [storagePrefix.slice(0, -1)];
  const filePaths: string[] = [];

  while (pendingPaths.length > 0) {
    const currentPath = pendingPaths.pop();
    if (!currentPath) {
      continue;
    }

    let offset = 0;

    while (true) {
      const { data, error } = await sbAdmin.storage
        .from('workspaces')
        .list(currentPath, {
          limit: STORAGE_LIST_LIMIT,
          offset,
          sortBy: {
            column: 'name',
            order: 'asc',
          },
        });

      if (error) {
        throw error;
      }

      const entries = data ?? [];

      for (const entry of entries) {
        if (!entry?.name) {
          continue;
        }

        const nextPath = `${currentPath}/${entry.name}`;
        if (entry.id) {
          filePaths.push(nextPath);
        } else {
          pendingPaths.push(nextPath);
        }
      }

      if (entries.length < STORAGE_LIST_LIMIT) {
        break;
      }

      offset += entries.length;
    }
  }

  return filePaths;
}

async function removeWhiteboardStoragePaths(
  sbAdmin: any,
  paths: string[]
): Promise<void> {
  if (paths.length === 0) {
    return;
  }

  const { error } = await sbAdmin.storage.from('workspaces').remove(paths);
  if (error) {
    throw error;
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ wsId: string; boardId: string }> }
) {
  try {
    const parsedParams = paramsSchema.parse(await params);
    const access = await requireWhiteboardAccess(request, parsedParams.wsId);
    if ('error' in access) return access.error;

    const { sbAdmin, wsId } = access;
    const { data, error } = await sbAdmin
      .from('workspace_whiteboards')
      .select(
        'id, title, description, snapshot, created_at, updated_at, archived_at'
      )
      .eq('ws_id', wsId)
      .eq('id', parsedParams.boardId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching whiteboard:', error);
      return NextResponse.json(
        { error: 'Failed to fetch whiteboard' },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Whiteboard not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ whiteboard: data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid workspace or whiteboard ID', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Error in whiteboard GET route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ wsId: string; boardId: string }> }
) {
  try {
    const parsedParams = paramsSchema.parse(await params);
    const access = await requireWhiteboardAccess(request, parsedParams.wsId);
    if ('error' in access) return access.error;

    const { sbAdmin, wsId } = access;
    const body = updateWhiteboardSchema.parse(await request.json());
    const storagePrefix = getWhiteboardStoragePrefix(
      wsId,
      parsedParams.boardId
    );
    let removedImagePaths: string[] = [];

    if (Object.hasOwn(body, 'snapshot')) {
      const { data: existingWhiteboard, error: existingWhiteboardError } =
        await sbAdmin
          .from('workspace_whiteboards')
          .select('id, snapshot')
          .eq('ws_id', wsId)
          .eq('id', parsedParams.boardId)
          .maybeSingle();

      if (existingWhiteboardError) {
        console.error(
          'Error loading existing whiteboard snapshot for cleanup:',
          existingWhiteboardError
        );
        return NextResponse.json(
          { error: 'Failed to update whiteboard' },
          { status: 500 }
        );
      }

      if (!existingWhiteboard) {
        return NextResponse.json(
          { error: 'Whiteboard not found' },
          { status: 404 }
        );
      }

      const previousImageFileIds = extractWhiteboardImageFileIds(
        existingWhiteboard.snapshot,
        storagePrefix
      );
      const nextImageFileIds = extractWhiteboardImageFileIds(
        body.snapshot,
        storagePrefix
      );

      removedImagePaths = Array.from(previousImageFileIds).filter(
        (path) => !nextImageFileIds.has(path)
      );
    }

    const { data, error } = await sbAdmin
      .from('workspace_whiteboards')
      .update(body)
      .eq('ws_id', wsId)
      .eq('id', parsedParams.boardId)
      .select(
        'id, title, description, snapshot, created_at, updated_at, archived_at'
      )
      .maybeSingle();

    if (error) {
      console.error('Error updating whiteboard:', error);
      return NextResponse.json(
        { error: error.message || 'Failed to update whiteboard' },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Whiteboard not found' },
        { status: 404 }
      );
    }

    if (removedImagePaths.length > 0) {
      try {
        await removeWhiteboardStoragePaths(sbAdmin, removedImagePaths);
      } catch (storageError) {
        console.error(
          'Error deleting removed whiteboard images from storage:',
          storageError
        );
      }
    }

    return NextResponse.json({ whiteboard: data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request payload', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Error in whiteboard PATCH route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ wsId: string; boardId: string }> }
) {
  try {
    const parsedParams = paramsSchema.parse(await params);
    const access = await requireWhiteboardAccess(request, parsedParams.wsId);
    if ('error' in access) return access.error;

    const { sbAdmin, wsId } = access;
    const { data: existingWhiteboard, error: existingWhiteboardError } =
      await sbAdmin
        .from('workspace_whiteboards')
        .select('id')
        .eq('ws_id', wsId)
        .eq('id', parsedParams.boardId)
        .maybeSingle();

    if (existingWhiteboardError) {
      console.error(
        'Error loading whiteboard for deletion:',
        existingWhiteboardError
      );
      return NextResponse.json(
        { error: 'Failed to delete whiteboard' },
        { status: 500 }
      );
    }

    if (!existingWhiteboard) {
      return NextResponse.json(
        { error: 'Whiteboard not found' },
        { status: 404 }
      );
    }

    const storagePrefix = getWhiteboardStoragePrefix(
      wsId,
      parsedParams.boardId
    );

    try {
      const storagePaths = await listWhiteboardStoragePaths(
        sbAdmin,
        storagePrefix
      );
      await removeWhiteboardStoragePaths(sbAdmin, storagePaths);
    } catch (storageError) {
      console.error('Error deleting whiteboard storage objects:', storageError);
      return NextResponse.json(
        { error: 'Failed to delete whiteboard assets' },
        { status: 500 }
      );
    }

    const { data, error } = await sbAdmin
      .from('workspace_whiteboards')
      .delete()
      .eq('ws_id', wsId)
      .eq('id', parsedParams.boardId)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('Error deleting whiteboard:', error);
      return NextResponse.json(
        { error: error.message || 'Failed to delete whiteboard' },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Whiteboard not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid workspace or whiteboard ID', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Error in whiteboard DELETE route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

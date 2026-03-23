import { posix } from 'node:path';
import {
  createClient,
  createDynamicAdminClient,
} from '@tuturuuu/supabase/next/server';
import {
  MAX_MEDIUM_TEXT_LENGTH,
  MAX_SEARCH_LENGTH,
  MAX_SHORT_TEXT_LENGTH,
} from '@tuturuuu/utils/constants';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { countWorkspaceStorageObjects } from '@/lib/storage-analytics';

const listQuerySchema = z.object({
  path: z.string().max(MAX_MEDIUM_TEXT_LENGTH).optional().default(''),
  search: z.string().max(MAX_SEARCH_LENGTH).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_SHORT_TEXT_LENGTH).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  sortBy: z.enum(['name', 'created_at', 'updated_at', 'size']).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const supabase = await createClient(request);
    const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);
    const permissions = await getPermissions({ wsId: normalizedWsId, request });

    if (!permissions) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    if (permissions.withoutPermission('manage_drive')) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const parsed = listQuerySchema.safeParse({
      path: searchParams.get('path') ?? undefined,
      search: searchParams.get('search') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
      offset: searchParams.get('offset') ?? undefined,
      sortBy: searchParams.get('sortBy') ?? undefined,
      sortOrder: searchParams.get('sortOrder') ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid query params', errors: parsed.error.issues },
        { status: 400 }
      );
    }

    const { path, search, limit, offset, sortBy, sortOrder } = parsed.data;
    const trimmedPath = path.replace(/^\/+|\/+$/g, '');
    const storagePath = trimmedPath
      ? posix.join(normalizedWsId, trimmedPath)
      : normalizedWsId;

    const sbAdmin = await createDynamicAdminClient();
    const { data: files, error } = await sbAdmin.storage
      .from('workspaces')
      .list(storagePath, {
        limit,
        offset,
        sortBy: {
          column: sortBy,
          order: sortOrder,
        },
        search: search || undefined,
      });

    if (error) {
      console.error('Error listing workspace storage objects:', error);
      return NextResponse.json(
        { message: 'Failed to list files' },
        { status: 500 }
      );
    }

    const filteredFiles = files?.filter(
      (file) => file.name !== '.emptyFolderPlaceholder'
    );

    let totalCount = filteredFiles?.length || 0;
    try {
      totalCount = await countWorkspaceStorageObjects(sbAdmin, normalizedWsId, {
        path,
        search,
      });
    } catch (countError) {
      console.error('Error counting workspace storage objects:', countError);
    }

    return NextResponse.json({
      data: filteredFiles || [],
      pagination: {
        limit,
        offset,
        total: totalCount,
      },
    });
  } catch (error) {
    console.error('Unexpected workspace storage list error:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

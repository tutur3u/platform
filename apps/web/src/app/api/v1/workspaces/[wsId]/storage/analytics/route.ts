import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/server-supabase-client';
import {
  getWorkspaceStorageOverview,
  WorkspaceStorageError,
} from '@/lib/workspace-storage-provider';

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

    const overview = await getWorkspaceStorageOverview(normalizedWsId);
    const totalSize = overview.totalSize;
    const storageLimit = overview.storageLimit;
    const usagePercentage =
      storageLimit > 0
        ? Math.min(
            100,
            Math.round(
              ((totalSize / storageLimit) * 100 + Number.EPSILON) * 100
            ) / 100
          )
        : 0;

    return NextResponse.json({
      data: {
        totalSize,
        fileCount: overview.fileCount,
        storageLimit,
        usagePercentage,
        largestFile: overview.largestFile,
        smallestFile: overview.smallestFile,
      },
    });
  } catch (error) {
    if (error instanceof WorkspaceStorageError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status }
      );
    }

    console.error('Unexpected workspace storage analytics error:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

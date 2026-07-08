import {
  getWorkspaceStorageOverview,
  WorkspaceStorageError,
} from '@tuturuuu/storage-core/workspace-storage-provider';
import { NextResponse } from 'next/server';
import {
  logWorkspaceStorageRouteError,
  resolveWorkspaceStorageRouteAuth,
} from '../route-auth';

export async function GET(
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

    logWorkspaceStorageRouteError(
      'Unexpected workspace storage analytics error:',
      error
    );
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

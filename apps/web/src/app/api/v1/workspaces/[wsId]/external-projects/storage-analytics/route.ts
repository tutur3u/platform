import { posix } from 'node:path';
import { NextResponse } from 'next/server';
import { requireWorkspaceExternalProjectAccess } from '@/lib/external-projects/access';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import {
  getWorkspaceStorageOverview,
  listWorkspaceStorageRawObjectsForProvider,
  WorkspaceStorageError,
  type WorkspaceStorageOverview,
  type WorkspaceStorageRawObject,
} from '@/lib/workspace-storage-provider';

function getFileName(path: string) {
  return posix.basename(path) || path;
}

function isCountableObject(object: WorkspaceStorageRawObject) {
  return !object.isFolderPlaceholder;
}

function updateFileHighlights(
  highlights: Pick<WorkspaceStorageOverview, 'largestFile' | 'smallestFile'>,
  object: WorkspaceStorageRawObject
) {
  const file = {
    createdAt: object.updatedAt ?? '',
    name: getFileName(object.path),
    size: object.size,
  };

  if (!highlights.largestFile || file.size > highlights.largestFile.size) {
    highlights.largestFile = file;
  }

  if (!highlights.smallestFile || file.size < highlights.smallestFile.size) {
    highlights.smallestFile = file;
  }
}

function calculateUsagePercentage(totalSize: number, storageLimit: number) {
  if (storageLimit <= 0) {
    return 0;
  }

  return Math.min(
    100,
    Math.round(((totalSize / storageLimit) * 100 + Number.EPSILON) * 100) / 100
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;
  const access = await requireWorkspaceExternalProjectAccess({
    mode: 'read',
    request,
    wsId,
  });

  if (!access.ok) {
    return access.response;
  }

  try {
    const overview = await getWorkspaceStorageOverview(
      access.normalizedWorkspaceId
    );
    const adapter = access.binding.adapter ?? 'shared';
    const prefix = posix.join('external-projects', adapter);
    const objects = await listWorkspaceStorageRawObjectsForProvider(
      access.normalizedWorkspaceId,
      overview.provider,
      {
        pathPrefix: prefix,
      }
    );
    const highlights: Pick<
      WorkspaceStorageOverview,
      'largestFile' | 'smallestFile'
    > = {
      largestFile: null,
      smallestFile: null,
    };
    let totalSize = 0;
    let fileCount = 0;

    for (const object of objects) {
      if (!isCountableObject(object)) {
        continue;
      }

      totalSize += object.size;
      fileCount += 1;
      updateFileHighlights(highlights, object);
    }

    return NextResponse.json({
      data: {
        totalSize,
        fileCount,
        storageLimit: overview.storageLimit,
        usagePercentage: calculateUsagePercentage(
          totalSize,
          overview.storageLimit
        ),
        largestFile: highlights.largestFile,
        smallestFile: highlights.smallestFile,
      },
    });
  } catch (error) {
    if (error instanceof WorkspaceStorageError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    serverLogger.error('Failed to load external project storage analytics', {
      error,
    });
    return NextResponse.json(
      { error: 'Failed to load external project storage analytics' },
      { status: 500 }
    );
  }
}

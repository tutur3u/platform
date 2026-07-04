import { posix } from 'node:path';
import { NextResponse } from 'next/server';
import { requireWorkspaceExternalProjectAccess } from '@/lib/external-projects/access';
import { checkRateLimit } from '@/lib/rate-limit';
import {
  getWorkspaceStorageOverview,
  listWorkspaceStorageRawObjectsForProvider,
  WorkspaceStorageError,
  type WorkspaceStorageOverview,
  type WorkspaceStorageRawObject,
} from '@/lib/workspace-storage-provider';

const EXTERNAL_PROJECT_STORAGE_ANALYTICS_OBJECT_LIMIT = 1000;
const EXTERNAL_PROJECT_STORAGE_ANALYTICS_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 10,
};

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
    mode: 'manage',
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
    const rateLimit = await checkRateLimit(
      `external-projects:storage-analytics:${access.normalizedWorkspaceId}:${adapter}`,
      EXTERNAL_PROJECT_STORAGE_ANALYTICS_RATE_LIMIT,
      access.normalizedWorkspaceId
    );

    if (!('allowed' in rateLimit)) {
      return rateLimit;
    }

    const prefix = posix.join('external-projects', adapter);
    const rawObjects = await listWorkspaceStorageRawObjectsForProvider(
      access.normalizedWorkspaceId,
      overview.provider,
      {
        limit: EXTERNAL_PROJECT_STORAGE_ANALYTICS_OBJECT_LIMIT + 1,
        pathPrefix: prefix,
      }
    );
    const truncated =
      rawObjects.length > EXTERNAL_PROJECT_STORAGE_ANALYTICS_OBJECT_LIMIT;
    const objects = truncated
      ? rawObjects.slice(0, EXTERNAL_PROJECT_STORAGE_ANALYTICS_OBJECT_LIMIT)
      : rawObjects;
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

    return NextResponse.json(
      {
        data: {
          totalSize,
          fileCount,
          storageLimit: overview.storageLimit,
          usagePercentage: calculateUsagePercentage(
            totalSize,
            overview.storageLimit
          ),
          scannedObjectLimit: EXTERNAL_PROJECT_STORAGE_ANALYTICS_OBJECT_LIMIT,
          truncated,
          largestFile: highlights.largestFile,
          smallestFile: highlights.smallestFile,
        },
      },
      {
        headers: rateLimit.headers,
      }
    );
  } catch (error) {
    if (error instanceof WorkspaceStorageError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    console.error('Failed to load external project storage analytics', {
      error,
    });
    return NextResponse.json(
      { error: 'Failed to load external project storage analytics' },
      { status: 500 }
    );
  }
}

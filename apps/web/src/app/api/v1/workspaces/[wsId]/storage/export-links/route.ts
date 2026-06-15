import { MAX_MEDIUM_TEXT_LENGTH } from '@tuturuuu/utils/constants';
import { sanitizePath } from '@tuturuuu/utils/storage-path';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isReservedMobileDeploymentDrivePath } from '@/lib/mobile-deployment/storage-policy';
import {
  createWorkspaceStorageExportAssetUrl,
  createWorkspaceStorageExportToken,
} from '@/lib/workspace-storage-export-links';
import {
  listWorkspaceStorageRawObjectsForProvider,
  resolveWorkspaceStorageProvider,
  WorkspaceStorageError,
} from '@/lib/workspace-storage-provider';
import {
  logWorkspaceStorageRouteError,
  resolveWorkspaceStorageRouteAuth,
} from '../route-auth';

const exportLinksSchema = z.object({
  path: z.string().max(MAX_MEDIUM_TEXT_LENGTH).min(1),
});

const EXPORT_LINKS_MAX_FILES = 500;
const EXPORT_LINKS_RAW_OBJECT_SCAN_LIMIT = EXPORT_LINKS_MAX_FILES * 4;
const EXPORT_LINKS_RAW_OBJECT_QUERY_LIMIT =
  EXPORT_LINKS_RAW_OBJECT_SCAN_LIMIT + 1;

function toExportableFiles(
  objects: Awaited<
    ReturnType<typeof listWorkspaceStorageRawObjectsForProvider>
  >,
  prefix: string
) {
  return objects
    .filter(
      (object) => !object.isFolderPlaceholder && object.path.startsWith(prefix)
    )
    .map((object) => ({
      path: object.path,
      relativePath: object.path.slice(prefix.length),
      size: object.size,
      contentType: object.contentType ?? null,
    }))
    .filter((object) => object.relativePath.length > 0)
    .sort((left, right) => {
      if (left.relativePath === 'index.html') return -1;
      if (right.relativePath === 'index.html') return 1;
      return left.relativePath.localeCompare(right.relativePath);
    });
}

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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { message: 'Invalid request body' },
        { status: 400 }
      );
    }

    const parsed = exportLinksSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: parsed.error.issues },
        { status: 400 }
      );
    }

    const sanitizedPath = sanitizePath(parsed.data.path);

    if (!sanitizedPath) {
      return NextResponse.json({ message: 'Invalid path' }, { status: 400 });
    }
    if (isReservedMobileDeploymentDrivePath(normalizedWsId, sanitizedPath)) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const resolvedProvider =
      await resolveWorkspaceStorageProvider(normalizedWsId);
    let objects = await listWorkspaceStorageRawObjectsForProvider(
      normalizedWsId,
      resolvedProvider.provider,
      {
        pathPrefix: sanitizedPath,
        limit: EXPORT_LINKS_RAW_OBJECT_QUERY_LIMIT,
      }
    );
    const prefix = `${sanitizedPath}/`;

    if (objects.length > EXPORT_LINKS_RAW_OBJECT_SCAN_LIMIT) {
      return NextResponse.json(
        {
          message:
            'This folder contains too many storage entries to export at once.',
        },
        { status: 400 }
      );
    }

    objects = objects.slice(0, EXPORT_LINKS_RAW_OBJECT_SCAN_LIMIT);
    const files = toExportableFiles(objects, prefix);

    if (files.length === 0) {
      return NextResponse.json(
        { message: 'No exportable assets found in this folder.' },
        { status: 404 }
      );
    }

    if (files.length > EXPORT_LINKS_MAX_FILES) {
      return NextResponse.json(
        { message: 'This folder is too large to export at once.' },
        { status: 400 }
      );
    }

    const token = createWorkspaceStorageExportToken({
      wsId: normalizedWsId,
      provider: resolvedProvider.provider,
      folderPath: sanitizedPath,
    });

    const exportFiles = files.map((file) => ({
      ...file,
      url: createWorkspaceStorageExportAssetUrl({
        wsId: normalizedWsId,
        token,
        relativePath: file.relativePath,
      }),
    }));
    const indexFile =
      exportFiles.find((file) => file.relativePath === 'index.html') ?? null;

    return NextResponse.json({
      folderName: sanitizedPath.split('/').pop() ?? sanitizedPath,
      folderPath: sanitizedPath,
      generatedAt: new Date().toISOString(),
      indexFile,
      files: exportFiles,
      loaderManifest: {
        entryUrl: indexFile?.url ?? null,
        assetUrls: Object.fromEntries(
          exportFiles.map((file) => [file.relativePath, file.url])
        ),
      },
      mode: 'rotating',
    });
  } catch (error) {
    if (error instanceof WorkspaceStorageError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status }
      );
    }

    logWorkspaceStorageRouteError(
      'Unexpected error exporting drive links:',
      error
    );
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

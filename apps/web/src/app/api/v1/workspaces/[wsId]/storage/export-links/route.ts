import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import { MAX_MEDIUM_TEXT_LENGTH } from '@tuturuuu/utils/constants';
import { sanitizePath } from '@tuturuuu/utils/storage-path';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  createWorkspaceStorageExportAssetUrl,
  createWorkspaceStorageExportToken,
} from '@/lib/workspace-storage-export-links';
import {
  listWorkspaceStorageRawObjectsForProvider,
  resolveWorkspaceStorageProvider,
  WorkspaceStorageError,
} from '@/lib/workspace-storage-provider';

const exportLinksSchema = z.object({
  path: z.string().max(MAX_MEDIUM_TEXT_LENGTH).min(1),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const supabase = await createClient(request);

    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

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

    const resolvedProvider =
      await resolveWorkspaceStorageProvider(normalizedWsId);
    let objects = await listWorkspaceStorageRawObjectsForProvider(
      normalizedWsId,
      resolvedProvider.provider,
      {
        pathPrefix: sanitizedPath,
        limit: 501,
      }
    );
    const prefix = `${sanitizedPath}/`;
    let files = objects
      .filter(
        (object) =>
          !object.isFolderPlaceholder && object.path.startsWith(prefix)
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

    if (objects.length === 501 && files.length <= 500) {
      objects = await listWorkspaceStorageRawObjectsForProvider(
        normalizedWsId,
        resolvedProvider.provider,
        {
          pathPrefix: sanitizedPath,
        }
      );

      files = objects
        .filter(
          (object) =>
            !object.isFolderPlaceholder && object.path.startsWith(prefix)
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

    if (files.length === 0) {
      return NextResponse.json(
        { message: 'No exportable assets found in this folder.' },
        { status: 404 }
      );
    }

    if (files.length > 500) {
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

    console.error('Unexpected error exporting drive links:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

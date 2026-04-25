import { posix } from 'node:path';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireWorkspaceExternalProjectAccess } from '@/lib/external-projects/access';
import { isWebglZipUpload } from '@/lib/external-projects/webgl-packages';
import {
  uploadWorkspaceStorageFileDirect,
  WorkspaceStorageError,
} from '@/lib/workspace-storage-provider';
import {
  buildWebglPackageUploadPath,
  getWebglPackageEntryContext,
  isCmsGamesEnabled,
  sanitizeWebglZipFilename,
} from '../shared';

const uploadSchema = z.object({
  archivePath: z.string().min(1).max(2048),
  entryId: z.string().uuid(),
  filename: z.string().min(1).max(255),
});

function normalizeArchivePath(path: string) {
  const withoutLeadingSlash = path.trim().replace(/^\/+/u, '');
  const normalized = posix.normalize(withoutLeadingSlash);

  if (
    !withoutLeadingSlash ||
    normalized !== withoutLeadingSlash ||
    normalized.includes('..') ||
    normalized.startsWith('/') ||
    posix.isAbsolute(normalized)
  ) {
    return null;
  }

  return normalized;
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;
  const access = await requireWorkspaceExternalProjectAccess({
    mode: 'manage',
    request,
    wsId,
  });
  if (!access.ok) return access.response;

  try {
    if (!(await isCmsGamesEnabled(access.normalizedWorkspaceId))) {
      return NextResponse.json(
        { error: 'CMS Games is disabled for this workspace.' },
        { status: 403 }
      );
    }

    const url = new URL(request.url);
    const payload = uploadSchema.parse({
      archivePath: url.searchParams.get('archivePath'),
      entryId: url.searchParams.get('entryId'),
      filename: url.searchParams.get('filename'),
    });
    const contentType =
      request.headers.get('content-type') || 'application/octet-stream';

    if (
      !isWebglZipUpload({
        contentType,
        filename: payload.filename,
      })
    ) {
      return NextResponse.json(
        { error: 'WebGL package uploads must be ZIP archives.' },
        { status: 400 }
      );
    }

    const entry = await getWebglPackageEntryContext(
      access.admin,
      access.normalizedWorkspaceId,
      payload.entryId
    );
    if (!entry) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }

    const expectedUploadPath = buildWebglPackageUploadPath({
      binding: access.binding,
      entry,
    });
    const archivePath = normalizeArchivePath(payload.archivePath);
    const archiveFilename = archivePath
      ? sanitizeWebglZipFilename(posix.basename(archivePath))
      : null;

    if (
      !archivePath ||
      !archiveFilename ||
      posix.dirname(archivePath) !== expectedUploadPath
    ) {
      return NextResponse.json(
        { error: 'Invalid WebGL package upload path.' },
        { status: 400 }
      );
    }

    const buffer = new Uint8Array(await request.arrayBuffer());
    if (buffer.byteLength === 0) {
      return NextResponse.json(
        { error: 'WebGL package upload is empty.' },
        { status: 400 }
      );
    }

    const upload = await uploadWorkspaceStorageFileDirect(
      access.normalizedWorkspaceId,
      archivePath,
      buffer,
      {
        contentType,
        upsert: false,
      }
    );

    return NextResponse.json({
      archivePath: upload.path,
      fullPath: upload.fullPath,
      path: upload.path,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { details: error.flatten(), error: 'Invalid payload' },
        { status: 400 }
      );
    }

    if (error instanceof WorkspaceStorageError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    console.error('Failed to upload WebGL package archive', error);
    return NextResponse.json(
      { error: 'Failed to upload WebGL package archive' },
      { status: 500 }
    );
  }
}

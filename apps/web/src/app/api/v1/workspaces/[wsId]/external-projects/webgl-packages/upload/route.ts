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

function normalizeOrigin(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function getAllowedCorsOrigin(request: Request) {
  const origin = normalizeOrigin(request.headers.get('origin'));
  if (!origin) {
    return null;
  }

  const allowedOrigins = new Set(
    [
      'https://cms.tuturuuu.com',
      'http://localhost:7811',
      normalizeOrigin(process.env.CMS_APP_URL),
      normalizeOrigin(process.env.NEXT_PUBLIC_CMS_APP_URL),
    ].filter((value): value is string => Boolean(value))
  );

  return allowedOrigins.has(origin) ? origin : null;
}

function withUploadCors(request: Request, response: NextResponse) {
  const origin = getAllowedCorsOrigin(request);
  if (!origin) {
    return response;
  }

  response.headers.set('Access-Control-Allow-Origin', origin);
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  response.headers.set('Access-Control-Allow-Methods', 'PUT, OPTIONS');
  response.headers.set(
    'Access-Control-Allow-Headers',
    'Authorization, Content-Type'
  );
  response.headers.append('Vary', 'Origin');
  return response;
}

function uploadJson(
  request: Request,
  body: Parameters<typeof NextResponse.json>[0],
  init?: Parameters<typeof NextResponse.json>[1]
) {
  return withUploadCors(request, NextResponse.json(body, init));
}

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

export function OPTIONS(request: Request) {
  return withUploadCors(request, new NextResponse(null, { status: 204 }));
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
  if (!access.ok) return withUploadCors(request, access.response);

  try {
    if (!(await isCmsGamesEnabled(access.normalizedWorkspaceId))) {
      return uploadJson(
        request,
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
      return uploadJson(
        request,
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
      return uploadJson(request, { error: 'Entry not found' }, { status: 404 });
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
      return uploadJson(
        request,
        { error: 'Invalid WebGL package upload path.' },
        { status: 400 }
      );
    }

    const buffer = new Uint8Array(await request.arrayBuffer());
    if (buffer.byteLength === 0) {
      return uploadJson(
        request,
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

    return uploadJson(request, {
      archivePath: upload.path,
      fullPath: upload.fullPath,
      path: upload.path,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return uploadJson(
        request,
        { details: error.flatten(), error: 'Invalid payload' },
        { status: 400 }
      );
    }

    if (error instanceof WorkspaceStorageError) {
      return uploadJson(
        request,
        { error: error.message },
        { status: error.status }
      );
    }

    console.error('Failed to upload WebGL package archive', error);
    return uploadJson(
      request,
      { error: 'Failed to upload WebGL package archive' },
      { status: 500 }
    );
  }
}

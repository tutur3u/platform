import { posix } from 'node:path';
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import { sanitizeFilename, sanitizePath } from '@tuturuuu/utils/storage-path';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { triggerWorkspaceStorageAutoExtract } from '@/lib/workspace-storage-auto-extract';
import {
  uploadWorkspaceStorageFileDirect,
  WorkspaceStorageError,
} from '@/lib/workspace-storage-provider';

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'text/markdown',
  'application/zip',
  'application/x-zip-compressed',
  'application/json',
]);

const GENERIC_ALLOWED_MIME_TYPES = new Set([
  'application/octet-stream',
  'binary/octet-stream',
]);

const ALLOWED_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.txt',
  '.csv',
  '.md',
  '.zip',
  '.json',
]);

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

    const formData = await request.formData();
    const file = formData.get('file');
    const path = String(formData.get('path') || '');
    const upsert = formData.get('upsert') === 'true';

    if (!(file instanceof File)) {
      return NextResponse.json({ message: 'Missing file' }, { status: 400 });
    }

    if (file.size > 100 * 1024 * 1024) {
      return NextResponse.json(
        { message: 'File size exceeds 100 MB limit' },
        { status: 413 }
      );
    }

    const lastDotIndex = file.name.lastIndexOf('.');
    const fileExtension =
      lastDotIndex === -1
        ? ''
        : file.name.substring(lastDotIndex).toLowerCase();

    const hasAllowedExtension =
      !!fileExtension && ALLOWED_EXTENSIONS.has(fileExtension);
    const hasAllowedMimeType = !!file.type && ALLOWED_MIME_TYPES.has(file.type);
    const hasGenericMimeType =
      !!file.type && GENERIC_ALLOWED_MIME_TYPES.has(file.type);
    const hasExplicitMimeType = !!file.type;

    const isValid =
      (hasAllowedExtension && (hasAllowedMimeType || hasGenericMimeType)) ||
      (!fileExtension && hasAllowedMimeType) ||
      (!hasExplicitMimeType && hasAllowedExtension);

    if (!isValid) {
      return NextResponse.json(
        { message: 'File type not allowed' },
        { status: 415 }
      );
    }

    const sanitizedPath = sanitizePath(path);
    if (sanitizedPath === null) {
      return NextResponse.json({ message: 'Invalid path' }, { status: 400 });
    }

    const sanitizedFilename = sanitizeFilename(file.name);
    if (!sanitizedFilename) {
      return NextResponse.json(
        { message: 'Invalid filename' },
        { status: 400 }
      );
    }

    const storagePath = sanitizedPath
      ? posix.join(sanitizedPath, sanitizedFilename)
      : sanitizedFilename;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    const data = await uploadWorkspaceStorageFileDirect(
      normalizedWsId,
      storagePath,
      buffer,
      {
        contentType: file.type || 'application/octet-stream',
        upsert,
      }
    );
    let autoExtract = null;
    let autoExtractError: string | null = null;

    try {
      autoExtract = await triggerWorkspaceStorageAutoExtract(normalizedWsId, {
        path: data.path,
        contentType: file.type || 'application/octet-stream',
        originalFilename: sanitizedFilename,
        requestOrigin: new URL(request.url).origin,
      });
    } catch (error) {
      autoExtractError =
        error instanceof Error
          ? error.message
          : 'Failed to trigger auto extraction';
    }

    return NextResponse.json({
      message: 'File uploaded successfully',
      autoExtract,
      autoExtractError,
      data: {
        path: data.path,
        fullPath: data.fullPath,
      },
    });
  } catch (error) {
    if (error instanceof WorkspaceStorageError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status }
      );
    }

    console.error('Upload error:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

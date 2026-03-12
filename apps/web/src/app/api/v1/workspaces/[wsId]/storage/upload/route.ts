import { posix } from 'node:path';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { sanitizeFilename, sanitizePath } from '@tuturuuu/utils/storage-path';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

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

function isConflictStorageError(error: {
  message?: string;
  status?: number;
  statusCode?: string | number;
}) {
  return (
    error.status === 409 ||
    error.statusCode === 409 ||
    error.statusCode === '409' ||
    /already exists|duplicate/i.test(error.message ?? '')
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const supabase = await createClient(request);
    const sbAdmin = await createAdminClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

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

    let isValid = false;
    if (file.type && fileExtension) {
      isValid =
        ALLOWED_MIME_TYPES.has(file.type) &&
        ALLOWED_EXTENSIONS.has(fileExtension);
    } else if (file.type) {
      isValid = ALLOWED_MIME_TYPES.has(file.type);
    } else if (fileExtension) {
      isValid = ALLOWED_EXTENSIONS.has(fileExtension);
    }

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
      ? posix.join(normalizedWsId, sanitizedPath, sanitizedFilename)
      : posix.join(normalizedWsId, sanitizedFilename);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    const { data, error } = await sbAdmin.storage
      .from('workspaces')
      .upload(storagePath, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert,
      });

    if (error) {
      console.error('Error uploading file:', error);

      if (isConflictStorageError(error)) {
        return NextResponse.json(
          { message: 'File already exists. Set upsert=true to overwrite.' },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { message: 'Failed to upload file' },
        { status: 500 }
      );
    }

    const prefix = `${normalizedWsId}/`;
    const relativePath = data.path.startsWith(prefix)
      ? data.path.substring(prefix.length)
      : data.path;

    return NextResponse.json({
      message: 'File uploaded successfully',
      data: {
        path: relativePath,
        fullPath: data.fullPath ?? storagePath,
      },
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

import { posix } from 'node:path';
import { sanitizeFilename, sanitizePath } from '@tuturuuu/utils/storage-path';
import { NextResponse } from 'next/server';
import { isReservedMobileDeploymentDrivePath } from '@/lib/mobile-deployment/storage-policy';
import { triggerWorkspaceStorageAutoExtract } from '@/lib/workspace-storage-auto-extract';
import {
  uploadWorkspaceStorageFileDirect,
  WorkspaceStorageError,
} from '@/lib/workspace-storage-provider';
import { validateWorkspaceStorageUploadMetadata } from '@/lib/workspace-storage-upload-policy';
import {
  logWorkspaceStorageRouteError,
  resolveWorkspaceStorageRouteAuth,
} from '../route-auth';

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

    const formData = await request.formData();
    const file = formData.get('file');
    const path = String(formData.get('path') || '');
    const upsert = formData.get('upsert') === 'true';

    if (!(file instanceof File)) {
      return NextResponse.json({ message: 'Missing file' }, { status: 400 });
    }

    const uploadValidation = validateWorkspaceStorageUploadMetadata({
      contentType: file.type,
      filename: file.name,
      size: file.size,
    });
    if (!uploadValidation.ok) {
      return NextResponse.json(
        { message: uploadValidation.message },
        { status: uploadValidation.status }
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

    if (isReservedMobileDeploymentDrivePath(normalizedWsId, storagePath)) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    const data = await uploadWorkspaceStorageFileDirect(
      normalizedWsId,
      storagePath,
      buffer,
      {
        contentType: uploadValidation.contentType || 'application/octet-stream',
        upsert,
      }
    );
    let autoExtract = null;
    let autoExtractError: string | null = null;

    try {
      autoExtract = await triggerWorkspaceStorageAutoExtract(normalizedWsId, {
        path: data.path,
        contentType: uploadValidation.contentType || 'application/octet-stream',
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

    logWorkspaceStorageRouteError('Upload error:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

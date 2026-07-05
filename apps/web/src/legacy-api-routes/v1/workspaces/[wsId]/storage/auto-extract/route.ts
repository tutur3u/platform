import { posix } from 'node:path';
import { isReservedMobileDeploymentDrivePath } from '@tuturuuu/storage-core/mobile-deployment/storage-policy';
import { resolveWorkspaceStorageAutoExtractConfig } from '@tuturuuu/storage-core/workspace-storage-auto-extract';
import {
  createWorkspaceStorageFolderObject,
  createWorkspaceStorageUploadPayload,
  uploadWorkspaceStorageFileDirect,
  WorkspaceStorageError,
} from '@tuturuuu/storage-core/workspace-storage-provider';
import { MAX_PAYLOAD_SIZE } from '@tuturuuu/utils/constants';
import { sanitizePath } from '@tuturuuu/utils/storage-path';
import { normalizeWorkspaceId } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

function getBearerToken(request: Request) {
  const header = request.headers.get('authorization');
  if (!header?.toLowerCase().startsWith('bearer ')) {
    return null;
  }

  return header.slice(7).trim();
}

const fileUploadPayloadSchema = z.object({
  contentType: z.string().optional().default('application/octet-stream'),
  size: z.number().optional(),
});

function buildPayloadTooLargeResponse() {
  return NextResponse.json(
    {
      error: 'Payload Too Large',
      message: 'Extracted file exceeds direct callback body limit',
    },
    { status: 413 }
  );
}

function rejectOversizedDirectFileCallback(request: Request) {
  const contentLength = request.headers.get('content-length');
  if (!contentLength) {
    return null;
  }

  const size = Number.parseInt(contentLength, 10);
  return Number.isFinite(size) && size > MAX_PAYLOAD_SIZE
    ? buildPayloadTooLargeResponse()
    : null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const normalizedWsId = await normalizeWorkspaceId(wsId);
    const config =
      await resolveWorkspaceStorageAutoExtractConfig(normalizedWsId);
    const token = getBearerToken(request);

    if (
      !config.enabled ||
      !config.configured ||
      !config.proxyToken ||
      token !== config.proxyToken
    ) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const operation =
      request.headers.get('x-drive-auto-extract-operation') || 'file';
    const relativePathHeader = request.headers.get('x-drive-auto-extract-path');
    const sanitizedPath = sanitizePath(relativePathHeader || '');

    if (!sanitizedPath) {
      return NextResponse.json({ message: 'Invalid path' }, { status: 400 });
    }
    if (isReservedMobileDeploymentDrivePath(normalizedWsId, sanitizedPath)) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    if (operation === 'folder') {
      const folderParent = posix.dirname(sanitizedPath);
      const folderName = posix.basename(sanitizedPath);
      try {
        await createWorkspaceStorageFolderObject(
          normalizedWsId,
          folderParent === '.' ? '' : folderParent,
          folderName
        );
      } catch (error) {
        if (!(error instanceof WorkspaceStorageError) || error.status !== 409) {
          throw error;
        }
      }

      return NextResponse.json({ message: 'Folder extracted successfully' });
    }

    if (operation === 'file') {
      const oversizedResponse = rejectOversizedDirectFileCallback(request);
      if (oversizedResponse) {
        return oversizedResponse;
      }

      const contentType =
        request.headers.get('content-type') || 'application/octet-stream';
      const buffer = new Uint8Array(await request.arrayBuffer());

      if (buffer.byteLength > MAX_PAYLOAD_SIZE) {
        return buildPayloadTooLargeResponse();
      }

      if (buffer.byteLength === 0) {
        return NextResponse.json(
          { message: 'Extracted file is empty' },
          { status: 400 }
        );
      }

      await uploadWorkspaceStorageFileDirect(
        normalizedWsId,
        sanitizedPath,
        buffer,
        {
          contentType,
          upsert: true,
        }
      );

      return NextResponse.json({ message: 'File extracted successfully' });
    }

    if (operation === 'file-upload-url') {
      let payload: unknown;
      try {
        payload = await request.json();
      } catch {
        return NextResponse.json(
          { message: 'Invalid request body' },
          { status: 400 }
        );
      }

      const parsed = fileUploadPayloadSchema.safeParse(payload);
      if (!parsed.success) {
        return NextResponse.json(
          { message: 'Invalid request body' },
          { status: 400 }
        );
      }

      const parentPath = posix.dirname(sanitizedPath);
      const fileName = posix.basename(sanitizedPath);
      const uploadPayload = await createWorkspaceStorageUploadPayload(
        normalizedWsId,
        fileName,
        {
          path: parentPath === '.' ? '' : parentPath,
          upsert: true,
          contentType: parsed.data.contentType,
          size: parsed.data.size,
        }
      );

      return NextResponse.json({
        message: 'Upload URL created successfully',
        signedUrl: uploadPayload.signedUrl,
        token: uploadPayload.token,
        headers: uploadPayload.headers,
        path: uploadPayload.path,
        fullPath: uploadPayload.fullPath,
        provider: uploadPayload.provider,
      });
    }

    return NextResponse.json({ message: 'Invalid operation' }, { status: 400 });
  } catch (error) {
    if (error instanceof WorkspaceStorageError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status }
      );
    }

    console.error('Auto extract callback error:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

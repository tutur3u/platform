import { posix } from 'node:path';
import { sanitizePath } from '@tuturuuu/utils/storage-path';
import { normalizeWorkspaceId } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  createWorkspaceStorageFolderObject,
  createWorkspaceStorageUploadPayload,
  uploadWorkspaceStorageFileDirect,
  WorkspaceStorageError,
} from '@/lib/workspace-storage-provider';
import { resolveWebglPackageExtractConfig } from '../shared';

const fileUploadPayloadSchema = z.object({
  contentType: z.string().optional().default('application/octet-stream'),
  size: z.number().optional(),
});

function getBearerToken(request: Request) {
  const header = request.headers.get('authorization');
  if (!header?.toLowerCase().startsWith('bearer ')) {
    return null;
  }

  return header.slice(7).trim();
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const normalizedWsId = await normalizeWorkspaceId(wsId);
    const config = await resolveWebglPackageExtractConfig(normalizedWsId);
    const token = getBearerToken(request);

    if (
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
      const contentType =
        request.headers.get('content-type') || 'application/octet-stream';
      const buffer = new Uint8Array(await request.arrayBuffer());

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
          contentType: parsed.data.contentType,
          path: parentPath === '.' ? '' : parentPath,
          size: parsed.data.size,
          upsert: true,
        }
      );

      return NextResponse.json({
        fullPath: uploadPayload.fullPath,
        headers: uploadPayload.headers,
        message: 'Upload URL created successfully',
        path: uploadPayload.path,
        signedUrl: uploadPayload.signedUrl,
        token: uploadPayload.token,
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

    console.error('WebGL package extract callback error:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

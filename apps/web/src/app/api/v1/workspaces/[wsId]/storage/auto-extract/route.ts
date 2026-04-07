import { posix } from 'node:path';
import { sanitizePath } from '@tuturuuu/utils/storage-path';
import { normalizeWorkspaceId } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { resolveWorkspaceStorageAutoExtractConfig } from '@/lib/workspace-storage-auto-extract';
import {
  createWorkspaceStorageFolderObject,
  uploadWorkspaceStorageFileDirect,
  WorkspaceStorageError,
} from '@/lib/workspace-storage-provider';

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

    const arrayBuffer = await request.arrayBuffer();
    const contentType =
      request.headers.get('content-type') || 'application/octet-stream';

    await uploadWorkspaceStorageFileDirect(
      normalizedWsId,
      sanitizedPath,
      new Uint8Array(arrayBuffer),
      {
        contentType,
        upsert: true,
      }
    );

    return NextResponse.json({ message: 'File extracted successfully' });
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

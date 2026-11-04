import { isExcludedDrivePath } from '@tuturuuu/storage-core/drive-path-policy';
import {
  resolveWorkspaceStorageExportAssetPath,
  verifyWorkspaceStorageExportToken,
} from '@tuturuuu/storage-core/workspace-storage-export-links';
import {
  createWorkspaceStorageSignedReadUrl,
  WorkspaceStorageError,
} from '@tuturuuu/storage-core/workspace-storage-provider';
import { connection, NextResponse } from 'next/server';

export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{
      wsId: string;
      token: string;
      assetPath: string[];
    }>;
  }
) {
  try {
    await connection();
    const { wsId, token, assetPath } = await params;
    const verified = await verifyWorkspaceStorageExportToken(token);

    if (verified.wsId !== wsId) {
      return NextResponse.json(
        { message: 'Invalid export token.' },
        { status: 404, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    const path = resolveWorkspaceStorageExportAssetPath({
      folderPath: verified.folderPath,
      assetPathSegments: assetPath,
    });
    if (isExcludedDrivePath(wsId, path)) {
      return NextResponse.json(
        { message: 'Forbidden' },
        { status: 403, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }
    if (verified.expiresAt <= Math.floor(Date.now() / 1000)) {
      throw new WorkspaceStorageError('Export link expired.', 410);
    }
    const signedUrl = await createWorkspaceStorageSignedReadUrl(wsId, path, {
      expiresIn: 900,
      provider: verified.provider,
    });

    const response = NextResponse.redirect(signedUrl, { status: 307 });
    response.headers.set('Cache-Control', 'no-store, max-age=0');
    return response;
  } catch (error) {
    if (error instanceof WorkspaceStorageError) {
      return NextResponse.json(
        { message: error.message },
        {
          status: error.status,
          headers: { 'Cache-Control': 'no-store, max-age=0' },
        }
      );
    }

    console.error('Unexpected error resolving rotating export URL:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }
}

import { NextResponse } from 'next/server';
import {
  resolveWorkspaceStorageExportAssetPath,
  verifyWorkspaceStorageExportToken,
} from '@/lib/workspace-storage-export-links';
import {
  createWorkspaceStorageSignedReadUrl,
  WorkspaceStorageError,
} from '@/lib/workspace-storage-provider';

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
    const { wsId, token, assetPath } = await params;
    const verified = verifyWorkspaceStorageExportToken(token);

    if (verified.wsId !== wsId) {
      return NextResponse.json(
        { message: 'Invalid export token.' },
        { status: 401 }
      );
    }

    const path = resolveWorkspaceStorageExportAssetPath({
      folderPath: verified.folderPath,
      assetPathSegments: assetPath,
    });
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
        { status: error.status }
      );
    }

    console.error('Unexpected error resolving rotating export URL:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

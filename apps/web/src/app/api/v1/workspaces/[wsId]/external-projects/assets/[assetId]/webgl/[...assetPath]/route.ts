import { posix } from 'node:path';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { resolveWorkspaceId } from '@tuturuuu/utils/constants';
import { sanitizePath } from '@tuturuuu/utils/storage-path';
import { NextResponse } from 'next/server';
import {
  requireWorkspaceExternalProjectAccess,
  resolveWorkspaceExternalProjectBinding,
} from '@/lib/external-projects/access';
import {
  inferWebglAssetHeaders,
  parseWebglPackageArtifactMetadata,
  WEBGL_PACKAGE_ASSET_TYPE,
} from '@/lib/external-projects/webgl-packages';
import {
  downloadWorkspaceStorageObjectForProvider,
  WorkspaceStorageError,
} from '@/lib/workspace-storage-provider';

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      assetId: string;
      assetPath: string[];
      wsId: string;
    }>;
  }
) {
  const { assetId, assetPath, wsId } = await params;
  const admin = (await createAdminClient()) as TypedSupabaseClient;
  const resolvedWsId = resolveWorkspaceId(wsId);

  try {
    const binding = await resolveWorkspaceExternalProjectBinding(
      resolvedWsId,
      admin
    );
    if (!binding.enabled || !binding.canonical_project) {
      return NextResponse.json(
        { error: 'External project delivery unavailable for this workspace' },
        { status: 404 }
      );
    }

    const { data: asset, error } = await admin
      .from('workspace_external_project_assets')
      .select(
        'id, ws_id, asset_type, metadata, workspace_external_project_entries!inner(status)'
      )
      .eq('id', assetId)
      .eq('ws_id', resolvedWsId)
      .eq('asset_type', WEBGL_PACKAGE_ASSET_TYPE)
      .single();

    if (error || !asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    const entryStatus = asset.workspace_external_project_entries?.status;
    if (entryStatus !== 'published') {
      const access = await requireWorkspaceExternalProjectAccess({
        mode: 'read',
        request,
        wsId,
      });

      if (!access.ok) {
        return NextResponse.json(
          { error: 'Asset not available' },
          { status: 404 }
        );
      }
    }

    const metadata = parseWebglPackageArtifactMetadata(asset.metadata);
    if (!metadata) {
      return NextResponse.json(
        { error: 'WebGL artifact map not available' },
        { status: 404 }
      );
    }

    const relativePath = sanitizePath(assetPath.join('/'));
    if (!relativePath) {
      return NextResponse.json(
        { error: 'Missing WebGL asset path' },
        { status: 400 }
      );
    }

    const storagePath = sanitizePath(
      posix.join(metadata.rootPath, relativePath)
    );
    if (
      !storagePath ||
      (storagePath !== metadata.rootPath &&
        !storagePath.startsWith(`${metadata.rootPath}/`))
    ) {
      return NextResponse.json(
        { error: 'Invalid WebGL asset path' },
        { status: 403 }
      );
    }

    const downloaded = await downloadWorkspaceStorageObjectForProvider(
      resolvedWsId,
      metadata.provider,
      storagePath
    );
    const inferred = inferWebglAssetHeaders(relativePath);
    const contentType =
      inferred.isKnownType ||
      !downloaded.contentType ||
      downloaded.contentType === 'application/octet-stream'
        ? inferred.contentType
        : downloaded.contentType;
    const headers = new Headers({
      'Cache-Control': 'no-store, max-age=0',
      'Content-Type': contentType,
      'X-Content-Type-Options': 'nosniff',
    });

    if (inferred.contentEncoding) {
      headers.set('Content-Encoding', inferred.contentEncoding);
    }

    const responseBody = downloaded.buffer.slice();

    return new Response(responseBody.buffer as ArrayBuffer, {
      headers,
      status: 200,
    });
  } catch (error) {
    if (error instanceof WorkspaceStorageError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    console.error('Failed to serve WebGL package asset', error);
    return NextResponse.json(
      { error: 'Failed to serve WebGL package asset' },
      { status: 500 }
    );
  }
}

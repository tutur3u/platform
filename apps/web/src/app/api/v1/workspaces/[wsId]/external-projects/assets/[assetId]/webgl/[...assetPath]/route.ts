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

const WEBGL_VIEWPORT_FILL_MARKER = 'data-tuturuuu-webgl-viewport-fill';

function injectWebglViewportFill(html: string) {
  if (html.includes(WEBGL_VIEWPORT_FILL_MARKER)) {
    return html;
  }

  const injection = `<style ${WEBGL_VIEWPORT_FILL_MARKER}>
html,body{width:100%;height:100%;margin:0;overflow:hidden;background:#000!important;}
#unity-container{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;background:#000!important;}
#unity-container.unity-desktop{left:0!important;top:0!important;transform:none!important;}
#unity-canvas{width:100vw!important;height:100vh!important;display:block!important;background:#231f20!important;}
#unity-loading-bar{position:fixed!important;left:50%!important;top:50%!important;transform:translate(-50%,-50%)!important;}
#unity-footer{position:fixed!important;right:12px!important;bottom:12px!important;left:12px!important;z-index:2;}
</style><script ${WEBGL_VIEWPORT_FILL_MARKER}>
(function(){function fit(){var container=document.getElementById('unity-container');var canvas=document.getElementById('unity-canvas');if(container){container.style.width='100vw';container.style.height='100vh';container.style.maxWidth='none';container.style.maxHeight='none';}if(canvas){canvas.style.width='100vw';canvas.style.height='100vh';}}window.addEventListener('resize',fit);document.addEventListener('DOMContentLoaded',fit);fit();})();
</script>`;

  return html.includes('</head>')
    ? html.replace('</head>', `${injection}</head>`)
    : `${injection}${html}`;
}

function shouldInjectWebglViewportFill(input: {
  contentEncoding?: string;
  contentType: string;
  relativePath: string;
}) {
  return (
    !input.contentEncoding &&
    input.contentType.toLowerCase().startsWith('text/html') &&
    input.relativePath.toLowerCase().endsWith('.html')
  );
}

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

    const responseBody = shouldInjectWebglViewportFill({
      contentEncoding: inferred.contentEncoding,
      contentType,
      relativePath,
    })
      ? new TextEncoder().encode(
          injectWebglViewportFill(new TextDecoder().decode(downloaded.buffer))
        )
      : downloaded.buffer.slice();

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

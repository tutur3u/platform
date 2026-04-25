import type { Json } from '@tuturuuu/types';
import { sanitizePath } from '@tuturuuu/utils/storage-path';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireWorkspaceExternalProjectAccess } from '@/lib/external-projects/access';
import {
  createWorkspaceExternalProjectAsset,
  updateWorkspaceExternalProjectAsset,
} from '@/lib/external-projects/store';
import {
  buildWebglPackageArtifact,
  buildWebglPackageDestinationPrefix,
  isWebglZipUpload,
  WEBGL_PACKAGE_ASSET_TYPE,
  WebglPackageError,
} from '@/lib/external-projects/webgl-packages';
import {
  createWorkspaceStorageSignedReadUrl,
  listWorkspaceStorageRawObjectsForProvider,
  resolveWorkspaceStorageProvider,
  WorkspaceStorageError,
} from '@/lib/workspace-storage-provider';
import {
  buildWebglPackageUploadPath,
  getWebglPackageEntryContext,
  isCmsGamesEnabled,
  resolveWebglCallbackOrigin,
  resolveWebglPackageExtractConfig,
} from '../shared';

const finalizeSchema = z.object({
  archivePath: z.string().min(1).max(1024),
  contentType: z.string().max(255).optional(),
  entryId: z.string().uuid(),
  originalFilename: z.string().max(255).optional(),
});

async function extractWebglArchive(input: {
  archivePath: string;
  destinationPrefix: string;
  request: Request;
  wsId: string;
}) {
  const config = await resolveWebglPackageExtractConfig(input.wsId);

  if (!config.configured || !config.proxyUrl || !config.proxyToken) {
    throw new WebglPackageError(
      'WebGL ZIP extraction is unavailable because the unzip proxy is not configured.',
      500
    );
  }

  const sourceUrl = await createWorkspaceStorageSignedReadUrl(
    input.wsId,
    input.archivePath,
    {
      expiresIn: 900,
    }
  );
  const callbackOrigin = resolveWebglCallbackOrigin(
    new URL(input.request.url).origin
  );
  const callbackUrl = new URL(
    `/api/v1/workspaces/${encodeURIComponent(input.wsId)}/external-projects/webgl-packages/extract-callback`,
    callbackOrigin
  ).toString();
  const response = await fetch(config.proxyUrl, {
    body: JSON.stringify({
      callbackToken: config.proxyToken,
      callbackUrl,
      destinationPrefix: input.destinationPrefix,
      sourceUrl,
    }),
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${config.proxyToken}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new WebglPackageError(
      message || `WebGL ZIP extraction failed with status ${response.status}.`,
      response.status
    );
  }

  return (await response.json().catch(() => null)) as {
    files?: number;
    folders?: number;
    message?: string;
  } | null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;
  const access = await requireWorkspaceExternalProjectAccess({
    mode: 'manage',
    request,
    wsId,
  });
  if (!access.ok) return access.response;

  try {
    if (!(await isCmsGamesEnabled(access.normalizedWorkspaceId))) {
      return NextResponse.json(
        { error: 'CMS Games is disabled for this workspace.' },
        { status: 403 }
      );
    }

    const payload = finalizeSchema.parse(await request.json());
    const archivePath = sanitizePath(payload.archivePath);

    if (
      !archivePath ||
      !isWebglZipUpload({
        contentType: payload.contentType,
        filename: payload.originalFilename || archivePath,
      })
    ) {
      return NextResponse.json(
        { error: 'WebGL package uploads must be ZIP archives.' },
        { status: 400 }
      );
    }

    const entry = await getWebglPackageEntryContext(
      access.admin,
      access.normalizedWorkspaceId,
      payload.entryId
    );
    if (!entry) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }

    const uploadPath = buildWebglPackageUploadPath({
      binding: access.binding,
      entry,
    });
    if (!archivePath.startsWith(`${uploadPath}/`)) {
      return NextResponse.json(
        { error: 'Archive path does not belong to this entry.' },
        { status: 400 }
      );
    }

    const destinationPrefix = buildWebglPackageDestinationPrefix(archivePath);
    const extract = await extractWebglArchive({
      archivePath,
      destinationPrefix,
      request,
      wsId: access.normalizedWorkspaceId,
    });
    const resolvedProvider = await resolveWorkspaceStorageProvider(
      access.normalizedWorkspaceId
    );
    const rawObjects = await listWorkspaceStorageRawObjectsForProvider(
      access.normalizedWorkspaceId,
      resolvedProvider.provider,
      {
        pathPrefix: destinationPrefix,
      }
    );
    const files = rawObjects
      .filter(
        (object) =>
          !object.isFolderPlaceholder &&
          object.path.startsWith(`${destinationPrefix}/`)
      )
      .map((object) => ({
        contentType: object.contentType ?? null,
        path: object.path,
        size: object.size,
      }));

    const { data: existingAsset, error: existingAssetError } =
      await access.admin
        .from('workspace_external_project_assets')
        .select('*')
        .eq('ws_id', access.normalizedWorkspaceId)
        .eq('entry_id', payload.entryId)
        .eq('asset_type', WEBGL_PACKAGE_ASSET_TYPE)
        .maybeSingle();

    if (existingAssetError) {
      throw new Error(existingAssetError.message);
    }

    const asset =
      existingAsset ??
      (await createWorkspaceExternalProjectAsset(
        {
          actorId: access.user.id,
          asset_type: WEBGL_PACKAGE_ASSET_TYPE,
          entry_id: payload.entryId,
          metadata: {},
          sort_order: 0,
          source_url: null,
          storage_path: destinationPrefix,
          workspaceId: access.normalizedWorkspaceId,
        },
        access.admin
      ));
    const artifact = buildWebglPackageArtifact({
      archivePath,
      assetId: asset.id,
      files,
      provider: resolvedProvider.provider,
      wsId: access.normalizedWorkspaceId,
    });
    const updatedAsset = await updateWorkspaceExternalProjectAsset(
      asset.id,
      {
        actorId: access.user.id,
        asset_type: WEBGL_PACKAGE_ASSET_TYPE,
        entry_id: payload.entryId,
        metadata: artifact as Json,
        source_url: null,
        storage_path: artifact.rootPath,
      },
      access.admin
    );

    return NextResponse.json({
      artifact,
      asset: updatedAsset,
      extract: {
        files: extract?.files ?? files.length,
        folders: extract?.folders ?? 0,
        message:
          extract?.message ||
          'WebGL package uploaded and extracted successfully.',
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { details: error.flatten(), error: 'Invalid payload' },
        { status: 400 }
      );
    }

    if (error instanceof WebglPackageError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    if (error instanceof WorkspaceStorageError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    console.error('Failed to finalize WebGL package upload', error);
    return NextResponse.json(
      { error: 'Failed to finalize WebGL package upload' },
      { status: 500 }
    );
  }
}

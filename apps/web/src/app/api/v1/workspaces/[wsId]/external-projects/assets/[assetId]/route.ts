import { StorageDownloadError } from '@tuturuuu/storage-core/storage-download-token';
import {
  WORKSPACE_STORAGE_PROVIDER_OPTIONS,
  WORKSPACE_STORAGE_PROVIDER_R2,
  WORKSPACE_STORAGE_PROVIDER_SUPABASE,
  type WorkspaceStorageProvider,
} from '@tuturuuu/storage-core/workspace-storage-config';
import {
  createWorkspaceStorageSignedReadUrl,
  resolveWorkspaceStorageProvider,
  WorkspaceStorageError,
} from '@tuturuuu/storage-core/workspace-storage-provider';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { imageTransformOptionsSchema, type Json } from '@tuturuuu/types';
import { resolveWorkspaceId } from '@tuturuuu/utils/constants';
import { connection, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  requireWorkspaceExternalProjectAccess,
  resolveWorkspaceExternalProjectBinding,
} from '@/lib/external-projects/access';
import { getExternalProjectAssetRevision } from '@/lib/external-projects/asset-delivery-url';
import { resolveAllowedAssetRedirectUrl } from '@/lib/external-projects/asset-redirect-policy';
import { guardExternalProjectAssetSourceUrl } from '@/lib/external-projects/asset-source-guard';
import { EXTERNAL_PROJECT_PRIVATE_CACHE_CONTROL } from '@/lib/external-projects/cache';
import { publicExternalProjectAssetResponse } from '@/lib/external-projects/public-asset-response';
import {
  assetBytesDigest,
  readExternalProjectAssetBytes,
} from '@/lib/external-projects/asset-publication-bytes';
import { readPublishedAssetDigest } from '@/lib/external-projects/published-assets';
import {
  EXTERNAL_PROJECTS_STORAGE_PREFIX,
  isExternalProjectStoragePath,
} from '@/lib/external-projects/storage-path';
import {
  deleteWorkspaceExternalProjectAsset as deleteWorkspaceExternalProjectAssetInStore,
  updateWorkspaceExternalProjectAsset,
} from '@/lib/external-projects/store';

function getAssetStorageProvider(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }

  const provider = (metadata as Record<string, unknown>).provider;
  return typeof provider === 'string' &&
    WORKSPACE_STORAGE_PROVIDER_OPTIONS.includes(
      provider as WorkspaceStorageProvider
    )
    ? (provider as WorkspaceStorageProvider)
    : null;
}

function getProviderCandidates(input: {
  activeProvider: WorkspaceStorageProvider;
  metadataProvider: WorkspaceStorageProvider | null;
}) {
  const primaryProvider = input.metadataProvider ?? input.activeProvider;
  const fallbackProvider =
    primaryProvider === WORKSPACE_STORAGE_PROVIDER_R2
      ? WORKSPACE_STORAGE_PROVIDER_SUPABASE
      : WORKSPACE_STORAGE_PROVIDER_R2;

  return [primaryProvider, fallbackProvider] as const;
}

const assetStoragePathSchema = z
  .string()
  .max(1024)
  .refine((path) => isExternalProjectStoragePath(path), {
    message: `storage_path must be under ${EXTERNAL_PROJECTS_STORAGE_PREFIX}`,
  });

const updateAssetSchema = z.object({
  alt_text: z.string().max(500).nullable().optional(),
  asset_type: z.string().min(1).max(120).optional(),
  block_id: z.string().uuid().nullable().optional(),
  entry_id: z.string().uuid().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  sort_order: z.number().int().min(0).optional(),
  source_url: z.string().url().nullable().optional(),
  storage_path: assetStoragePathSchema.nullable().optional(),
});

const assetTransformQuerySchema = z
  .object({
    width: z.coerce.number().int().min(1).max(2500).finite().optional(),
    height: z.coerce.number().int().min(1).max(2500).finite().optional(),
    resize: z.enum(['cover', 'contain', 'fill']).optional(),
    quality: z.coerce.number().int().min(20).max(100).finite().optional(),
    format: z.literal('origin').optional(),
  })
  .transform((value) => {
    const hasTransform =
      value.width !== undefined ||
      value.height !== undefined ||
      value.resize !== undefined ||
      value.quality !== undefined ||
      value.format !== undefined;

    if (!hasTransform) {
      return undefined;
    }

    return imageTransformOptionsSchema.parse({
      format: value.format,
      height: value.height,
      quality: value.quality,
      resize: value.resize,
      width: value.width,
    });
  });

const privateHeaders = {
  'Cache-Control': EXTERNAL_PROJECT_PRIVATE_CACHE_CONTROL,
  'Vercel-CDN-Cache-Control': 'no-store',
};

async function readAsset(
  admin: TypedSupabaseClient,
  workspaceId: string,
  assetId: string,
  revision: string | null
) {
  const binding = await resolveWorkspaceExternalProjectBinding(
    workspaceId,
    admin
  );
  if (!binding.enabled || !binding.canonical_project) return null;
  const { data: asset, error } = await admin
    .from('workspace_external_project_assets')
    .select(
      'id, ws_id, entry_id, asset_type, metadata, source_url, storage_path, updated_at, workspace_external_project_entries!inner(status,published_at,updated_at,metadata,workspace_external_project_collections!inner(slug,config))'
    )
    .eq('id', assetId)
    .eq('ws_id', workspaceId)
    .single();
  if (error || !asset) return null;

  const currentRevision = asset.updated_at
    ? getExternalProjectAssetRevision(asset.updated_at)
    : null;
  const digest =
    revision === null || revision === currentRevision
      ? await readPublishedAssetDigest(
          admin,
          workspaceId,
          binding.canonical_project.id,
          asset,
          asset.workspace_external_project_entries
        )
      : null;
  return { asset, digest };
}

type AssetParams = { params: Promise<{ assetId: string; wsId: string }> };

export async function HEAD(request: Request, { params }: AssetParams) {
  const query = new URL(request.url).searchParams;
  if (!query.has('entry')) {
    const response = await GET(request, { params });
    void response.body?.cancel().catch(() => {});
    return new NextResponse(null, {
      status: response.status,
      headers: response.headers,
    });
  }
  await connection();
  const { assetId, wsId } = await params;
  const entryId = query.get('entry');
  const revision = query.get('v');
  if (!entryId || !revision)
    return new NextResponse(null, { status: 404, headers: privateHeaders });
  try {
    const admin = await createAdminClient();
    const result = await readAsset(
      admin,
      resolveWorkspaceId(wsId),
      assetId,
      revision
    );
    if (!result?.digest || result.asset.entry_id !== entryId) {
      return new NextResponse(null, { status: 404, headers: privateHeaders });
    }
    const object = await readExternalProjectAssetBytes(
      resolveWorkspaceId(wsId),
      result.asset.storage_path
    );
    const current =
      object && assetBytesDigest(object.buffer) === result.digest
        ? await readAsset(admin, resolveWorkspaceId(wsId), assetId, revision)
        : null;
    if (
      !current ||
      current.digest !== result.digest ||
      current.asset.entry_id !== entryId
    )
      return new NextResponse(null, { status: 404, headers: privateHeaders });
    return new NextResponse(null, {
      status: 204,
      headers: {
        ...privateHeaders,
        'X-Tuturuuu-Published-Asset-Revision': revision,
      },
    });
  } catch (error) {
    console.error('Failed to verify external project asset publication', error);
    return new NextResponse(null, { status: 503, headers: privateHeaders });
  }
}

export async function GET(request: Request, { params }: AssetParams) {
  await connection();
  const { assetId, wsId } = await params;
  const admin = (await createAdminClient()) as TypedSupabaseClient;
  const resolvedWsId = resolveWorkspaceId(wsId);
  const privateJson = (body: unknown, status: number) =>
    NextResponse.json(body, { headers: privateHeaders, status });
  const redirect = (url: string) =>
    NextResponse.redirect(url, { headers: privateHeaders, status: 307 });

  try {
    const query = new URL(request.url).searchParams;
    const transform = assetTransformQuerySchema.parse(
      Object.fromEntries(query.entries())
    );
    const result = await readAsset(
      admin,
      resolvedWsId,
      assetId,
      query.get('v')
    );
    if (!result) return privateJson({ error: 'Asset not found' }, 404);
    const { asset, digest } = result;
    if (digest) {
      const object = await readExternalProjectAssetBytes(
        resolvedWsId,
        asset.storage_path
      );
      if (!object || assetBytesDigest(object.buffer) !== digest)
        return privateJson({ error: 'Asset not available' }, 404);
      const response = await publicExternalProjectAssetResponse(
        object,
        transform,
        privateHeaders,
        request.headers.get('range')
      );
      const current =
        response &&
        (await readAsset(
          admin,
          resolvedWsId,
          assetId,
          getExternalProjectAssetRevision(asset.updated_at)
        ));
      if (
        !response ||
        !current ||
        current.digest !== digest ||
        current.asset.entry_id !== asset.entry_id
      ) {
        void response?.body?.cancel().catch(() => {});
        return privateJson({ error: 'Asset not available' }, 404);
      }
      return response;
    }

    const access = await requireWorkspaceExternalProjectAccess({
      mode: 'read',
      request,
      wsId,
    });
    if (!access.ok) return privateJson({ error: 'Asset not found' }, 404);

    // A refused source falls through to the stored object, if there is one.
    const sourceUrl = asset.source_url
      ? resolveAllowedAssetRedirectUrl(asset.source_url)
      : null;
    if (sourceUrl) {
      try {
        return redirect(
          guardExternalProjectAssetSourceUrl(sourceUrl.toString(), resolvedWsId)
        );
      } catch (error) {
        if (error instanceof StorageDownloadError && error.status === 503)
          return privateJson(
            { error: 'Asset delivery temporarily unavailable' },
            503
          );
        return privateJson({ error: 'Asset not available' }, 404);
      }
    }

    if (!asset.storage_path) {
      return privateJson({ error: 'Asset not available' }, 404);
    }

    if (!isExternalProjectStoragePath(asset.storage_path)) {
      return privateJson({ error: 'Asset not available' }, 404);
    }

    const { provider: activeProvider } =
      await resolveWorkspaceStorageProvider(resolvedWsId);
    const providerCandidates = getProviderCandidates({
      activeProvider,
      metadataProvider: getAssetStorageProvider(asset.metadata),
    });

    for (const provider of providerCandidates) {
      try {
        const signedUrl = await createWorkspaceStorageSignedReadUrl(
          resolvedWsId,
          asset.storage_path,
          {
            expiresIn: 7 * 24 * 60 * 60,
            provider,
            requireExists: true,
            transform:
              provider === WORKSPACE_STORAGE_PROVIDER_SUPABASE
                ? transform
                : undefined,
          }
        );

        return redirect(signedUrl);
      } catch (error) {
        if (error instanceof WorkspaceStorageError && error.status === 404) {
          continue;
        }

        if (
          error instanceof WorkspaceStorageError &&
          error.message.includes('not fully configured')
        ) {
          continue;
        }

        throw error;
      }
    }

    return privateJson({ error: 'Asset not available' }, 404);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return privateJson(
        { error: 'Invalid transform query', details: error.flatten() },
        400
      );
    }

    console.error('Failed to resolve external project asset', error);
    return privateJson(
      { error: 'Failed to resolve external project asset' },
      500
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ assetId: string; wsId: string }> }
) {
  const { assetId, wsId } = await params;
  const access = await requireWorkspaceExternalProjectAccess({
    mode: 'manage',
    request,
    wsId,
  });
  if (!access.ok) return access.response;

  try {
    const payload = updateAssetSchema.parse(await request.json());
    for (const [table, id] of [
      ['workspace_external_project_entries', payload.entry_id],
      ['workspace_external_project_blocks', payload.block_id],
    ] as const) {
      if (!id) continue;
      const { data: parent, error: parentError } = await access.admin
        .from(table)
        .select('id')
        .eq('ws_id', access.normalizedWorkspaceId)
        .eq('id', id)
        .maybeSingle();
      if (parentError)
        return NextResponse.json(
          { error: 'Failed to verify asset reference' },
          { status: 500 }
        );
      if (!parent)
        return NextResponse.json(
          { error: 'Asset reference not found' },
          { status: 404 }
        );
    }
    const asset = await updateWorkspaceExternalProjectAsset(
      assetId,
      {
        actorId: access.user.id,
        alt_text: payload.alt_text,
        asset_type: payload.asset_type,
        block_id: payload.block_id,
        entry_id: payload.entry_id,
        metadata: payload.metadata as NonNullable<Json> | undefined,
        sort_order: payload.sort_order,
        source_url: payload.source_url,
        storage_path: payload.storage_path,
        workspaceId: access.normalizedWorkspaceId,
      },
      access.admin
    );

    return NextResponse.json(asset);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid payload', details: error.flatten() },
        { status: 400 }
      );
    }

    console.error('Failed to update workspace external project asset', error);
    return NextResponse.json(
      { error: 'Failed to update workspace external project asset' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ assetId: string; wsId: string }> }
) {
  const { assetId, wsId } = await params;
  const access = await requireWorkspaceExternalProjectAccess({
    mode: 'manage',
    request,
    wsId,
  });
  if (!access.ok) return access.response;

  try {
    const result = await deleteWorkspaceExternalProjectAssetInStore(
      assetId,
      {
        workspaceId: access.normalizedWorkspaceId,
      },
      access.admin
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to delete workspace external project asset', error);
    return NextResponse.json(
      { error: 'Failed to delete workspace external project asset' },
      { status: 500 }
    );
  }
}

import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { imageTransformOptionsSchema, type Json } from '@tuturuuu/types';
import { resolveWorkspaceId } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  requireWorkspaceExternalProjectAccess,
  resolveWorkspaceExternalProjectBinding,
} from '@/lib/external-projects/access';
import {
  deleteWorkspaceExternalProjectAsset as deleteWorkspaceExternalProjectAssetInStore,
  updateWorkspaceExternalProjectAsset,
} from '@/lib/external-projects/store';

function isStorageObjectMissing(message: string | null | undefined) {
  if (!message) {
    return false;
  }

  return message.toLowerCase().includes('object not found');
}

const updateAssetSchema = z.object({
  alt_text: z.string().max(500).nullable().optional(),
  asset_type: z.string().min(1).max(120).optional(),
  block_id: z.string().uuid().nullable().optional(),
  entry_id: z.string().uuid().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  sort_order: z.number().int().min(0).optional(),
  source_url: z.string().url().nullable().optional(),
  storage_path: z.string().max(1024).nullable().optional(),
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ assetId: string; wsId: string }> }
) {
  const { assetId, wsId } = await params;
  const admin = (await createAdminClient()) as TypedSupabaseClient;
  const resolvedWsId = resolveWorkspaceId(wsId);

  try {
    const transform = assetTransformQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams.entries())
    );
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
        'id, ws_id, entry_id, source_url, storage_path, workspace_external_project_entries!inner(status)'
      )
      .eq('id', assetId)
      .eq('ws_id', resolvedWsId)
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

    if (asset.source_url) {
      return NextResponse.redirect(asset.source_url, { status: 307 });
    }

    if (!asset.storage_path) {
      return NextResponse.json(
        { error: 'Asset not available' },
        { status: 404 }
      );
    }

    const { data: signed, error: signedError } = await admin.storage
      .from('workspaces')
      .createSignedUrl(`${resolvedWsId}/${asset.storage_path}`, 60 * 60, {
        transform: transform as never,
      });

    if (isStorageObjectMissing(signedError?.message)) {
      return NextResponse.json(
        { error: 'Asset not available' },
        { status: 404 }
      );
    }

    if (signedError || !signed?.signedUrl) {
      return NextResponse.json(
        { error: 'Failed to resolve asset URL' },
        { status: 500 }
      );
    }

    return NextResponse.redirect(signed.signedUrl, { status: 307 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid transform query', details: error.flatten() },
        { status: 400 }
      );
    }

    console.error('Failed to resolve external project asset', error);
    return NextResponse.json(
      { error: 'Failed to resolve external project asset' },
      { status: 500 }
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
    const asset = await updateWorkspaceExternalProjectAsset(
      assetId,
      {
        actorId: access.user.id,
        alt_text: payload.alt_text,
        asset_type: payload.asset_type,
        block_id: payload.block_id,
        entry_id: payload.entry_id,
        metadata: payload.metadata as Json | undefined,
        sort_order: payload.sort_order,
        source_url: payload.source_url,
        storage_path: payload.storage_path,
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

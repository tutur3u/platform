import type { Json } from '@tuturuuu/types';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireWorkspaceExternalProjectAccess } from '@/lib/external-projects/access';
import { createWorkspaceExternalProjectAsset } from '@/lib/external-projects/store';

const assetSchema = z
  .object({
    alt_text: z.string().max(500).nullable().optional(),
    asset_type: z.string().min(1).max(120),
    block_id: z.string().uuid().nullable().optional(),
    entry_id: z.string().uuid().nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).default({}),
    sort_order: z.number().int().min(0).optional(),
    source_url: z.string().url().nullable().optional(),
    storage_path: z.string().max(1024).nullable().optional(),
  })
  .refine((value) => Boolean(value.entry_id || value.block_id), {
    message: 'entry_id or block_id is required',
    path: ['entry_id'],
  });

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
    const payload = assetSchema.parse(await request.json());
    const asset = await createWorkspaceExternalProjectAsset(
      {
        actorId: access.user.id,
        alt_text: payload.alt_text,
        asset_type: payload.asset_type,
        block_id: payload.block_id,
        entry_id: payload.entry_id,
        metadata: payload.metadata as Json,
        sort_order: payload.sort_order,
        source_url: payload.source_url,
        storage_path: payload.storage_path,
        workspaceId: access.normalizedWorkspaceId,
      },
      access.admin
    );

    return NextResponse.json(asset, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid payload', details: error.flatten() },
        { status: 400 }
      );
    }

    console.error('Failed to create workspace external project asset', error);
    return NextResponse.json(
      { error: 'Failed to create workspace external project asset' },
      { status: 500 }
    );
  }
}

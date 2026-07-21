import type { Json } from '@tuturuuu/types';
import { connection, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireWorkspaceExternalProjectAccess } from '@/lib/external-projects/access';
import {
  EXTERNAL_PROJECTS_STORAGE_PREFIX,
  isExternalProjectStoragePath,
} from '@/lib/external-projects/storage-path';
import { createWorkspaceExternalProjectAsset } from '@/lib/external-projects/store';
import { listWorkspaceExternalProjectMediaPage } from '@/lib/external-projects/store-media';

const mediaQuerySchema = z.object({
  attachment: z.enum(['all', 'attached', 'unattached']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(24),
  q: z.string().trim().max(120).default(''),
  type: z.enum(['all', 'image', 'audio', 'other']).default('all'),
});

const assetStoragePathSchema = z
  .string()
  .max(1024)
  .refine((path) => isExternalProjectStoragePath(path), {
    message: `storage_path must be under ${EXTERNAL_PROJECTS_STORAGE_PREFIX}`,
  });

const assetSchema = z
  .object({
    alt_text: z.string().max(500).nullable().optional(),
    asset_type: z.string().min(1).max(120),
    block_id: z.string().uuid().nullable().optional(),
    entry_id: z.string().uuid().nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).default({}),
    sort_order: z.number().int().min(0).optional(),
    source_url: z.string().url().nullable().optional(),
    storage_path: assetStoragePathSchema.nullable().optional(),
  })
  .refine((value) => Boolean(value.entry_id || value.block_id), {
    message: 'entry_id or block_id is required',
    path: ['entry_id'],
  });

export async function GET(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  await connection();
  const { wsId } = await params;
  const access = await requireWorkspaceExternalProjectAccess({
    mode: 'read',
    request,
    wsId,
  });
  if (!access.ok) return access.response;

  try {
    const parsed = mediaQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams)
    );
    const page = await listWorkspaceExternalProjectMediaPage(
      access.normalizedWorkspaceId,
      {
        attachment: parsed.attachment,
        page: parsed.page,
        pageSize: parsed.pageSize,
        query: parsed.q,
        type: parsed.type,
      },
      access.admin
    );

    return NextResponse.json(page, {
      headers: {
        'Cache-Control': 'private, max-age=30, stale-while-revalidate=300',
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid query', details: error.flatten() },
        { status: 400 }
      );
    }

    console.error('Failed to list workspace external project media', error);
    return NextResponse.json(
      { error: 'Failed to list workspace external project media' },
      { status: 500 }
    );
  }
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

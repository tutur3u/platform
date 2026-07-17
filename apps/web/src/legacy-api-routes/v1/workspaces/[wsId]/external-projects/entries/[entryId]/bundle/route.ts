import type { Json } from '@tuturuuu/types';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireWorkspaceExternalProjectAccess } from '@/lib/external-projects/access';
import { EXTERNAL_PROJECT_PRIVATE_CACHE_CONTROL } from '@/lib/external-projects/cache';
import { upsertWorkspaceExternalProjectEntryBundle } from '@/lib/external-projects/store-relations';

const jsonObjectSchema = z.record(z.string(), z.unknown());
const updateBundleSchema = z.object({
  blocks: z.array(
    z.object({
      blockType: z.string().trim().min(1).max(120),
      content: jsonObjectSchema.default({}),
      id: z.string().uuid().optional(),
      sortOrder: z.number().int().min(0).default(0),
      stableSourceId: z.string().trim().max(200).nullable().optional(),
      title: z.string().max(200).nullable().optional(),
    })
  ),
  entry: z
    .object({
      collectionId: z.string().uuid().optional(),
      metadata: jsonObjectSchema.optional(),
      profileData: jsonObjectSchema.optional(),
      scheduledFor: z.string().datetime().nullable().optional(),
      slug: z.string().trim().min(1).max(120).optional(),
      sortOrder: z.number().int().optional(),
      status: z
        .enum(['draft', 'scheduled', 'published', 'archived'])
        .optional(),
      subtitle: z.string().max(200).nullable().optional(),
      summary: z.string().max(1000).nullable().optional(),
      title: z.string().trim().min(1).max(160).optional(),
    })
    .default({}),
  expectedUpdatedAt: z.string().datetime(),
  relations: z.array(
    z.object({
      definitionId: z.string().uuid(),
      metadata: jsonObjectSchema.default({}),
      sortOrder: z.number().int().min(0).default(0),
      toEntryId: z.string().uuid(),
    })
  ),
});
const privateHeaders = {
  'Cache-Control': EXTERNAL_PROJECT_PRIVATE_CACHE_CONTROL,
};

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ entryId: string; wsId: string }> }
) {
  const { entryId, wsId } = await params;
  const access = await requireWorkspaceExternalProjectAccess({
    mode: 'manage',
    request,
    wsId,
  });
  if (!access.ok) return access.response;

  try {
    const parsedEntryId = z.string().uuid().parse(entryId);
    const payload = updateBundleSchema.parse(
      await request.json().catch(() => null)
    );
    const bundle = await upsertWorkspaceExternalProjectEntryBundle(
      {
        actorId: access.user.id,
        blocks: payload.blocks.map((block) => ({
          ...block,
          content: block.content as Json,
        })),
        entry: {
          ...payload.entry,
          metadata: payload.entry.metadata as Json | undefined,
          profileData: payload.entry.profileData as Json | undefined,
        },
        entryId: parsedEntryId,
        expectedUpdatedAt: payload.expectedUpdatedAt,
        relations: payload.relations.map((relation) => ({
          ...relation,
          metadata: relation.metadata as Json,
        })),
        workspaceId: access.normalizedWorkspaceId,
      },
      access.admin
    );
    return NextResponse.json(bundle, { headers: privateHeaders });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { details: error.flatten(), error: 'Invalid entry bundle' },
        { headers: privateHeaders, status: 400 }
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith('40001:')) {
      return NextResponse.json(
        { error: 'Entry was updated by another editor' },
        { headers: privateHeaders, status: 409 }
      );
    }
    if (message.startsWith('42501:')) {
      return NextResponse.json(
        { error: 'Insufficient external project permissions' },
        { headers: privateHeaders, status: 403 }
      );
    }
    if (message.startsWith('P0002:')) {
      return NextResponse.json(
        { error: 'Entry not found' },
        { headers: privateHeaders, status: 404 }
      );
    }
    if (/^(23502|23503|23505|23514|22023):/.test(message)) {
      return NextResponse.json(
        { error: message.replace(/^\w+:/, '') },
        { headers: privateHeaders, status: 400 }
      );
    }
    console.error('Failed to update external project entry bundle', error);
    return NextResponse.json(
      { error: 'Failed to update entry bundle' },
      { headers: privateHeaders, status: 500 }
    );
  }
}

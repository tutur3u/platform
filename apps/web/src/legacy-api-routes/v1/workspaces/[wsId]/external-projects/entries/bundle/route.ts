import type { Json } from '@tuturuuu/types';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireWorkspaceExternalProjectAccess } from '@/lib/external-projects/access';
import { EXTERNAL_PROJECT_PRIVATE_CACHE_CONTROL } from '@/lib/external-projects/cache';
import { upsertWorkspaceExternalProjectEntryBundle } from '@/lib/external-projects/store-relations';

const jsonObjectSchema = z.record(z.string(), z.unknown());
const blockSchema = z.object({
  blockType: z.string().trim().min(1).max(120),
  content: jsonObjectSchema.default({}),
  id: z.string().uuid().optional(),
  sortOrder: z.number().int().min(0).default(0),
  stableSourceId: z.string().trim().max(200).nullable().optional(),
  title: z.string().max(200).nullable().optional(),
});
const relationSchema = z.object({
  definitionId: z.string().uuid(),
  metadata: jsonObjectSchema.default({}),
  sortOrder: z.number().int().min(0).default(0),
  toEntryId: z.string().uuid(),
});
const createBundleSchema = z.object({
  blocks: z.array(blockSchema).default([]),
  entry: z.object({
    collectionId: z.string().uuid(),
    metadata: jsonObjectSchema.default({}),
    profileData: jsonObjectSchema.default({}),
    scheduledFor: z.string().datetime().nullable().optional(),
    slug: z.string().trim().min(1).max(120),
    sortOrder: z.number().int().default(0),
    stableSourceId: z.string().trim().max(200).nullable().optional(),
    status: z
      .enum(['draft', 'scheduled', 'published', 'archived'])
      .default('draft'),
    subtitle: z.string().max(200).nullable().optional(),
    summary: z.string().max(1000).nullable().optional(),
    title: z.string().trim().min(1).max(160),
  }),
  relations: z.array(relationSchema).default([]),
});
const privateHeaders = {
  'Cache-Control': EXTERNAL_PROJECT_PRIVATE_CACHE_CONTROL,
};

function bundleErrorResponse(error: unknown) {
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { details: error.flatten(), error: 'Invalid entry bundle' },
      { headers: privateHeaders, status: 400 }
    );
  }
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith('42501:')) {
    return NextResponse.json(
      { error: 'Insufficient external project permissions' },
      { headers: privateHeaders, status: 403 }
    );
  }
  if (/^(23502|23503|23505|23514|22023):/.test(message)) {
    return NextResponse.json(
      { error: message.replace(/^\w+:/, '') },
      { headers: privateHeaders, status: 400 }
    );
  }
  console.error('Failed to create external project entry bundle', error);
  return NextResponse.json(
    { error: 'Failed to create entry bundle' },
    { headers: privateHeaders, status: 500 }
  );
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
    const payload = createBundleSchema.parse(
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
          metadata: payload.entry.metadata as Json,
          profileData: payload.entry.profileData as Json,
        },
        relations: payload.relations.map((relation) => ({
          ...relation,
          metadata: relation.metadata as Json,
        })),
        workspaceId: access.normalizedWorkspaceId,
      },
      access.admin
    );
    return NextResponse.json(bundle, {
      headers: privateHeaders,
      status: 201,
    });
  } catch (error) {
    return bundleErrorResponse(error);
  }
}

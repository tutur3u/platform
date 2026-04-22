import type { Json } from '@tuturuuu/types';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireWorkspaceExternalProjectAccess } from '@/lib/external-projects/access';
import {
  createWorkspaceExternalProjectEntry,
  listWorkspaceExternalProjectEntries,
} from '@/lib/external-projects/store';

const entrySchema = z.object({
  collection_id: z.string().uuid(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  profile_data: z.record(z.string(), z.unknown()).default({}),
  scheduled_for: z.string().datetime().nullable().optional(),
  slug: z.string().min(1).max(120),
  status: z
    .enum(['draft', 'scheduled', 'published', 'archived'])
    .default('draft'),
  subtitle: z.string().max(200).nullable().optional(),
  summary: z.string().max(1000).nullable().optional(),
  title: z.string().min(1).max(160),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;
  const access = await requireWorkspaceExternalProjectAccess({
    mode: 'read',
    request,
    wsId,
  });
  if (!access.ok) return access.response;

  try {
    const url = new URL(request.url);
    const collectionId = url.searchParams.get('collectionId') ?? undefined;
    const entries = await listWorkspaceExternalProjectEntries(
      access.normalizedWorkspaceId,
      {
        collectionId,
        includeDrafts: true,
      },
      access.admin
    );
    return NextResponse.json(entries);
  } catch (error) {
    console.error('Failed to list workspace external project entries', error);
    return NextResponse.json(
      { error: 'Failed to list workspace external project entries' },
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
    const body = await request.json();
    const payload = entrySchema.parse(body);
    const entry = await createWorkspaceExternalProjectEntry(
      {
        actorId: access.user.id,
        collection_id: payload.collection_id,
        metadata: payload.metadata as Json,
        profile_data: payload.profile_data as Json,
        scheduled_for: payload.scheduled_for ?? null,
        slug: payload.slug,
        status: payload.status,
        subtitle: payload.subtitle ?? null,
        summary: payload.summary ?? null,
        title: payload.title,
        workspaceId: access.normalizedWorkspaceId,
      },
      access.admin
    );

    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid payload', details: error.flatten() },
        { status: 400 }
      );
    }

    console.error('Failed to create workspace external project entry', error);
    return NextResponse.json(
      { error: 'Failed to create workspace external project entry' },
      { status: 500 }
    );
  }
}

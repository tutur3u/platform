import type { Json } from '@tuturuuu/types';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { MAX_PUBLISHED_ENTRY_ASSETS } from '@/lib/external-projects/published-assets';
import { requireWorkspaceExternalProjectAccess } from '@/lib/external-projects/access';
import {
  deleteWorkspaceExternalProjectEntry,
  updateWorkspaceExternalProjectEntry,
} from '@/lib/external-projects/store';
import {
  StudioMediaConflict,
  updateStudioMedia,
} from '@/lib/external-projects/studio-media';

const studioMediaSchema = z
  .object({
    studio_media: z.object({
      audio: z
        .array(z.string().uuid())
        .max(MAX_PUBLISHED_ENTRY_ASSETS)
        .optional(),
      cover: z.string().uuid().optional(),
      gallery: z
        .array(z.string().uuid())
        .max(MAX_PUBLISHED_ENTRY_ASSETS)
        .optional(),
    }),
  })
  .strict();

const updateEntrySchema = z.object({
  metadata: z.record(z.string(), z.unknown()).optional(),
  profile_data: z.record(z.string(), z.unknown()).optional(),
  scheduled_for: z.string().datetime().nullable().optional(),
  slug: z.string().min(1).max(120).optional(),
  status: z.enum(['draft', 'scheduled', 'published', 'archived']).optional(),
  subtitle: z.string().max(200).nullable().optional(),
  summary: z.string().max(1000).nullable().optional(),
  title: z.string().min(1).max(160).optional(),
});

export async function PATCH(
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
    const body: unknown = await request.json();
    if (body && typeof body === 'object' && 'studio_media' in body) {
      const { studio_media: selection } = studioMediaSchema.parse(body);
      const entry = await updateStudioMedia(access.admin, {
        actorId: access.user.id,
        entryId,
        selection,
        workspaceId: access.normalizedWorkspaceId,
      });
      return NextResponse.json(entry);
    }
    const payload = updateEntrySchema.parse(body);
    const entry = await updateWorkspaceExternalProjectEntry(
      entryId,
      {
        actorId: access.user.id,
        metadata: payload.metadata as NonNullable<Json> | undefined,
        profile_data: payload.profile_data as NonNullable<Json> | undefined,
        scheduled_for: payload.scheduled_for,
        slug: payload.slug,
        status: payload.status,
        subtitle: payload.subtitle,
        summary: payload.summary,
        title: payload.title,
        workspaceId: access.normalizedWorkspaceId,
      },
      access.admin
    );

    return NextResponse.json(entry);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid payload', details: error.flatten() },
        { status: 400 }
      );
    }

    if (error instanceof StudioMediaConflict) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('Failed to update workspace external project entry', error);
    return NextResponse.json(
      { error: 'Failed to update workspace external project entry' },
      { status: 500 }
    );
  }
}

export async function DELETE(
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
    const result = await deleteWorkspaceExternalProjectEntry(
      entryId,
      {
        workspaceId: access.normalizedWorkspaceId,
      },
      access.admin
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to delete workspace external project entry', error);
    return NextResponse.json(
      { error: 'Failed to delete workspace external project entry' },
      { status: 500 }
    );
  }
}

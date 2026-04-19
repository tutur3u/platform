import type { Json } from '@tuturuuu/types';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireWorkspaceExternalProjectAccess } from '@/lib/external-projects/access';
import {
  deleteWorkspaceExternalProjectEntry,
  updateWorkspaceExternalProjectEntry,
} from '@/lib/external-projects/store';

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
    const body = await request.json();
    const payload = updateEntrySchema.parse(body);
    const entry = await updateWorkspaceExternalProjectEntry(
      entryId,
      {
        actorId: access.user.id,
        metadata: payload.metadata as Json | undefined,
        profile_data: payload.profile_data as Json | undefined,
        scheduled_for: payload.scheduled_for,
        slug: payload.slug,
        status: payload.status,
        subtitle: payload.subtitle,
        summary: payload.summary,
        title: payload.title,
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

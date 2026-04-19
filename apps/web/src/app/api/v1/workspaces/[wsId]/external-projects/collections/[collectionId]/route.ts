import type { Json } from '@tuturuuu/types';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireWorkspaceExternalProjectAccess } from '@/lib/external-projects/access';
import {
  deleteWorkspaceExternalProjectCollection,
  updateWorkspaceExternalProjectCollection,
} from '@/lib/external-projects/store';

const updateCollectionSchema = z.object({
  collection_type: z.string().min(1).max(120).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  description: z.string().max(500).nullable().optional(),
  is_enabled: z.boolean().optional(),
  slug: z.string().min(1).max(120).optional(),
  title: z.string().min(1).max(120).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ collectionId: string; wsId: string }> }
) {
  const { collectionId, wsId } = await params;
  const access = await requireWorkspaceExternalProjectAccess({
    mode: 'manage',
    request,
    wsId,
  });
  if (!access.ok) return access.response;

  try {
    const body = await request.json();
    const payload = updateCollectionSchema.parse(body);
    const collection = await updateWorkspaceExternalProjectCollection(
      collectionId,
      {
        actorId: access.user.id,
        collection_type: payload.collection_type,
        config: payload.config as Json | undefined,
        description: payload.description,
        is_enabled: payload.is_enabled,
        slug: payload.slug,
        title: payload.title,
      },
      access.admin
    );

    return NextResponse.json(collection);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid payload', details: error.flatten() },
        { status: 400 }
      );
    }

    console.error(
      'Failed to update workspace external project collection',
      error
    );
    return NextResponse.json(
      { error: 'Failed to update workspace external project collection' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ collectionId: string; wsId: string }> }
) {
  const { collectionId, wsId } = await params;
  const access = await requireWorkspaceExternalProjectAccess({
    mode: 'manage',
    request,
    wsId,
  });
  if (!access.ok) return access.response;

  try {
    const result = await deleteWorkspaceExternalProjectCollection(
      collectionId,
      {
        workspaceId: access.normalizedWorkspaceId,
      },
      access.admin
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error(
      'Failed to delete workspace external project collection',
      error
    );
    return NextResponse.json(
      { error: 'Failed to delete workspace external project collection' },
      { status: 500 }
    );
  }
}

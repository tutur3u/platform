import type { Json } from '@tuturuuu/types';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireWorkspaceExternalProjectAccess } from '@/lib/external-projects/access';
import {
  createWorkspaceExternalProjectCollection,
  listWorkspaceExternalProjectCollections,
} from '@/lib/external-projects/store';

const collectionSchema = z.object({
  collection_type: z.string().min(1).max(120),
  config: z.record(z.string(), z.unknown()).default({}),
  description: z.string().max(500).optional(),
  slug: z.string().min(1).max(120),
  title: z.string().min(1).max(120),
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
    const collections = await listWorkspaceExternalProjectCollections(
      access.normalizedWorkspaceId,
      access.admin
    );
    return NextResponse.json(collections);
  } catch (error) {
    console.error(
      'Failed to list workspace external project collections',
      error
    );
    return NextResponse.json(
      { error: 'Failed to list workspace external project collections' },
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
    const payload = collectionSchema.parse(body);
    const collection = await createWorkspaceExternalProjectCollection(
      {
        actorId: access.user.id,
        collection_type: payload.collection_type,
        config: payload.config as Json,
        description: payload.description ?? null,
        slug: payload.slug,
        title: payload.title,
        workspaceId: access.normalizedWorkspaceId,
      },
      access.admin
    );

    return NextResponse.json(collection, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid payload', details: error.flatten() },
        { status: 400 }
      );
    }

    console.error(
      'Failed to create workspace external project collection',
      error
    );
    return NextResponse.json(
      { error: 'Failed to create workspace external project collection' },
      { status: 500 }
    );
  }
}

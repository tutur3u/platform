import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireWorkspaceExternalProjectAccess } from '@/lib/external-projects/access';
import { EXTERNAL_PROJECT_PRIVATE_CACHE_CONTROL } from '@/lib/external-projects/cache';
import {
  createWorkspaceExternalProjectRelationDefinition,
  listWorkspaceExternalProjectRelationDefinitions,
} from '@/lib/external-projects/store-relations';

const relationDefinitionSchema = z.object({
  cardinality: z.enum(['one', 'many']).default('many'),
  inverseLabel: z.string().trim().max(160).nullable().optional(),
  isRequired: z.boolean().default(false),
  key: z.string().trim().min(1).max(120).regex(/^\S+$/),
  label: z.string().trim().min(1).max(160),
  sortOrder: z.number().int().min(0).default(0),
  sourceCollectionId: z.string().uuid(),
  targetCollectionIds: z.array(z.string().uuid()).min(1),
});

const privateHeaders = {
  'Cache-Control': EXTERNAL_PROJECT_PRIVATE_CACHE_CONTROL,
};

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
    const definitions = await listWorkspaceExternalProjectRelationDefinitions(
      access.normalizedWorkspaceId,
      access.admin
    );
    return NextResponse.json(definitions, { headers: privateHeaders });
  } catch (error) {
    console.error(
      'Failed to list external project relation definitions',
      error
    );
    return NextResponse.json(
      { error: 'Failed to list relation definitions' },
      { headers: privateHeaders, status: 500 }
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
    const payload = relationDefinitionSchema.parse(await request.json());
    const definition = await createWorkspaceExternalProjectRelationDefinition(
      {
        actorId: access.user.id,
        ...payload,
        workspaceId: access.normalizedWorkspaceId,
      },
      access.admin
    );
    return NextResponse.json(definition, {
      headers: privateHeaders,
      status: 201,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { details: error.flatten(), error: 'Invalid relation definition' },
        { headers: privateHeaders, status: 400 }
      );
    }
    console.error(
      'Failed to create external project relation definition',
      error
    );
    return NextResponse.json(
      { error: 'Failed to create relation definition' },
      { headers: privateHeaders, status: 500 }
    );
  }
}

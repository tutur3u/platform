import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireWorkspaceExternalProjectAccess } from '@/lib/external-projects/access';
import { EXTERNAL_PROJECT_PRIVATE_CACHE_CONTROL } from '@/lib/external-projects/cache';
import {
  deleteWorkspaceExternalProjectRelationDefinition,
  updateWorkspaceExternalProjectRelationDefinition,
} from '@/lib/external-projects/store-relations';

const updateSchema = z.object({
  cardinality: z.enum(['one', 'many']).optional(),
  inverseLabel: z.string().trim().max(160).nullable().optional(),
  isRequired: z.boolean().optional(),
  key: z.string().trim().min(1).max(120).regex(/^\S+$/).optional(),
  label: z.string().trim().min(1).max(160).optional(),
  sortOrder: z.number().int().min(0).optional(),
  sourceCollectionId: z.string().uuid().optional(),
  targetCollectionIds: z.array(z.string().uuid()).min(1).optional(),
});
const idSchema = z.string().uuid();
const privateHeaders = {
  'Cache-Control': EXTERNAL_PROJECT_PRIVATE_CACHE_CONTROL,
};

type Params = {
  params: Promise<{ relationDefinitionId: string; wsId: string }>;
};

export async function PATCH(request: Request, { params }: Params) {
  const { relationDefinitionId, wsId } = await params;
  const access = await requireWorkspaceExternalProjectAccess({
    mode: 'manage',
    request,
    wsId,
  });
  if (!access.ok) return access.response;

  try {
    const id = idSchema.parse(relationDefinitionId);
    const payload = updateSchema.parse(await request.json());
    const definition = await updateWorkspaceExternalProjectRelationDefinition(
      id,
      {
        actorId: access.user.id,
        ...payload,
        workspaceId: access.normalizedWorkspaceId,
      },
      access.admin
    );
    if (!definition) {
      return NextResponse.json(
        { error: 'Relation definition not found' },
        { headers: privateHeaders, status: 404 }
      );
    }
    return NextResponse.json(definition, { headers: privateHeaders });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { details: error.flatten(), error: 'Invalid relation definition' },
        { headers: privateHeaders, status: 400 }
      );
    }
    console.error(
      'Failed to update external project relation definition',
      error
    );
    return NextResponse.json(
      { error: 'Failed to update relation definition' },
      { headers: privateHeaders, status: 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const { relationDefinitionId, wsId } = await params;
  const access = await requireWorkspaceExternalProjectAccess({
    mode: 'manage',
    request,
    wsId,
  });
  if (!access.ok) return access.response;

  try {
    const id = idSchema.parse(relationDefinitionId);
    const result = await deleteWorkspaceExternalProjectRelationDefinition(
      id,
      access.normalizedWorkspaceId,
      access.admin
    );
    return NextResponse.json(result, { headers: privateHeaders });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid relation definition id' },
        { headers: privateHeaders, status: 400 }
      );
    }
    console.error(
      'Failed to delete external project relation definition',
      error
    );
    return NextResponse.json(
      { error: 'Failed to delete relation definition' },
      { headers: privateHeaders, status: 500 }
    );
  }
}

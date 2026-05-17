import type { Json } from '@tuturuuu/types';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireWorkspaceExternalProjectAccess } from '@/lib/external-projects/access';
import {
  deleteWorkspaceExternalProjectFieldDefinition,
  updateWorkspaceExternalProjectFieldDefinition,
} from '@/lib/external-projects/store';
import {
  serverLogger,
  withRequestLogDrain,
} from '@/lib/infrastructure/log-drain';

const fieldScopeSchema = z.enum(['profile_data', 'metadata']);
const fieldTypeSchema = z.enum([
  'string',
  'markdown',
  'number',
  'boolean',
  'date',
  'datetime',
  'json',
  'string-array',
]);

const updateFieldDefinitionSchema = z.object({
  collection_id: z.string().uuid().nullable().optional(),
  default_value: z.unknown().nullable().optional(),
  description: z.string().max(500).nullable().optional(),
  field_scope: fieldScopeSchema.optional(),
  field_type: fieldTypeSchema.optional(),
  is_enabled: z.boolean().optional(),
  is_required: z.boolean().optional(),
  key: z.string().trim().min(1).max(120).regex(/^\S+$/).optional(),
  label: z.string().max(160).nullable().optional(),
  options: z.array(z.string().max(160)).optional(),
  sort_order: z.number().int().min(0).optional(),
});

interface Params {
  params: Promise<{
    fieldDefinitionId: string;
    wsId: string;
  }>;
}

async function updateFieldDefinition(request: NextRequest, { params }: Params) {
  const { fieldDefinitionId, wsId } = await params;
  const access = await requireWorkspaceExternalProjectAccess({
    mode: 'manage',
    request,
    wsId,
  });
  if (!access.ok) return access.response;

  try {
    const payload = updateFieldDefinitionSchema.parse(await request.json());
    const fieldDefinition = await updateWorkspaceExternalProjectFieldDefinition(
      fieldDefinitionId,
      {
        actorId: access.user.id,
        collection_id: payload.collection_id,
        default_value: payload.default_value as Json | null | undefined,
        description: payload.description,
        field_scope: payload.field_scope,
        field_type: payload.field_type,
        is_enabled: payload.is_enabled,
        is_required: payload.is_required,
        key: payload.key,
        label: payload.label,
        options: payload.options,
        sort_order: payload.sort_order,
        workspaceId: access.normalizedWorkspaceId,
      },
      access.admin
    );

    return NextResponse.json(fieldDefinition);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid payload', details: error.flatten() },
        { status: 400 }
      );
    }

    serverLogger.error('Failed to update external project field definition', {
      error: error instanceof Error ? error.message : String(error),
      fieldDefinitionId,
      wsId: access.normalizedWorkspaceId,
    });
    return NextResponse.json(
      { error: 'Failed to update external project field definition' },
      { status: 500 }
    );
  }
}

async function deleteFieldDefinition(request: NextRequest, { params }: Params) {
  const { fieldDefinitionId, wsId } = await params;
  const access = await requireWorkspaceExternalProjectAccess({
    mode: 'manage',
    request,
    wsId,
  });
  if (!access.ok) return access.response;

  try {
    const result = await deleteWorkspaceExternalProjectFieldDefinition(
      fieldDefinitionId,
      {
        workspaceId: access.normalizedWorkspaceId,
      },
      access.admin
    );

    return NextResponse.json(result);
  } catch (error) {
    serverLogger.error('Failed to delete external project field definition', {
      error: error instanceof Error ? error.message : String(error),
      fieldDefinitionId,
      wsId: access.normalizedWorkspaceId,
    });
    return NextResponse.json(
      { error: 'Failed to delete external project field definition' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, context: Params) {
  return withRequestLogDrain(
    {
      request,
      route:
        '/api/v1/workspaces/[wsId]/external-projects/field-definitions/[fieldDefinitionId]',
    },
    () => updateFieldDefinition(request, context)
  );
}

export async function DELETE(request: NextRequest, context: Params) {
  return withRequestLogDrain(
    {
      request,
      route:
        '/api/v1/workspaces/[wsId]/external-projects/field-definitions/[fieldDefinitionId]',
    },
    () => deleteFieldDefinition(request, context)
  );
}

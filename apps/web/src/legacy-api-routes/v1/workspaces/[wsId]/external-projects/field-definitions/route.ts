import type { Json } from '@tuturuuu/types';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireWorkspaceExternalProjectAccess } from '@/lib/external-projects/access';
import {
  createWorkspaceExternalProjectFieldDefinition,
  listWorkspaceExternalProjectFieldDefinitions,
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

const fieldDefinitionSchema = z.object({
  collection_id: z.string().uuid().nullable().optional(),
  default_value: z.unknown().nullable().optional(),
  description: z.string().max(500).nullable().optional(),
  field_scope: fieldScopeSchema,
  field_type: fieldTypeSchema,
  is_enabled: z.boolean().optional(),
  is_required: z.boolean().optional(),
  key: z.string().trim().min(1).max(120).regex(/^\S+$/),
  label: z.string().max(160).nullable().optional(),
  options: z.array(z.string().max(160)).optional(),
  sort_order: z.number().int().min(0).optional(),
});
const collectionIdQuerySchema = z.union([
  z.literal('global'),
  z.string().uuid(),
]);

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

async function listFieldDefinitions(request: NextRequest, { params }: Params) {
  const { wsId } = await params;
  const access = await requireWorkspaceExternalProjectAccess({
    mode: 'read',
    request,
    wsId,
  });
  if (!access.ok) return access.response;

  try {
    const searchParams = request.nextUrl.searchParams;
    const collectionId = searchParams.get('collectionId');
    const parsedCollectionId = collectionId
      ? collectionIdQuerySchema.safeParse(collectionId)
      : null;
    if (parsedCollectionId && !parsedCollectionId.success) {
      return NextResponse.json(
        { error: 'Invalid collectionId query parameter' },
        { status: 400 }
      );
    }
    const includeDisabled = searchParams.get('includeDisabled') === 'true';
    const fieldDefinitions = await listWorkspaceExternalProjectFieldDefinitions(
      access.normalizedWorkspaceId,
      {
        ...(collectionId
          ? {
              collectionId:
                parsedCollectionId?.data === 'global'
                  ? null
                  : parsedCollectionId?.data,
            }
          : {}),
        includeDisabled,
      },
      access.admin
    );

    return NextResponse.json(fieldDefinitions);
  } catch (error) {
    serverLogger.error('Failed to list external project field definitions', {
      error: error instanceof Error ? error.message : String(error),
      wsId: access.normalizedWorkspaceId,
    });
    return NextResponse.json(
      { error: 'Failed to list external project field definitions' },
      { status: 500 }
    );
  }
}

async function createFieldDefinition(request: NextRequest, { params }: Params) {
  const { wsId } = await params;
  const access = await requireWorkspaceExternalProjectAccess({
    mode: 'manage',
    request,
    wsId,
  });
  if (!access.ok) return access.response;

  try {
    const payload = fieldDefinitionSchema.parse(await request.json());
    const fieldDefinition = await createWorkspaceExternalProjectFieldDefinition(
      {
        actorId: access.user.id,
        collection_id: payload.collection_id ?? null,
        default_value: payload.default_value as Json | null | undefined,
        description: payload.description ?? null,
        field_scope: payload.field_scope,
        field_type: payload.field_type,
        is_enabled: payload.is_enabled,
        is_required: payload.is_required,
        key: payload.key,
        label: payload.label ?? null,
        options: payload.options,
        sort_order: payload.sort_order,
        workspaceId: access.normalizedWorkspaceId,
      },
      access.admin
    );

    return NextResponse.json(fieldDefinition, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid payload', details: error.flatten() },
        { status: 400 }
      );
    }

    serverLogger.error('Failed to create external project field definition', {
      error: error instanceof Error ? error.message : String(error),
      wsId: access.normalizedWorkspaceId,
    });
    return NextResponse.json(
      { error: 'Failed to create external project field definition' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest, context: Params) {
  return withRequestLogDrain(
    {
      request,
      route: '/api/v1/workspaces/[wsId]/external-projects/field-definitions',
    },
    () => listFieldDefinitions(request, context)
  );
}

export async function POST(request: NextRequest, context: Params) {
  return withRequestLogDrain(
    {
      request,
      route: '/api/v1/workspaces/[wsId]/external-projects/field-definitions',
    },
    () => createFieldDefinition(request, context)
  );
}

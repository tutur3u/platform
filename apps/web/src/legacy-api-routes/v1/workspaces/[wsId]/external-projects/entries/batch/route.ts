import type { ExternalProjectEntry, Json } from '@tuturuuu/types';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireWorkspaceExternalProjectAccess } from '@/lib/external-projects/access';
import {
  createWorkspaceExternalProjectEntry,
  deleteWorkspaceExternalProjectEntry,
  updateWorkspaceExternalProjectEntry,
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

const updateEntrySchema = entrySchema.partial();

const operationSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    clientOperationId: z.string().min(1).max(120),
    payload: entrySchema,
  }),
  z.object({
    action: z.literal('update'),
    clientOperationId: z.string().min(1).max(120),
    entryId: z.string().uuid(),
    payload: updateEntrySchema,
  }),
  z.object({
    action: z.literal('delete'),
    clientOperationId: z.string().min(1).max(120),
    entryId: z.string().uuid(),
  }),
]);

const batchEntrySchema = z.object({
  operations: z.array(operationSchema).max(100),
});

type BatchOperation = z.infer<typeof operationSchema>;
type BatchOperationAction = BatchOperation['action'];
type WorkspaceExternalProjectAccess = Extract<
  Awaited<ReturnType<typeof requireWorkspaceExternalProjectAccess>>,
  { ok: true }
>;
type BatchOperationResult =
  | {
      action: 'create' | 'update';
      clientOperationId: string;
      entry: ExternalProjectEntry;
      ok: true;
    }
  | {
      action: 'delete';
      clientOperationId: string;
      entryId: string;
      ok: true;
    }
  | {
      action: BatchOperationAction;
      clientOperationId: string;
      error: string;
      ok: false;
    };

function readErrorMessage(error: unknown) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : 'Operation failed';
}

async function runOperation(
  operation: BatchOperation,
  access: WorkspaceExternalProjectAccess
): Promise<BatchOperationResult> {
  try {
    if (operation.action === 'create') {
      const { payload } = operation;
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

      return {
        action: operation.action,
        clientOperationId: operation.clientOperationId,
        entry,
        ok: true,
      };
    }

    if (operation.action === 'update') {
      const { payload } = operation;
      const entry = await updateWorkspaceExternalProjectEntry(
        operation.entryId,
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
          workspaceId: access.normalizedWorkspaceId,
        },
        access.admin
      );

      return {
        action: operation.action,
        clientOperationId: operation.clientOperationId,
        entry,
        ok: true,
      };
    }

    await deleteWorkspaceExternalProjectEntry(
      operation.entryId,
      {
        workspaceId: access.normalizedWorkspaceId,
      },
      access.admin
    );

    return {
      action: operation.action,
      clientOperationId: operation.clientOperationId,
      entryId: operation.entryId,
      ok: true,
    };
  } catch (error) {
    return {
      action: operation.action,
      clientOperationId: operation.clientOperationId,
      error: readErrorMessage(error),
      ok: false,
    };
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
    const body = await request.json().catch(() => null);
    const payload = batchEntrySchema.parse(body);
    const results: BatchOperationResult[] = [];

    for (const operation of payload.operations) {
      results.push(await runOperation(operation, access));
    }

    return NextResponse.json({ results });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid payload', details: error.flatten() },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to batch update workspace external project entries' },
      { status: 500 }
    );
  }
}

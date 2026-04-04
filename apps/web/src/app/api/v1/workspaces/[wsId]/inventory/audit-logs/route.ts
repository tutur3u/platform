import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { canViewInventoryAuditLogs } from '@/lib/inventory/permissions';

const SearchParamsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
  entityKind: z.string().optional(),
  eventKind: z.string().optional(),
});

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

function normalizeAuditValue(value: unknown) {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

export async function GET(req: Request, { params }: Params) {
  const { wsId: id } = await params;
  const supabase = await createClient(req);
  const sbAdmin = await createAdminClient();
  const wsId = await normalizeWorkspaceId(id, supabase);
  const permissions = await getPermissions({ wsId: id, request: req });

  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!canViewInventoryAuditLogs(permissions)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const parsed = SearchParamsSchema.safeParse(
    Object.fromEntries(new URL(req.url).searchParams.entries())
  );
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid query parameters', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  const { limit, offset, entityKind, eventKind } = parsed.data;
  let query = sbAdmin
    .from('inventory_audit_logs')
    .select('*', { count: 'exact' })
    .eq('ws_id', wsId)
    .order('occurred_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (entityKind) {
    query = query.eq('entity_kind', entityKind);
  }
  if (eventKind) {
    query = query.eq('event_kind', eventKind);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('Error fetching inventory audit logs', error);
    return NextResponse.json(
      { message: 'Failed to fetch inventory audit logs' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data: (data ?? []).map((row) => {
      const before = (row.before ?? {}) as Record<string, unknown>;
      const after = (row.after ?? {}) as Record<string, unknown>;
      const changedFields = (row.changed_fields ?? []) as string[];
      return {
        auditRecordId: row.id,
        eventKind: row.event_kind,
        entityKind: row.entity_kind,
        entityId: row.entity_id,
        summary: row.summary,
        changedFields,
        fieldChanges: changedFields.map((field) => ({
          field,
          label: field.replaceAll('_', ' '),
          before: normalizeAuditValue(before[field]),
          after: normalizeAuditValue(after[field]),
        })),
        before,
        after,
        actor: {
          authUid: row.actor_auth_uid,
          workspaceUserId: row.actor_workspace_user_id,
        },
        occurredAt: row.occurred_at,
        source: row.source,
      };
    }),
    count: count ?? 0,
  });
}

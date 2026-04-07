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
import {
  inventoryNotFoundResponse,
  isInventoryEnabled,
} from '@/lib/inventory/access';
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

function formatAmount(value: unknown) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) {
    return null;
  }

  return new Intl.NumberFormat('en-US').format(amount);
}

function buildSummary(row: {
  summary: string | null;
  event_kind: string;
  entity_kind: string;
  entity_label: string | null;
  after: unknown;
}) {
  const trimmed = row.summary?.trim();
  if (
    trimmed &&
    !(row.entity_kind === 'sale' && row.event_kind === 'sale_created')
  ) {
    return trimmed;
  }

  if (row.entity_kind === 'sale' && row.event_kind === 'sale_created') {
    const after =
      row.after && typeof row.after === 'object'
        ? (row.after as Record<string, unknown>)
        : {};
    const products = Array.isArray(after.products) ? after.products : [];
    const paidAmount = formatAmount(after.paid_amount);
    const segments = ['Created sale'];

    if (products.length > 0) {
      segments.push(
        `${products.length} line${products.length === 1 ? '' : 's'}`
      );
    }

    if (paidAmount != null) {
      segments.push(paidAmount);
    }

    return segments.join(' • ');
  }

  if ((row.entity_label?.trim().length ?? 0) > 0) {
    return `${row.event_kind.replaceAll('_', ' ')} ${row.entity_label!.trim()}`;
  }

  return [
    row.event_kind.replaceAll('_', ' '),
    row.entity_kind.replaceAll('_', ' '),
  ].join(' ');
}

export async function GET(req: Request, { params }: Params) {
  const { wsId: id } = await params;
  const supabase = await createClient(req);
  const sbAdmin = await createAdminClient();
  const wsId = await normalizeWorkspaceId(id, supabase);
  if (!(await isInventoryEnabled(wsId))) {
    return inventoryNotFoundResponse();
  }
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

  const actorIds = [
    ...new Set(
      (data ?? []).map((row) => row.actor_workspace_user_id).filter(Boolean)
    ),
  ] as string[];
  const actorNameById = new Map<string, string>();

  if (actorIds.length > 0) {
    const { data: actorRows, error: actorError } = await sbAdmin
      .from('workspace_users')
      .select('id, full_name, display_name')
      .in('id', actorIds);

    if (actorError) {
      console.error('Error fetching inventory audit actors', actorError);
    } else {
      for (const actor of actorRows ?? []) {
        actorNameById.set(
          actor.id,
          actor.full_name ?? actor.display_name ?? actor.id
        );
      }
    }
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
        entityLabel: row.entity_label,
        summary: buildSummary(row),
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
          displayName: row.actor_workspace_user_id
            ? (actorNameById.get(row.actor_workspace_user_id) ?? null)
            : null,
        },
        occurredAt: row.occurred_at,
        source: row.source,
      };
    }),
    count: count ?? 0,
  });
}

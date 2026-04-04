import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { Json } from '@tuturuuu/types';

export interface InventoryAuditActor {
  authUserId: string | null;
  workspaceUserId: string | null;
}

export interface InventoryAuditLogInput {
  wsId: string;
  eventKind:
    | 'created'
    | 'updated'
    | 'archived'
    | 'reactivated'
    | 'deleted'
    | 'sale_created';
  entityKind:
    | 'owner'
    | 'product'
    | 'stock'
    | 'category'
    | 'unit'
    | 'warehouse'
    | 'sale';
  entityId?: string | null;
  entityLabel?: string | null;
  summary: string;
  changedFields?: string[];
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  actor?: InventoryAuditActor;
  source?: 'live' | 'backfilled';
}

export async function createInventoryAuditLog(
  sbAdmin: TypedSupabaseClient,
  input: InventoryAuditLogInput
) {
  const { error } = await sbAdmin.from('inventory_audit_logs').insert([
    {
      ws_id: input.wsId,
      event_kind: input.eventKind,
      entity_kind: input.entityKind,
      entity_id: input.entityId ?? null,
      entity_label: input.entityLabel ?? null,
      summary: input.summary,
      changed_fields: input.changedFields ?? [],
      before: (input.before ?? null) as Json,
      after: (input.after ?? null) as Json,
      actor_auth_uid: input.actor?.authUserId ?? null,
      actor_workspace_user_id: input.actor?.workspaceUserId ?? null,
      source: input.source ?? 'live',
    },
  ]);

  if (error) {
    console.error('Failed to create inventory audit log', error);
  }
}

export function diffInventoryAuditFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>
) {
  const changedFields = new Set<string>();

  for (const key of [...Object.keys(before), ...Object.keys(after)]) {
    const beforeValue = before[key] ?? null;
    const afterValue = after[key] ?? null;

    if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
      changedFields.add(key);
    }
  }

  return [...changedFields];
}

import 'server-only';

import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  Effect,
  runEffectAsResult,
  TuturuuuEffectError,
} from '@tuturuuu/utils/effect';
import type { PermissionsResult } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeInventoryWorkspace } from './commerce/auth';
import { autoCreateProductListing } from './commerce/auto-listing';
import {
  OfflineCreateEnvelopeSchema,
  type OfflineCreateKind,
  parseOfflineCreatePayload,
} from './offline-create-schema';
import {
  canAdjustInventoryStock,
  canCreateInventorySales,
  canCreateInventorySetup,
  canManageInventoryCatalog,
  canManageInventorySetup,
} from './permissions';

const contract = 'inventory-offline-create-v1';
const resultSchema = z.object({
  contract: z.literal(contract),
  resource: z.string(),
  replayed: z.boolean(),
  data: z.object({ id: z.guid() }).passthrough(),
});
function observed(response: NextResponse) {
  response.headers.set('X-Tuturuuu-Offline-Contract', contract);
  return response;
}
function response(body: unknown, status: number) {
  return observed(NextResponse.json(body, { status }));
}
export function canCreateOfflineResource(
  kind: OfflineCreateKind,
  payload: Record<string, unknown>,
  permissions: Pick<PermissionsResult, 'containsPermission'>
) {
  switch (kind) {
    case 'finance_category':
      return permissions.containsPermission('create_transactions');
    case 'owner':
      return canManageInventorySetup(permissions);
    case 'manufacturer':
      return canCreateInventorySetup(permissions, {
        allowUpdateInventory: true,
      });
    case 'unit':
      return canCreateInventorySetup(permissions);
    case 'category':
    case 'warehouse':
      return permissions.containsPermission('create_inventory');
    case 'period':
      return canCreateInventorySales(permissions);
    case 'product':
      return (
        canManageInventoryCatalog(permissions) &&
        (!Array.isArray(payload.inventory) ||
          payload.inventory.length === 0 ||
          canAdjustInventoryStock(permissions))
      );
  }
}
function rpcFailure(error: unknown) {
  const code =
    typeof error === 'object' && error && 'code' in error
      ? String(error.code)
      : 'UNKNOWN';
  const unavailable = [
    '42883',
    '42P01',
    '42703',
    'PGRST202',
    'PGRST205',
  ].includes(code);
  const status = unavailable
    ? 503
    : code === '42501'
      ? 403
      : ['23505', '23514', '23P01'].includes(code)
        ? 409
        : ['22023', '22P02', '23503'].includes(code)
          ? 400
          : 500;
  return new TuturuuuEffectError({
    code: unavailable
      ? 'OFFLINE_CONTRACT_UNAVAILABLE'
      : 'OFFLINE_CREATE_REJECTED',
    message: unavailable
      ? 'Offline create contract is not available yet'
      : 'Offline create could not be applied',
    status,
  });
}

/** Every retry, including a receipt replay, checks current actor permissions. */
export async function handleOfflineCreate(request: Request, rawWsId: string) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return response(
      { code: 'INVALID_OFFLINE_CREATE', message: 'Invalid JSON' },
      400
    );
  }
  const envelope = OfflineCreateEnvelopeSchema.safeParse(body);
  if (!envelope.success) {
    return response(
      { code: 'INVALID_OFFLINE_CREATE', message: 'Invalid create request' },
      400
    );
  }
  const { kind, operation_id: operationId } = envelope.data;
  const payload = parseOfflineCreatePayload(kind, envelope.data.payload);
  if (!payload.success) {
    return response(
      { code: 'INVALID_OFFLINE_CREATE', message: 'Invalid resource payload' },
      400
    );
  }
  const validatedPayload: Record<string, unknown> = payload.data;
  const authorization = await authorizeInventoryWorkspace(request, rawWsId, {
    appSessionTargets:
      kind === 'finance_category' ? ['inventory', 'finance'] : ['inventory'],
  });
  if (!authorization.ok) return observed(authorization.response);
  const { userId: actorId, wsId, permissions } = authorization.value;
  if (!canCreateOfflineResource(kind, validatedPayload, permissions)) {
    return response(
      { code: 'OFFLINE_CREATE_FORBIDDEN', message: 'Forbidden' },
      403
    );
  }
  const sbAdmin = await createAdminClient();
  const result = await runEffectAsResult(
    Effect.tryPromise({
      try: async () => {
        const { data, error } = await sbAdmin.schema('private').rpc(
          'apply_inventory_offline_create' as never,
          {
            p_actor_id: actorId,
            p_ws_id: wsId,
            p_operation_id: operationId,
            p_resource: kind,
            p_payload: validatedPayload,
          } as never
        );
        if (error) throw error;
        const parsed = resultSchema.safeParse(data);
        if (!parsed.success || parsed.data.resource !== kind) {
          throw Object.assign(new Error('Invalid offline contract response'), {
            code: 'PGRST202',
          });
        }
        return parsed.data;
      },
      catch: rpcFailure,
    })
  );
  if (!result.ok) {
    // Payloads and RPC error details may include customer data; log only the code.
    console.warn('Offline create rejected', { code: result.error.code });
    return response(
      { code: result.error.code, message: result.error.message },
      result.error.status ?? 500
    );
  }
  if (kind === 'product' && !result.data.replayed) {
    const items = validatedPayload.inventory;
    const first = Array.isArray(items)
      ? (items[0] as Record<string, unknown> | undefined)
      : undefined;
    if (first) {
      try {
        await autoCreateProductListing(wsId, {
          priceMajor: Number(first.price),
          productId: result.data.data.id,
          title: String(validatedPayload.name),
          unitId: String(first.unit_id),
          warehouseId: String(first.warehouse_id),
        });
      } catch {
        // Listing is existing best-effort behavior; never hide a committed receipt.
        console.warn('Offline product listing deferred');
      }
    }
  }
  return response(result.data, result.data.replayed ? 200 : 201);
}

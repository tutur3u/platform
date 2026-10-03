import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import { canAdjustInventoryStock } from '@tuturuuu/inventory-core/permissions';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { Effect } from '@tuturuuu/utils/effect';
import { connection, NextResponse } from 'next/server';
import { z } from 'zod';

const selectionSchema = z.object({
  kind: z.enum(['product', 'warehouse']),
  sourceId: z.guid(),
  targetId: z.guid(),
});
const mergeSchema = selectionSchema.extend({
  version: z.string().min(1).max(256),
  metadata: z.enum(['source', 'target']),
  stockPolicy: z.enum(['source', 'target']),
});
type Context = { params: Promise<{ wsId: string }> };

function response(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}
function rpcFailure(code?: string) {
  if (['23P01', '55P03', '40P01', '40001', '23505'].includes(code ?? ''))
    return response(
      { message: 'Inventory changed. Refresh the merge preview.' },
      409
    );
  if (code === '23514')
    return response(
      {
        message:
          'These records cannot be merged. Refresh the preview for details.',
      },
      409
    );
  if (code === '23503')
    return response(
      { message: 'One of the selected inventory records no longer exists.' },
      404
    );
  if (['PGRST202', 'PGRST106', '42883', '3F000', '55000'].includes(code ?? ''))
    return response(
      {
        message:
          'Inventory merging is not ready yet. Refresh and retry after the workspace update completes.',
      },
      503
    );
  return response({ message: 'Unable to merge inventory records.' }, 500);
}

async function handle(request: Request, context: Context, execute: boolean) {
  const auth = await authorizeInventoryWorkspace(
    request,
    (await context.params).wsId
  );
  if (!auth.ok) return auth.response;
  const input = execute
    ? await request.json().catch(() => null)
    : Object.fromEntries(new URL(request.url).searchParams);
  const parsed = (execute ? mergeSchema : selectionSchema).safeParse(input);
  if (!parsed.success || parsed.data.sourceId === parsed.data.targetId)
    return response(
      {
        message:
          'Select two different inventory records and valid merge options.',
      },
      400
    );

  const { permissions, wsId, userId } = auth.value;
  const update =
    permissions.containsPermission('update_inventory') ||
    permissions.containsPermission(
      parsed.data.kind === 'product'
        ? 'manage_inventory_catalog'
        : 'manage_inventory_setup'
    );
  if (
    !update ||
    !permissions.containsPermission('delete_inventory') ||
    !canAdjustInventoryStock(permissions)
  )
    return response(
      { message: 'Insufficient permissions to merge inventory records.' },
      403
    );

  const operation = Effect.tryPromise(async () => {
    const admin = await createAdminClient({ noCookie: true });
    const readiness = await admin
      .schema('private')
      .rpc('inventory_merge_schema_ready' as never);
    if (readiness.error || readiness.data !== true) return rpcFailure('55000');
    const args = {
      p_ws_id: wsId,
      p_kind: parsed.data.kind,
      p_source_id: parsed.data.sourceId,
      p_target_id: parsed.data.targetId,
    };
    const { data, error } = execute
      ? await admin.schema('private').rpc(
          'apply_inventory_merge' as never,
          {
            ...args,
            p_version: (parsed.data as z.infer<typeof mergeSchema>).version,
            p_metadata_policy: (parsed.data as z.infer<typeof mergeSchema>)
              .metadata,
            p_stock_policy: (parsed.data as z.infer<typeof mergeSchema>)
              .stockPolicy,
            p_actor_id: userId,
          } as never
        )
      : await admin
          .schema('private')
          .rpc('preview_inventory_merge' as never, args as never);
    return error ? rpcFailure(error.code) : response(data);
  }).pipe(Effect.catchAll(() => Effect.succeed(rpcFailure())));
  return Effect.runPromise(operation);
}

export async function GET(request: Request, context: Context) {
  await connection();
  return handle(request, context, false);
}
export async function POST(request: Request, context: Context) {
  return handle(request, context, true);
}

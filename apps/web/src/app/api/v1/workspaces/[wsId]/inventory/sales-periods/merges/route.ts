import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { Effect } from '@tuturuuu/utils/effect';
import { connection, NextResponse } from 'next/server';
import { z } from 'zod';
import { seasonApplyResponse, seasonPreviewResponse } from './response-schema';

const pair = z.object({ sourceId: z.guid(), targetId: z.guid() });
const previewSchema = pair.extend({
  version: z.guid().optional(),
  page: z
    .string()
    .regex(/^\d+$/)
    .default('1')
    .transform(Number)
    .pipe(z.number().int().min(1).max(100000)),
});
const applySchema = pair.extend({
  version: z.guid(),
  descriptionPolicy: z.enum(['source', 'target']),
  rulePolicy: z.enum(['source', 'target']),
  pricePolicy: z.enum(['block', 'target']),
});
type Context = { params: Promise<{ wsId: string }> };
const response = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
function failure(code?: string) {
  if (
    ['40001', '40P01', '55P03', '23514', '23505', '23P01'].includes(code ?? '')
  )
    return response(
      {
        message:
          'Season changed or conflicts remain. Refresh the merge preview.',
      },
      409
    );
  if (code === '23503')
    return response({ message: 'Selected season not found.' }, 404);
  if (code === '42501') return response({ message: 'Forbidden' }, 403);
  if (
    ['PGRST202', 'PGRST106', '42883', '42P01', '42703', '55000'].includes(
      code ?? ''
    )
  )
    return response({ message: 'Season merging is not ready yet.' }, 503);
  return response({ message: 'Unable to merge seasons.' }, 500);
}
async function handle(request: Request, context: Context, execute: boolean) {
  const auth = await authorizeInventoryWorkspace(
    request,
    (await context.params).wsId
  );
  if (!auth.ok) return auth.response;
  const parsed = execute
    ? applySchema.safeParse(await request.json().catch(() => null))
    : previewSchema.safeParse(
        Object.fromEntries(new URL(request.url).searchParams)
      );
  if (
    !parsed.success ||
    parsed.data.sourceId.toLowerCase() === parsed.data.targetId.toLowerCase()
  )
    return response(
      {
        message: 'Choose different seasons and explicit valid merge policies.',
      },
      400
    );
  const { wsId, userId, permissions } = auth.value;
  if (
    !permissions.containsPermission('update_invoices') ||
    !permissions.containsPermission('delete_invoices') ||
    !(
      permissions.containsPermission('manage_inventory_catalog') ||
      permissions.containsPermission('update_inventory')
    )
  )
    return response({ message: 'Forbidden' }, 403);
  return Effect.runPromise(
    Effect.tryPromise(async () => {
      const inventory = (await createAdminClient({ noCookie: true })).schema(
        'private'
      );
      const readiness = await inventory.rpc(
        'inventory_season_merge_schema_ready'
      );
      if (readiness.error || readiness.data !== true) return failure('55000');
      const args = {
        p_ws_id: wsId,
        p_actor_id: userId,
        p_source_id: parsed.data.sourceId,
        p_target_id: parsed.data.targetId,
      };
      const result = execute
        ? await inventory.rpc('apply_inventory_season_merge', {
            ...args,
            p_version: (parsed.data as z.infer<typeof applySchema>).version,
            p_description_policy: (parsed.data as z.infer<typeof applySchema>)
              .descriptionPolicy,
            p_rule_policy: (parsed.data as z.infer<typeof applySchema>)
              .rulePolicy,
            p_price_policy: (parsed.data as z.infer<typeof applySchema>)
              .pricePolicy,
          })
        : await inventory.rpc('preview_inventory_season_merge', {
            ...args,
            ...(parsed.data.version
              ? { p_preview_id: parsed.data.version }
              : {}),
            p_page: (parsed.data as z.infer<typeof previewSchema>).page,
          });
      if (result.error) return failure(result.error.code);
      const checked = (
        execute ? seasonApplyResponse : seasonPreviewResponse
      ).safeParse(result.data);
      return checked.success ? response(checked.data) : failure();
    }).pipe(Effect.catchAll(() => Effect.succeed(failure())))
  );
}
export async function GET(request: Request, context: Context) {
  await connection();
  return handle(request, context, false);
}
export async function POST(request: Request, context: Context) {
  return handle(request, context, true);
}

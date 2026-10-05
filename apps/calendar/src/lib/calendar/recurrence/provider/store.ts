import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { Json } from '@tuturuuu/types/supabase';
import { z } from 'zod';
import { CalendarSeriesError } from '../service';
import type { ProviderSeriesOperationStore } from './executor';
import type { ProviderSeriesPlan } from './plan';

export const ProviderOperationSchema = z.object({
  id: z.uuid(),
  ws_id: z.uuid(),
  actor_id: z.uuid(),
  connection_id: z.uuid(),
  series_id: z.uuid().nullable(),
  native_action: z.enum(['create', 'update', 'delete']),
  native_input: z.record(z.string(), z.unknown()),
  intent_hash: z.string(),
  journal: z.object({ version: z.literal(1), ciphertext: z.string().min(1) }),
  step_count: z.number().int().min(1).max(2),
  checkpoints: z.array(
    z.object({
      step: z.number().int().nonnegative(),
      kind: z.enum(['create', 'trim']).optional(),
      result: z.object({
        eventId: z.string().min(1),
        etag: z.string().nullable(),
        deleted: z.boolean().optional(),
      }),
    })
  ),
  phase: z.enum(['prepared', 'running', 'applied']),
  lease: z.uuid().nullable(),
  result: z.unknown().nullable(),
});
export type ProviderOperation = z.infer<typeof ProviderOperationSchema>;
export async function providerSeriesRpc(
  args: {
    supabase: TypedSupabaseClient;
    wsId: string;
    actorId: string;
  },
  action: string,
  input: Record<string, unknown>
) {
  const { data, error } = await args.supabase.rpc(
    'calendar_provider_series_operation',
    {
      p_ws_id: args.wsId,
      p_actor_id: args.actorId,
      p_action: action,
      p_input: input as Json,
    }
  );
  if (error)
    throw new CalendarSeriesError(
      error.message,
      error.code === '42501'
        ? 403
        : error.code === 'P0002'
          ? 404
          : error.code === '40001' || error.code === '23505'
            ? 409
            : error.code === '22023'
              ? 400
              : ['42883', 'PGRST202'].includes(error.code)
                ? 503
                : 500,
      error.code
    );
  return data;
}
export function createProviderSeriesStore(args: {
  supabase: TypedSupabaseClient;
  wsId: string;
  actorId: string;
  operationId: string;
  open: (operation: ProviderOperation) => Promise<ProviderSeriesPlan>;
}): ProviderSeriesOperationStore {
  return {
    async claim() {
      const operation = ProviderOperationSchema.parse(
        await providerSeriesRpc(args, 'claim', { id: args.operationId })
      );
      if (operation.phase === 'applied')
        throw new CalendarSeriesError(
          'Provider operation already applied',
          409,
          'ALREADY_APPLIED'
        );
      if (!operation.lease) throw new Error('Provider operation lease missing');
      const plan = await args.open(operation);
      if (
        plan.operationId !== operation.id ||
        plan.steps.length !== operation.step_count ||
        Boolean(plan.createBeforeTrim) !==
          (operation.native_input.providerCreateFirst === true)
      )
        throw new Error('Provider journal identity changed');
      return {
        plan,
        checkpoints: operation.checkpoints,
        lease: operation.lease,
      };
    },
    async checkpoint(lease, checkpoint) {
      await providerSeriesRpc(args, 'checkpoint', {
        id: args.operationId,
        lease,
        checkpoint,
      });
    },
    async finalize(lease) {
      return ProviderOperationSchema.parse(
        await providerSeriesRpc(args, 'finalize', {
          id: args.operationId,
          lease,
        })
      ).result;
    },
  };
}

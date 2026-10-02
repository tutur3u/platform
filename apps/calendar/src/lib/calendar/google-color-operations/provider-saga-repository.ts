import { createHash } from 'node:crypto';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { Json } from '@tuturuuu/types/db';
import { z } from 'zod';
import { ColorOperationError } from './protocol';
import type {
  ProviderSagaCompletion,
  ProviderSagaOperation,
  ProviderSagaRepository,
} from './provider-saga-executor';
import {
  SagaBindingSchema,
  SagaCheckpointSchema,
} from './provider-saga-protocol';
import { SealedJournalSchema } from './sealed-journal';

export const ProviderSagaOperationSchema = z
  .object({
    id: z.guid(),
    generation: z.string().regex(/^[1-9][0-9]*$/),
    phase: z.enum([
      'prepared',
      'dispatched',
      'applied',
      'superseded',
      'canceled',
    ]),
    prepared: z
      .object({ binding: SagaBindingSchema, journal: SealedJournalSchema })
      .strict(),
    checkpoint: SagaCheckpointSchema.nullable(),
  })
  .strict();

export function createProviderSagaRepository(args: {
  sbAdmin: TypedSupabaseClient;
  actorId: string;
  wsId: string;
  eventId: string;
  project: (
    completion: ProviderSagaCompletion
  ) => Promise<Record<string, unknown>>;
}) {
  async function rpc(action: string, input: Record<string, unknown>) {
    const { data, error } = await args.sbAdmin.rpc(
      'calendar_provider_saga_operation',
      {
        p_action: action,
        p_ws_id: args.wsId,
        p_event_id: args.eventId,
        p_actor_id: args.actorId,
        p_input: input as Json,
      }
    );
    if (error)
      throw new ColorOperationError(
        error.code === '40001'
          ? 'conflict'
          : error.code === '42501'
            ? 'unauthorized'
            : 'storage',
        'Provider saga storage unavailable'
      );
    return data;
  }
  async function call(action: string, input: Record<string, unknown>) {
    const operation = ProviderSagaOperationSchema.safeParse(
      await rpc(action, input)
    );
    if (
      !operation.success ||
      operation.data.id !== input.id ||
      operation.data.prepared.binding.operationId !== operation.data.id ||
      operation.data.prepared.binding.generation !== operation.data.generation
    )
      throw new ColorOperationError(
        'storage',
        'Provider saga state unavailable'
      );
    return operation.data;
  }
  const token = (operation: ProviderSagaOperation) => ({
    id: operation.id,
    generation: operation.generation,
  });
  const repository: ProviderSagaRepository = {
    read: (id) => call('read', { id }),
    dispatch: (operation) => call('dispatch', token(operation)),
    checkpoint: (operation, checkpoint) =>
      call('checkpoint', { ...token(operation), checkpoint }),
    cancel: (operation) => call('cancel', token(operation)),
    async finalize(operation, completion) {
      return call('finalize', {
        ...token(operation),
        snapshot: await args.project(completion),
      });
    },
  };
  return {
    ...repository,
    async find(id: string) {
      const data = await rpc('lookup', { id });
      if (data === null) return null;
      const operation = ProviderSagaOperationSchema.parse(data);
      if (operation.id !== id)
        throw new ColorOperationError('identity', 'Provider saga changed');
      return operation;
    },
    async inspect(prepared: ProviderSagaOperation['prepared']) {
      const result = z
        .object({
          generation: z.string().regex(/^(0|[1-9][0-9]*)$/),
          operation: z
            .object({
              id: z.guid(),
              phase: z.enum([
                'reserved',
                'prepared',
                'dispatched',
                'applied',
                'superseded',
                'canceled',
              ]),
            })
            .nullable(),
        })
        .safeParse(
          await rpc('inspect', { id: prepared.binding.operationId, prepared })
        );
      if (!result.success)
        throw new ColorOperationError(
          'storage',
          'Provider saga generation unavailable'
        );
      return result.data;
    },
    admit(
      operation: ProviderSagaOperation,
      expectedGeneration: string,
      placeholder?: Record<string, unknown>
    ) {
      return call('admit', {
        id: operation.id,
        expectedGeneration,
        prepared: operation.prepared,
        requestHash: createHash('sha256')
          .update(JSON.stringify(operation.prepared))
          .digest('hex'),
        ...(placeholder ? { placeholder } : {}),
      });
    },
  };
}

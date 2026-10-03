import { createHash } from 'node:crypto';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { Json } from '@tuturuuu/types/db';
import { z } from 'zod';
import type {
  GoogleMutationCompletion,
  GoogleMutationOperation,
  GoogleMutationRepository,
} from './mutation-executor';
import {
  ColorOperationError,
  type ColorOperationIdentity,
  sameColorOperationIdentity,
} from './protocol';
import { MutationBindingSchema, SealedMutationSchema } from './sealed-mutation';

const Preparation = z
  .object({
    binding: MutationBindingSchema,
    journal: SealedMutationSchema,
  })
  .strict();
export const GoogleMutationOperationSchema = z
  .object({
    id: z.guid(),
    generation: z.string().regex(/^[1-9][0-9]*$/),
    identity: MutationBindingSchema.shape.identity,
    phase: z.enum([
      'prepared',
      'dispatched',
      'applied',
      'superseded',
      'canceled',
    ]),
    prepared: Preparation,
    intent: z
      .object({ kind: z.literal('mutation'), connectionId: z.guid() })
      .strict(),
    requestHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

/** Projection receives authoritative provider data and returns encrypted local
 * fields plus owned Google metadata, never a replay of the original plaintext.
 * SQL owns the merge/deletion/linkage transaction and validates the generation. */
export function createGoogleMutationRepository(args: {
  sbAdmin: TypedSupabaseClient;
  actorId: string;
  project: (
    completion: GoogleMutationCompletion,
    identity: ColorOperationIdentity
  ) => Promise<Record<string, unknown>>;
}): GoogleMutationRepository {
  async function call(
    action: string,
    identity: ColorOperationIdentity,
    input: Record<string, unknown>
  ) {
    const { data, error } = await args.sbAdmin.rpc(
      'calendar_google_mutation_operation',
      {
        p_action: action,
        p_ws_id: identity.wsId,
        p_event_id: identity.eventId,
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
        'Google mutation storage unavailable or changed'
      );
    const parsed = GoogleMutationOperationSchema.safeParse(data);
    if (
      !parsed.success ||
      parsed.data.id !== input.id ||
      !sameColorOperationIdentity(parsed.data.identity, identity) ||
      parsed.data.intent.connectionId !== identity.connectionId ||
      parsed.data.prepared.binding.operationId !== parsed.data.id ||
      parsed.data.prepared.binding.generation !== parsed.data.generation ||
      !sameColorOperationIdentity(
        parsed.data.prepared.binding.identity,
        identity
      )
    )
      throw new ColorOperationError(
        'storage',
        'Google mutation state unavailable'
      );
    const {
      intent: _intent,
      requestHash: _requestHash,
      ...operation
    } = parsed.data;
    return operation;
  }
  const token = (operation: GoogleMutationOperation) => ({
    id: operation.id,
    generation: operation.generation,
  });
  return {
    admit(operation, expectedGeneration) {
      return call('admit', operation.identity, {
        id: operation.id,
        expectedGeneration,
        prepared: operation.prepared,
        requestHash: createHash('sha256')
          .update(JSON.stringify(operation.prepared))
          .digest('hex'),
      });
    },
    read(identity, id) {
      return call('read', identity, { id });
    },
    markDispatched(operation) {
      return call('dispatch', operation.identity, token(operation));
    },
    cancelUnsent(operation) {
      return call('cancel', operation.identity, token(operation));
    },
    async finalize(operation, completion) {
      const snapshot = completion.deleted
        ? completion
        : await args.project(completion, operation.identity);
      return call('finalize', operation.identity, {
        ...token(operation),
        snapshot,
      });
    },
  };
}

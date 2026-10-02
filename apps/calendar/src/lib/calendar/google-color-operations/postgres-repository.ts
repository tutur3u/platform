import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { Json } from '@tuturuuu/types/db';
import { z } from 'zod';
import { GoogleProviderColorChoiceSchema } from '../google-color-choices';
import { GoogleMutationOperationSchema } from './mutation-repository';
import {
  type ColorOperation,
  ColorOperationError,
  type ColorOperationIdentity,
  type ColorOperationRepository,
  sameColorOperationIdentity,
} from './protocol';
import { SagaBindingSchema } from './provider-saga-protocol';
import { SealedJournalSchema } from './sealed-journal';

const IdentitySchema = z
  .object({
    wsId: z.guid(),
    eventId: z.guid(),
    connectionId: z.guid(),
    authTokenId: z.guid(),
    calendarId: z.string().min(1),
    providerEventId: z.string().min(1),
  })
  .strict();
const OperationSchema = z
  .object({
    id: z.guid(),
    generation: z.string().regex(/^[1-9][0-9]*$/),
    requestHash: z.string().regex(/^[a-f0-9]{64}$/),
    identity: IdentitySchema,
    intent: GoogleProviderColorChoiceSchema,
    phase: z.enum([
      'reserved',
      'prepared',
      'dispatched',
      'applied',
      'superseded',
      'canceled',
    ]),
    prepared: z
      .object({
        baseETag: z.string().min(1),
        eventLabelVersion: z.union([z.literal(0), z.literal(1)]),
        patch: z.record(z.string(), z.unknown()),
      })
      .strict()
      .nullable(),
  })
  .strict();

const SagaLedgerSchema = z
  .object({
    id: z.guid(),
    generation: z.string().regex(/^[1-9][0-9]*$/),
    requestHash: z.string().regex(/^[a-f0-9]{64}$/),
    identity: IdentitySchema,
    intent: z
      .object({ kind: z.literal('saga'), connectionId: z.guid() })
      .strict(),
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
  })
  .strict();

/** Actor comes from the server authorizer, never a reconcile body or metadata. */
export function createPostgresColorOperationRepository(
  sbAdmin: TypedSupabaseClient,
  actorId: string
): ColorOperationRepository {
  async function call(
    action: string,
    identity: ColorOperationIdentity,
    input: Record<string, unknown>
  ): Promise<ColorOperation> {
    const { data, error } = await sbAdmin.rpc(
      'calendar_google_color_operation',
      {
        p_action: action,
        p_ws_id: identity.wsId,
        p_event_id: identity.eventId,
        p_actor_id: actorId,
        p_input: input as Json,
      }
    );
    if (error) {
      // Never expose provider tokens, raw query messages or SQL details.
      throw new ColorOperationError(
        error.code === '40001'
          ? 'conflict'
          : error.code === '42501'
            ? 'unauthorized'
            : 'storage',
        'Google operation storage is unavailable or changed'
      );
    }
    const parsed = OperationSchema.safeParse(data);
    if (!parsed.success)
      throw new ColorOperationError(
        'storage',
        'Google operation state is unavailable'
      );
    if (
      !sameColorOperationIdentity(parsed.data.identity, identity) ||
      parsed.data.id !== input.id
    )
      throw new ColorOperationError(
        'identity',
        'Google operation identity changed'
      );
    return parsed.data;
  }
  const token = (operation: ColorOperation) => ({
    id: operation.id,
    generation: operation.generation,
  });
  return {
    reserve(input) {
      return call('reserve', input.identity, {
        id: input.id,
        generation: input.expectedGeneration,
        identity: input.identity,
        requestHash: input.requestHash,
        intent: input.intent,
      });
    },
    read(identity, operationId) {
      return call('read', identity, { id: operationId });
    },
    prepare(operation, prepared) {
      return call('prepare', operation.identity, {
        ...token(operation),
        prepared,
      });
    },
    markDispatched(operation) {
      return call('dispatch', operation.identity, token(operation));
    },
    finalize(operation, snapshot, outcome) {
      return call('finalize', operation.identity, {
        ...token(operation),
        snapshot,
        outcome,
      });
    },
    cancelUnsent(operation) {
      return call('cancel', operation.identity, token(operation));
    },
  };
}

/** Generation inspection is server-scoped. Reserve still compares atomically,
 * so this read cannot authorize a stale successor or replace pending intent. */
export async function inspectPostgresColorOperation(
  sbAdmin: TypedSupabaseClient,
  actorId: string,
  identity: ColorOperationIdentity
) {
  const { data, error } = await sbAdmin.rpc('calendar_google_color_operation', {
    p_action: 'inspect',
    p_ws_id: identity.wsId,
    p_event_id: identity.eventId,
    p_actor_id: actorId,
    p_input: { identity } as unknown as Json,
  });
  const parsed = z
    .object({
      generation: z.string().regex(/^(0|[1-9][0-9]*)$/),
      operation: z
        .union([
          OperationSchema,
          GoogleMutationOperationSchema,
          SagaLedgerSchema,
        ])
        .nullable(),
    })
    .strict()
    .safeParse(data);
  if (error || !parsed.success)
    throw new ColorOperationError(
      error?.code === '42501'
        ? 'unauthorized'
        : error?.code === '40001'
          ? 'conflict'
          : 'storage',
      'Google operation state is unavailable or changed'
    );
  if (
    parsed.data.operation &&
    !sameColorOperationIdentity(parsed.data.operation.identity, identity)
  )
    throw new ColorOperationError(
      'identity',
      'Google operation identity changed'
    );
  // A generic terminal operation still owns the current generation. It is not
  // executable by the color service, but must not prevent a successor reservation.
  // SQL rejects every pending generic operation before admitting that successor.
  const color = OperationSchema.safeParse(parsed.data.operation);
  return {
    generation: parsed.data.generation,
    operation: color.success ? color.data : null,
  };
}

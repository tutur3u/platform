import { randomUUID } from 'node:crypto';
import type { Json } from '@tuturuuu/types/db';
import type { GoogleProviderColorChoice } from '@tuturuuu/types/primitives/google-calendar-color';
import { z } from 'zod';
import { decryptEventFromStorage } from '../../workspace-encryption';
import {
  loadGoogleColorOptions,
  resolveGoogleColorChoice,
} from '../google-color-choices';
import { createGoogleMutationExecutor } from './mutation-executor';
import { createGoogleMutationProjection } from './mutation-projection';
import { createGoogleMutationProvider } from './mutation-provider';
import { createGoogleMutationRepository } from './mutation-repository';
import { ColorOperationError, sameColorOperationIdentity } from './protocol';
import { createRequestColorOperationAccess } from './request-access';
import { MutationIdentitySchema } from './sealed-mutation';

const Inspection = z.object({
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
      identity: MutationIdentitySchema,
      intent: z.object({
        kind: z.enum(['event', 'label', 'inherit', 'mutation']),
        connectionId: z.guid(),
      }),
    })
    .nullable(),
});

/** Internal request adapter for the disabled all-writer migration. Callers must
 * return the finalized event instead of issuing a second unguarded local write.
 * This does not enable the feature or replace the public recovery route. */
export async function createRequestGoogleMutationService(
  request: Request,
  rawWsId: string,
  eventId: string,
  options: { recoveryOperationId?: string } = {}
) {
  let operationId: string | undefined = options.recoveryOperationId
    ? z.guid().parse(options.recoveryOperationId)
    : undefined;
  const access = createRequestColorOperationAccess(
    request,
    rawWsId,
    eventId,
    undefined,
    { operationId: () => operationId }
  );
  const resolved = await access.discover();
  const { identity, sbAdmin, userId } = resolved;
  const provider = createGoogleMutationProvider({
    access,
    resolve: async (expected) => (await access.provider(expected)).calendar,
  });
  const repository = createGoogleMutationRepository({
    sbAdmin,
    actorId: userId,
    project: async (completion, expected) => {
      const current = await access.provider(expected);
      const { context } = await loadGoogleColorOptions(
        current.calendar,
        current.source
      );
      return createGoogleMutationProjection({ access, colorContext: context })(
        completion,
        expected
      );
    },
  });
  const executor = createGoogleMutationExecutor({
    access,
    repository,
    provider,
  });
  async function inspect() {
    await access.assertAllowed(identity);
    const { data, error } = await sbAdmin.rpc(
      'calendar_google_mutation_operation',
      {
        p_action: 'inspect',
        p_ws_id: identity.wsId,
        p_event_id: identity.eventId,
        p_actor_id: userId,
        p_input: { identity } as Json,
      }
    );
    const parsed = Inspection.safeParse(data);
    if (error || !parsed.success)
      throw new ColorOperationError(
        error?.code === '42501'
          ? 'unauthorized'
          : error?.code === '40001'
            ? 'conflict'
            : 'storage',
        'Google mutation unavailable'
      );
    if (
      parsed.data.operation &&
      !sameColorOperationIdentity(parsed.data.operation.identity, identity)
    )
      throw new ColorOperationError(
        'identity',
        'Google operation identity changed'
      );
    return parsed.data;
  }
  async function available() {
    const current = await inspect();
    if (
      current.operation &&
      ['reserved', 'prepared', 'dispatched'].includes(current.operation.phase)
    )
      throw new ColorOperationError('conflict', 'Google mutation in progress');
    return current;
  }
  return {
    identity,
    inspect,
    async resolveColorChoice(choice: GoogleProviderColorChoice) {
      await available();
      const current = await access.provider(identity);
      const selected = await resolveGoogleColorChoice(
        current.calendar,
        current.source,
        choice
      );
      return {
        fields: {
          colorId: selected.fields.colorId ?? '',
          eventLabelId: selected.fields.eventLabelId ?? '',
        },
        eventLabelVersion:
          choice.kind === 'event' ? (0 as const) : (1 as const),
      };
    },
    async reserve(input: {
      action: 'patch' | 'delete';
      providerPatch: Record<string, unknown>;
      localPatch?: { locked?: boolean };
      sendUpdates: 'all' | 'externalOnly' | 'none';
      eventLabelVersion?: 0 | 1;
    }) {
      const current = await available();
      const id = randomUUID();
      const generation = (BigInt(current.generation) + 1n).toString();
      const prepared = await provider.prepare({
        ...input,
        identity,
        operationId: id,
        generation,
      });
      // Only the generation checked by SQL can admit this exact sealed intent;
      // a race after the provider read never adopts another generation or ETag.
      const operation = await repository.admit(
        { id, generation, identity, phase: 'prepared', prepared },
        current.generation
      );
      operationId = operation.id;
      return operation;
    },
    execute: (id: string) => {
      operationId = id;
      return executor.execute(identity, id);
    },
    cancel: (id: string) => {
      operationId = id;
      return executor.cancel(identity, id);
    },
    async deletionResult(id: string) {
      operationId = id;
      await access.assertAllowed(identity);
      const { data, error } = await sbAdmin.rpc(
        'calendar_google_mutation_operation',
        {
          p_action: 'result',
          p_ws_id: identity.wsId,
          p_event_id: identity.eventId,
          p_actor_id: userId,
          p_input: { id },
        }
      );
      const parsed = z
        .object({
          operationId: z.guid(),
          deleted: z.literal(true),
          linkedTaskId: z.guid().nullable(),
          skippedHabitId: z.guid().nullable(),
          skippedHabitDate: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .nullable(),
        })
        .strict()
        .safeParse(data);
      if (error || !parsed.success || parsed.data.operationId !== id)
        throw new ColorOperationError(
          error?.code === '42501' ? 'unauthorized' : 'storage',
          'Google deletion result unavailable'
        );
      return parsed.data;
    },
    async readEvent() {
      await access.assertAllowed(identity);
      const { data, error } = await sbAdmin
        .from('workspace_calendar_events')
        .select('*')
        .eq('ws_id', identity.wsId)
        .eq('id', identity.eventId)
        .maybeSingle();
      if (error)
        throw new ColorOperationError('storage', 'Google event unavailable');
      return data ? decryptEventFromStorage(data, identity.wsId) : null;
    },
  };
}

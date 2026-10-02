import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { calendar_v3 } from '@tuturuuu/google';
import { formatEventForDb } from '@tuturuuu/trigger/google-calendar-sync';
import { z } from 'zod';
import { ColorOperationError } from './protocol';
import { createProviderSagaCodec } from './provider-saga-codec';
import {
  createProviderSagaExecutor,
  type ProviderSagaCompletion,
} from './provider-saga-executor';
import {
  type ProviderSagaAdapter,
  type SagaBinding,
  SagaBindingSchema,
  type SagaPayload,
  SagaPayloadSchema,
} from './provider-saga-protocol';
import { createProviderSagaRepository } from './provider-saga-repository';
import { createRequestProviderSagaAccess } from './provider-saga-request-access';

/** Internal assembly: provider and encrypted authoritative projection adapters
 * are required explicitly, so no unsupported endpoint is silently activated. */
export async function createRequestProviderSagaService(
  request: Request,
  rawWsId: string,
  eventId: string,
  options: {
    provider: (
      access: ReturnType<typeof createRequestProviderSagaAccess>
    ) => ProviderSagaAdapter;
    project: (
      completion: ProviderSagaCompletion,
      access: ReturnType<typeof createRequestProviderSagaAccess>
    ) => Promise<Record<string, unknown>>;
    recoveryOperationId?: string;
  }
) {
  z.guid().parse(eventId);
  if (options.recoveryOperationId) z.guid().parse(options.recoveryOperationId);
  const access = createRequestProviderSagaAccess(request, rawWsId, eventId);
  const authorized = await access.authorization();
  const provider = options.provider(access);
  const codec = createProviderSagaCodec({ access });
  const repository = createProviderSagaRepository({
    sbAdmin: authorized.sbAdmin,
    actorId: authorized.userId,
    wsId: authorized.wsId,
    eventId,
    project: (completion) => options.project(completion, access),
  });
  const executor = createProviderSagaExecutor({
    access,
    repository,
    provider,
    codec,
  });
  return {
    access,
    find: (id: string) => repository.find(z.guid().parse(id)),
    read: (id: string) => repository.read(z.guid().parse(id)),
    execute: (id: string) => executor.execute(z.guid().parse(id)),
    cancel: (id: string) => executor.cancel(z.guid().parse(id)),
    async reserve(input: {
      operationId?: string;
      binding: Omit<SagaBinding, 'operationId' | 'generation' | 'baseETag'>;
      payload: SagaPayload;
      placeholder?: Record<string, unknown>;
    }) {
      if ('sourceICalUID' in input.payload || 'sourceSnapshot' in input.payload)
        throw new ColorOperationError(
          'identity',
          'Provider source snapshot is server-owned'
        );
      const id = input.operationId
        ? z.guid().parse(input.operationId)
        : randomUUID();
      const destination = input.binding.destination;
      const provisional = SagaBindingSchema.parse({
        ...input.binding,
        operationId: id,
        generation: '1',
        baseETag:
          input.binding.source && input.binding.source.provider !== 'tuturuuu'
            ? 'inspection-only'
            : null,
        destination:
          destination.provider === 'google' &&
          input.binding.mode !== 'google-move'
            ? {
                ...destination,
                identity: {
                  ...destination.identity,
                  providerEventId: `tt${id.replaceAll('-', '')}`,
                },
              }
            : destination,
      });
      const existing = await repository.find(id);
      if (existing) {
        const savedBinding = existing.prepared.binding;
        await access.assertAllowed(savedBinding);
        const savedPayload = await codec.open(
          savedBinding,
          existing.prepared.journal
        );
        if (
          !isDeepStrictEqual(
            {
              ...savedBinding,
              generation: '1',
              baseETag: provisional.baseETag,
            },
            provisional
          ) ||
          !isDeepStrictEqual(
            savedPayload,
            SagaPayloadSchema.parse(input.payload)
          )
        )
          throw new ColorOperationError(
            'conflict',
            'Provider request ID was reused'
          );
        return existing;
      }
      await access.assertAllowed(provisional);
      const current = await repository.inspect({
        binding: provisional,
        journal: { version: 1, ciphertext: 'inspection-only' },
      });
      if (
        current.operation &&
        ['reserved', 'prepared', 'dispatched'].includes(current.operation.phase)
      )
        throw new ColorOperationError(
          'conflict',
          'Provider operation in progress'
        );
      let baseETag: string | null = null;
      const payload = SagaPayloadSchema.parse(input.payload);
      if (provisional.source && provisional.source.provider !== 'tuturuuu') {
        const original = await provider.observe(
          provisional,
          provisional.source
        );
        if (
          original.absent ||
          original.eventId !== provisional.source.identity.providerEventId
        )
          throw new ColorOperationError(
            'identity',
            'Provider move source unavailable'
          );
        baseETag = original.etag;
        if (
          Array.isArray(original.event.attendees) &&
          original.event.attendees.length > 0
        )
          throw new ColorOperationError(
            'unavailable',
            'Attendee-bearing transfers require acceptance'
          );
        if (
          provisional.mode === 'google-move' &&
          Object.keys(payload.event).length > 0
        )
          throw new ColorOperationError(
            'unavailable',
            'Combined provider edits require durable admission'
          );
        if (provisional.mode === 'google-move') {
          if (original.event.eventLabelId)
            throw new ColorOperationError(
              'conflict',
              'Calendar-scoped label moves require reconciliation'
            );
          const sourceICalUID = z
            .string()
            .min(1)
            .safeParse(original.event.iCalUID);
          if (!sourceICalUID.success)
            throw new ColorOperationError(
              'identity',
              'Google source fingerprint unavailable'
            );
          payload.sourceICalUID = sourceICalUID.data;
        }
        if (provisional.mode === 'external-to-native') {
          if (provisional.source.provider !== 'google')
            throw new ColorOperationError(
              'unavailable',
              'Native transfer source unavailable'
            );
          const event = original.event as calendar_v3.Schema$Event;
          if (
            event.id !== original.eventId ||
            event.etag !== original.etag ||
            !(event.start?.date || event.start?.dateTime) ||
            !(event.end?.date || event.end?.dateTime)
          )
            throw new ColorOperationError(
              'identity',
              'Native transfer snapshot unavailable'
            );
          const formatted = formatEventForDb(
            event,
            authorized.wsId,
            provisional.source.identity.calendarId,
            { calendarId: provisional.source.identity.calendarId }
          );
          payload.sourceSnapshot = {
            title: formatted.title,
            description: formatted.description,
            location: formatted.location,
            start_at: formatted.start_at,
            end_at: formatted.end_at,
            color: formatted.color,
          };
        }
      }
      const binding = SagaBindingSchema.parse({
        ...provisional,
        generation: (BigInt(current.generation) + 1n).toString(),
        baseETag,
      });
      const prepared = {
        binding,
        journal: await codec.seal(binding, payload),
      };
      return repository.admit(
        {
          id,
          generation: binding.generation,
          phase: 'prepared',
          checkpoint: null,
          prepared,
        },
        current.generation,
        input.placeholder
      );
    },
  };
}

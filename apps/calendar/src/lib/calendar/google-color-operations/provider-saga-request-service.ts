import { randomUUID } from 'node:crypto';
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
    read: (id: string) => repository.read(z.guid().parse(id)),
    execute: (id: string) => executor.execute(z.guid().parse(id)),
    cancel: (id: string) => executor.cancel(z.guid().parse(id)),
    async reserve(input: {
      binding: Omit<SagaBinding, 'operationId' | 'generation' | 'baseETag'>;
      payload: SagaPayload;
      placeholder?: Record<string, unknown>;
    }) {
      const id = randomUUID();
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
      }
      const binding = SagaBindingSchema.parse({
        ...provisional,
        generation: (BigInt(current.generation) + 1n).toString(),
        baseETag,
      });
      const prepared = {
        binding,
        journal: await codec.seal(binding, input.payload),
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

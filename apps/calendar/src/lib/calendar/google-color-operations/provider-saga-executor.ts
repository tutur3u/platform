import { ColorOperationError } from './protocol';
import type { createProviderSagaCodec } from './provider-saga-codec';
import {
  type ProviderSagaAccess,
  type ProviderSagaAdapter,
  SAGA_OPERATION_MARKER,
  type SagaBinding,
  SagaBindingSchema,
  type SagaCheckpoint,
  type SagaEndpoint,
  type SagaObservation,
  type SagaPayload,
} from './provider-saga-protocol';
import type { SealedJournal } from './sealed-journal';

export type ProviderSagaOperation = {
  id: string;
  generation: string;
  phase: 'prepared' | 'dispatched' | 'applied' | 'superseded' | 'canceled';
  prepared: { binding: SagaBinding; journal: SealedJournal };
  checkpoint: SagaCheckpoint | null;
};
export type ProviderSagaCompletion = {
  outcome: 'applied' | 'superseded';
  endpoint: SagaEndpoint;
  observation: SagaObservation | null;
  localPatch: SagaPayload['localPatch'];
};
export interface ProviderSagaRepository {
  read(id: string): Promise<ProviderSagaOperation>;
  dispatch(operation: ProviderSagaOperation): Promise<ProviderSagaOperation>;
  checkpoint(
    operation: ProviderSagaOperation,
    checkpoint: SagaCheckpoint
  ): Promise<ProviderSagaOperation>;
  finalize(
    operation: ProviderSagaOperation,
    completion: ProviderSagaCompletion
  ): Promise<ProviderSagaOperation>;
  cancel(operation: ProviderSagaOperation): Promise<ProviderSagaOperation>;
}
const terminal = (operation: ProviderSagaOperation) =>
  ['applied', 'superseded', 'canceled'].includes(operation.phase);
const unavailable = (message: string): never => {
  throw new ColorOperationError('unavailable', message);
};
function present(observation: SagaObservation) {
  if (observation.absent)
    return unavailable('Provider saga destination unavailable');
  return observation;
}

/** Checkpoints never release the event generation. Ambiguous SDK responses keep
 * the saga dispatched; compensation only removes the captured target version. */
export function createProviderSagaExecutor(args: {
  access: ProviderSagaAccess;
  repository: ProviderSagaRepository;
  provider: ProviderSagaAdapter;
  codec: ReturnType<typeof createProviderSagaCodec>;
}) {
  const { access, repository, provider, codec } = args;
  async function read(id: string) {
    const operation = await repository.read(id);
    const binding = SagaBindingSchema.parse(operation.prepared.binding);
    if (
      operation.id !== id ||
      binding.operationId !== id ||
      binding.generation !== operation.generation
    )
      throw new ColorOperationError('identity', 'Provider saga changed');
    await access.assertAllowed(binding);
    return operation;
  }
  return {
    async execute(id: string) {
      let operation = await read(id);
      if (terminal(operation)) return operation;
      const binding = operation.prepared.binding;
      const payload = await codec.open(binding, operation.prepared.journal);
      operation = await repository.dispatch(operation);
      if (terminal(operation)) return operation;
      const authorized = () => access.assertAllowed(binding);
      const observe = async (endpoint: SagaEndpoint, eventId?: string) => {
        await authorized();
        return provider.observe(binding, endpoint, eventId);
      };
      const finalize = async (
        outcome: ProviderSagaCompletion['outcome'],
        endpoint: SagaEndpoint,
        observation: SagaObservation | null
      ) => {
        await authorized();
        return repository.finalize(operation, {
          outcome,
          endpoint,
          observation,
          localPatch: outcome === 'applied' ? payload.localPatch : {},
        });
      };
      if (operation.checkpoint?.step === 'target-removed') {
        if (!binding.source)
          return unavailable('Compensated saga source unavailable');
        const source = await observe(binding.source);
        if (!source.absent && source.etag === binding.baseETag)
          return unavailable('Provider saga source is not fenced');
        return finalize('superseded', binding.source, source);
      }
      if (binding.mode === 'external-to-native') {
        if (!binding.source)
          return unavailable('Provider saga source unavailable');
        if (operation.checkpoint?.step !== 'source-deleted') {
          await authorized();
          try {
            await provider.deleteSource(binding, payload);
          } catch (error) {
            if (
              !(error instanceof ColorOperationError) ||
              error.reason !== 'conflict'
            )
              throw error;
            const source = await observe(binding.source);
            if (!source.absent) {
              if (source.etag === binding.baseETag)
                return unavailable('Provider saga source is not fenced');
              return finalize('superseded', binding.source, source);
            }
          }
          if (!(await observe(binding.source)).absent)
            return unavailable('Provider saga source deletion unconfirmed');
          operation = await repository.checkpoint(operation, {
            step: 'source-deleted',
          });
        }
        return finalize('applied', binding.destination, null);
      }
      let target: Exclude<SagaObservation, { absent: true }>;
      if (!operation.checkpoint) {
        await authorized();
        target = present(
          binding.mode === 'google-move'
            ? await provider.move(binding, payload)
            : await provider.insert(binding, payload)
        );
        if (binding.destination.provider === 'tuturuuu')
          return unavailable('Provider saga external destination required');
        if (
          binding.destination.identity.providerEventId &&
          target.eventId !== binding.destination.identity.providerEventId
        )
          throw new ColorOperationError(
            'identity',
            'Provider saga destination changed'
          );
        if (binding.mode !== 'google-move' && target.marker !== id)
          throw new ColorOperationError(
            'identity',
            `Provider saga ${SAGA_OPERATION_MARKER} missing`
          );
        operation = await repository.checkpoint(operation, {
          step: 'target-created',
          targetEventId: target.eventId,
          targetETag: target.etag,
        });
      } else
        target = present(
          await observe(binding.destination, operation.checkpoint.targetEventId)
        );
      const checkpoint = operation.checkpoint!;
      if (
        target.eventId !== checkpoint.targetEventId ||
        (binding.mode !== 'google-move' && target.marker !== id)
      )
        throw new ColorOperationError(
          'identity',
          'Provider saga target identity changed'
        );
      if (
        binding.source &&
        binding.source.provider !== 'tuturuuu' &&
        checkpoint.step !== 'source-deleted'
      ) {
        await authorized();
        try {
          if (binding.mode !== 'google-move')
            await provider.deleteSource(binding, payload);
        } catch (error) {
          if (
            !(error instanceof ColorOperationError) ||
            error.reason !== 'conflict'
          )
            throw error;
          const source = await observe(binding.source);
          if (!source.absent) {
            if (source.etag === binding.baseETag)
              return unavailable('Provider saga source is not fenced');
            await authorized();
            await provider.removeTarget(binding, checkpoint);
            if (
              !(await observe(binding.destination, checkpoint.targetEventId))
                .absent
            )
              return unavailable('Provider saga compensation unconfirmed');
            operation = await repository.checkpoint(operation, {
              ...checkpoint,
              step: 'target-removed',
            });
            return finalize('superseded', binding.source, source);
          }
        }
        if (!(await observe(binding.source)).absent)
          return unavailable('Provider saga source deletion unconfirmed');
        operation = await repository.checkpoint(operation, {
          ...checkpoint,
          step: 'source-deleted',
        });
      }
      target = present(
        await observe(binding.destination, checkpoint.targetEventId)
      );
      if (
        target.eventId !== checkpoint.targetEventId ||
        (binding.mode !== 'google-move' && target.marker !== id)
      )
        throw new ColorOperationError(
          'identity',
          'Provider saga final target changed'
        );
      return finalize('applied', binding.destination, target);
    },
    async cancel(id: string) {
      return repository.cancel(await read(id));
    },
  };
}

import type { calendar_v3 } from '@tuturuuu/google';
import type {
  createGoogleMutationProvider,
  PreparedGoogleMutation,
} from './mutation-provider';
import {
  COLOR_OPERATION_MARKER,
  type ColorOperationAccess,
  ColorOperationError,
  type ColorOperationIdentity,
  sameColorOperationIdentity,
} from './protocol';

export type GoogleMutationOperation = {
  id: string;
  generation: string;
  identity: ColorOperationIdentity;
  phase: 'prepared' | 'dispatched' | 'applied' | 'superseded' | 'canceled';
  prepared: PreparedGoogleMutation;
};
export type GoogleMutationCompletion =
  | { deleted: true; outcome: 'applied' | 'superseded' }
  | {
      deleted: false;
      outcome: 'applied' | 'superseded';
      event: calendar_v3.Schema$Event;
      localPatch: { locked?: boolean };
    };

/** Admission persists the encrypted preparation atomically with the generation
 * increment. Finalization atomically projects authoritative provider state (with
 * encrypted sensitive fields), merges the latest local metadata, handles habit
 * skips/link cleanup on deletion and retains the tombstone generation. */
export interface GoogleMutationRepository {
  admit(
    operation: GoogleMutationOperation,
    expectedGeneration: string
  ): Promise<GoogleMutationOperation>;
  read(
    identity: ColorOperationIdentity,
    id: string
  ): Promise<GoogleMutationOperation>;
  markDispatched(
    operation: GoogleMutationOperation
  ): Promise<GoogleMutationOperation>;
  finalize(
    operation: GoogleMutationOperation,
    completion: GoogleMutationCompletion
  ): Promise<GoogleMutationOperation>;
  cancelUnsent(
    operation: GoogleMutationOperation
  ): Promise<GoogleMutationOperation>;
}

const terminal = (phase: GoogleMutationOperation['phase']) =>
  ['applied', 'superseded', 'canceled'].includes(phase);

/** Crash recovery reuses the original sealed preparation, including its ETag.
 * No provider success or timeout can authorize a successor until finalization.
 * There is no lease expiration, network retry with a fresh ETag, or lost intent. */
export function createGoogleMutationExecutor(args: {
  access: ColorOperationAccess;
  repository: GoogleMutationRepository;
  provider: ReturnType<typeof createGoogleMutationProvider>;
}) {
  const { access, repository, provider } = args;
  async function read(identity: ColorOperationIdentity, id: string) {
    await access.assertAllowed(identity);
    const operation = await repository.read(identity, id);
    if (
      operation.id !== id ||
      !sameColorOperationIdentity(operation.identity, identity) ||
      !sameColorOperationIdentity(
        operation.prepared.binding.identity,
        identity
      ) ||
      operation.prepared.binding.operationId !== id ||
      operation.prepared.binding.generation !== operation.generation
    )
      throw new ColorOperationError(
        'identity',
        'Google mutation identity changed'
      );
    return operation;
  }
  return {
    async execute(identity: ColorOperationIdentity, id: string) {
      let operation = await read(identity, id);
      if (terminal(operation.phase)) return operation;
      await access.assertAllowed(identity);
      operation = await repository.markDispatched(operation);
      // A cancel that won before dispatch must never cause a network attempt.
      if (terminal(operation.phase)) return operation;
      try {
        await provider.dispatch(identity, operation.prepared);
      } catch (error) {
        if (!provider.isFencedError(error)) throw error;
      }
      const observation = await provider.observe(identity);
      let completion: GoogleMutationCompletion;
      if (observation.deleted) {
        // A confirmed tombstone fences delayed PATCH/DELETE through If-Match.
        // An external deletion supersedes a patch rather than applying its body.
        completion = {
          deleted: true,
          outcome:
            operation.prepared.binding.action === 'delete'
              ? 'applied'
              : 'superseded',
        };
      } else {
        if (observation.event.etag === operation.prepared.binding.baseETag)
          throw new ColorOperationError(
            'unavailable',
            'Google mutation is not fenced'
          );
        const applied =
          operation.prepared.binding.action === 'patch' &&
          observation.event.extendedProperties?.private?.[
            COLOR_OPERATION_MARKER
          ] === id;
        completion = {
          deleted: false,
          outcome: applied ? 'applied' : 'superseded',
          event: observation.event,
          // Local-only intent belongs only to a verified applied operation;
          // supersession projects current Google content without old lock input.
          localPatch: applied
            ? await provider.localIntent(operation.prepared)
            : {},
        };
      }
      await access.assertAllowed(identity);
      return repository.finalize(operation, completion);
    },
    async cancel(identity: ColorOperationIdentity, id: string) {
      return repository.cancelUnsent(await read(identity, id));
    },
  };
}

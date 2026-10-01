import {
  COLOR_OPERATION_MARKER,
  type ColorOperation,
  type ColorOperationAccess,
  ColorOperationError,
  type ColorOperationIdentity,
  type ColorOperationProvider,
  type ColorOperationRepository,
  sameColorOperationIdentity,
} from './protocol';

const terminal = (operation: ColorOperation) =>
  ['applied', 'superseded', 'canceled'].includes(operation.phase);

/** Recover one immutable operation. This never adopts a newer ETag or intent. */
export function createColorOperationExecutor(dependencies: {
  repository: ColorOperationRepository;
  provider: ColorOperationProvider;
  access: ColorOperationAccess;
}) {
  const { repository, provider, access } = dependencies;

  async function execute(
    identity: ColorOperationIdentity,
    operationId: string
  ) {
    await access.assertAllowed(identity);
    let operation = await repository.read(identity, operationId);
    if (
      operation.id !== operationId ||
      !sameColorOperationIdentity(operation.identity, identity) ||
      operation.intent.connectionId !== identity.connectionId
    )
      throw new ColorOperationError(
        'identity',
        'Google operation identity changed'
      );
    if (terminal(operation)) return operation;
    if (operation.phase === 'reserved') {
      const prepared = await provider.prepare(operation);
      if (!prepared.baseETag)
        throw new ColorOperationError(
          'unavailable',
          'Google event version is unavailable'
        );
      // The persisted private marker makes an otherwise no-op color patch change
      // Google version. Existing private properties must be preserved by adapter.
      const extended = prepared.patch.extendedProperties as
        | { private?: Record<string, string> }
        | undefined;
      prepared.patch = {
        ...prepared.patch,
        extendedProperties: {
          ...extended,
          private: {
            ...extended?.private,
            [COLOR_OPERATION_MARKER]: operation.id,
          },
        },
      };
      operation = await repository.prepare(operation, prepared);
    }
    if (!operation.prepared)
      throw new ColorOperationError(
        'storage',
        'Prepared Google operation is unavailable'
      );
    // A safe cancel races this transaction, never an unrecorded provider call.
    await access.assertAllowed(identity);
    operation = await repository.markDispatched(operation);
    if (!operation.prepared)
      throw new ColorOperationError(
        'storage',
        'Prepared Google operation is unavailable'
      );
    try {
      await provider.patch(identity, operation.prepared);
    } catch (error) {
      if (!provider.isPreconditionFailure(error)) throw error;
      // 412 is a provider fence, not permission to refresh this operation's ETag.
    }
    const snapshot = await provider.read(identity);
    if (!snapshot.etag || snapshot.etag === operation.prepared.baseETag)
      throw new ColorOperationError(
        'unavailable',
        'Google operation is not fenced yet'
      );
    // An external update can supersede the intent even when its color matches.
    const outcome =
      snapshot.operationMarker === operation.id ? 'applied' : 'superseded';
    await access.assertAllowed(identity);
    return repository.finalize(operation, snapshot, outcome);
  }

  async function cancel(identity: ColorOperationIdentity, operationId: string) {
    await access.assertAllowed(identity);
    const operation = await repository.read(identity, operationId);
    return repository.cancelUnsent(operation);
  }

  return { execute, cancel };
}

import {
  type ProviderSagaAccess,
  SagaBindingSchema,
  SagaPayloadSchema,
  sagaScope,
} from './provider-saga-protocol';
import { createSealedJournalCodec } from './sealed-journal';

/** Both endpoint bindings are authenticated as one immutable encrypted intent. */
export function createProviderSagaCodec(args: {
  access: ProviderSagaAccess;
  getKey?: (wsId: string) => Promise<Buffer | null>;
}) {
  return createSealedJournalCodec({
    binding: SagaBindingSchema,
    payload: SagaPayloadSchema,
    authorize: (binding) => args.access.assertAllowed(binding),
    workspace: (binding) => sagaScope(binding.destination).wsId,
    getKey: args.getKey,
  });
}

import { google } from '@tuturuuu/google';
import { decryptEventFromStorage } from '../../workspace-encryption';
import { loadGoogleColorOptions } from '../google-color-choices';
import { createGoogleAuthClient } from '../provider-writes';
import { ColorOperationError } from './protocol';
import { createProviderSagaAdapter } from './provider-saga-adapter';
import { createProviderSagaProjection } from './provider-saga-projection';
import type { SagaBinding, SagaEndpoint } from './provider-saga-protocol';
import { createRequestProviderSagaService } from './provider-saga-request-service';

/** This assembly is reachable only through the disabled candidate route slice.
 * Credentials and color metadata are resolved again for each provider use. */
export async function createRoutedProviderSagaService(
  request: Request,
  rawWsId: string,
  eventId: string,
  recoveryOperationId?: string
) {
  const service = await createRequestProviderSagaService(
    request,
    rawWsId,
    eventId,
    {
      recoveryOperationId,
      provider: (access) =>
        createProviderSagaAdapter({
          access,
          // Synthetic Google acceptance verified deterministic insert/retry,
          // conditional move and delete. Graph remains unsupported.
          capabilities: {
            googleInsert: true,
            googleConditionalDelete: true,
            googleMove: true,
          },
          resolveGoogle: async (binding, endpoint) => {
            const { source } = await access.resolveEndpoint(binding, endpoint);
            if (source.provider !== 'google')
              throw new ColorOperationError(
                'identity',
                'Google source changed'
              );
            return google.calendar({
              version: 'v3',
              auth: createGoogleAuthClient(source),
            });
          },
        }),
      project: (completion, access) =>
        createProviderSagaProjection({
          access,
          googleColorContext: async ({ binding, endpoint }) => {
            if (endpoint.provider !== 'google')
              throw new ColorOperationError(
                'identity',
                'Google source changed'
              );
            const { source } = await access.resolveEndpoint(binding, endpoint);
            const calendar = google.calendar({
              version: 'v3',
              auth: createGoogleAuthClient(source),
            });
            return (await loadGoogleColorOptions(calendar, source)).context;
          },
        })(completion),
    }
  );
  return {
    ...service,
    async readEvent(binding: SagaBinding) {
      await service.access.assertAllowed(binding);
      const { sbAdmin, wsId } = await service.access.authorization();
      const { data, error } = await sbAdmin
        .from('workspace_calendar_events')
        .select('*')
        .eq('ws_id', wsId)
        .eq('id', eventId)
        .single();
      if (error || !data)
        throw new ColorOperationError('storage', 'Calendar event unavailable');
      return decryptEventFromStorage(data, wsId);
    },
    async resolveGoogle(binding: SagaBinding, endpoint: SagaEndpoint) {
      if (endpoint.provider !== 'google')
        throw new ColorOperationError(
          'unavailable',
          'Provider source unavailable'
        );
      const { source } = await service.access.resolveEndpoint(
        binding,
        endpoint
      );
      return {
        source,
        calendar: google.calendar({
          version: 'v3',
          auth: createGoogleAuthClient(source),
        }),
      };
    },
  };
}

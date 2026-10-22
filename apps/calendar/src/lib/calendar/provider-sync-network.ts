import { type Configuration, MicrosoftGraphClient } from '@tuturuuu/microsoft';
import { providerSyncFetch } from './provider-sync-budget';

type NetworkClient = NonNullable<
  NonNullable<Configuration['system']>['networkClient']
>;

export const providerSyncNetworkClient: NetworkClient = {
  async sendGetRequestAsync(url, options) {
    const response = await providerSyncFetch(url, {
      headers: options?.headers,
    });
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: await response.json(),
    };
  },
  async sendPostRequestAsync(url, options) {
    const response = await providerSyncFetch(url, {
      method: 'POST',
      headers: options?.headers,
      body: options?.body,
    });
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: await response.json(),
    };
  },
};

/** A single attempt with cancellation; the next cron owns transient retries. */
export function createSyncGraphClient(accessToken: string) {
  return MicrosoftGraphClient.initWithMiddleware({
    middleware: [
      {
        async execute(context) {
          const url = new URL(
            typeof context.request === 'string'
              ? context.request
              : context.request.url
          );
          if (url.origin !== 'https://graph.microsoft.com')
            throw new Error('Unsafe Microsoft calendar origin');
          const headers = new Headers(context.options?.headers);
          headers.set('Authorization', `Bearer ${accessToken}`);
          context.response = await providerSyncFetch(context.request, {
            ...context.options,
            headers,
            redirect: 'error',
          });
        },
      },
    ],
  });
}

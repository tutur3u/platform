import { getInternalApiClient, type InternalApiClientOptions } from './client';

let appBaseResolver: InternalApiClientOptions['appBaseResolver'];

export function configureMeetApiPaths(
  resolver: NonNullable<InternalApiClientOptions['appBaseResolver']>
) {
  appBaseResolver = resolver;
}

export function getMeetApiClient(options: InternalApiClientOptions = {}) {
  return getInternalApiClient({
    ...options,
    appBaseResolver:
      options.appBaseResolver ??
      (options.baseUrl ? undefined : appBaseResolver),
  });
}

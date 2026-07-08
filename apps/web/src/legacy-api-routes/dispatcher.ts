import { createLegacyApiDispatcher } from './dispatch-core';
import { apiRouteLoaders } from './registry';
import { v1RouteLoaders } from './registry/v1';

export { createLegacyApiDispatcher } from './dispatch-core';

export const dispatchLegacyApiRoute =
  createLegacyApiDispatcher(apiRouteLoaders);

export const dispatchLegacyV1ApiRoute = createLegacyApiDispatcher(
  v1RouteLoaders,
  {
    requestPrefixSegments: ['v1'],
    routeFilePrefixSegments: ['v1'],
  }
);

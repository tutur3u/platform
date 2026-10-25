import {
  type BridgeAppConfig,
  defineBridgeAppConfig,
} from '@tuturuuu/start-bridge/start/app-config';
import { INVENTORY_APP_URL } from './src/constants/common';

type StorefrontApiEnvironment = {
  INTERNAL_WEB_API_ORIGIN?: string;
  INVENTORY_APP_URL?: string;
  NEXT_PUBLIC_INVENTORY_APP_URL?: string;
};

type ApiOrigin = NonNullable<
  BridgeAppConfig<StorefrontApiEnvironment>['apiOrigin']
>;

export const selectStorefrontApiOrigin: ApiOrigin = (
  _request,
  { env, path }
) =>
  path.startsWith('/api/v1/inventory/')
    ? (env.INVENTORY_APP_URL ??
      env.NEXT_PUBLIC_INVENTORY_APP_URL ??
      INVENTORY_APP_URL)
    : undefined;

export default defineBridgeAppConfig<StorefrontApiEnvironment>({
  apiOrigin: selectStorefrontApiOrigin,
  wrapResponse(response) {
    const result = new Response(response.body, response);
    result.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return result;
  },
});

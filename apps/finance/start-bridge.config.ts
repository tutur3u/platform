import { defineBridgeAppConfig } from '@tuturuuu/start-bridge/start/app-config';
import type { FinanceEnvironment } from './cloudflare/worker';

export default defineBridgeAppConfig<FinanceEnvironment>({
  wrapResponse(response, { env }) {
    if (env.TUTURUUU_NOINDEX !== '1') return response;
    const staging = new Response(response.body, response);
    staging.headers.set('X-Robots-Tag', 'noindex, nofollow, nosnippet');
    return staging;
  },
});

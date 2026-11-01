import { defaultContentSecurityPolicy } from '@tuturuuu/start-bridge/csp';
import { createRootResponsePolicy } from '@tuturuuu/start-bridge/response-policy';
import { defineBridgeAppConfig } from '@tuturuuu/start-bridge/start/app-config';
import { scopeStagingCookies } from './src/start-candidate/staging-policy';

const decorate = createRootResponsePolicy({
  seo: 'noindex, nofollow, nosnippet',
});

export default defineBridgeAppConfig({
  mounts: {
    rootHosts: ['drive.tutur3u.com'],
    mountHosts: [],
    unknownHost: 'reject',
  },
  worker: { workersDev: false },
  csp: defaultContentSecurityPolicy,
  wrapResponse: (response, context) =>
    scopeStagingCookies(decorate(response, context)),
});

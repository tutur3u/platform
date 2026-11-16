import {
  appRobots,
  createRootResponsePolicy,
} from '@tuturuuu/start-bridge/response-policy';
import { defineBridgeAppConfig } from '@tuturuuu/start-bridge/start/app-config';

export default defineBridgeAppConfig({
  mounts: {
    rootHosts: ['playground.tuturuuu.com', 'playground.tutur3u.com'],
    unknownHost: 'reject',
  },
  csp: (nonce) =>
    [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}'`,
      "connect-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'self'",
      "form-action 'none'",
      "worker-src 'none'",
    ].join('; '),
  wrapResponse: createRootResponsePolicy({ seo: appRobots }),
});

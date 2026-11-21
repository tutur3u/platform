// App-owned start-bridge Worker options for infrastructure: the codemod created this
// file and never overwrites it. See "Worker options" in
// apps/docs/build/devops/start-bridge-codemod.mdx.
import { defaultContentSecurityPolicy } from '@tuturuuu/start-bridge/csp';
import {
  appRobots,
  createRootResponsePolicy,
} from '@tuturuuu/start-bridge/response-policy';
import { defineBridgeAppConfig } from '@tuturuuu/start-bridge/start/app-config';

export default defineBridgeAppConfig({
  mounts: {
    rootHosts: ['infrastructure.tuturuuu.com'],
    mountHosts: ['tuturuuu.com'],
    basePath: '/admin',
    unknownHost: 'reject',
    isolation: { ownedCookies: ['NEXT_LOCALE'] },
    // Admin pages and endpoints rely on the proxy for the apex session.
    proxyAllMountedPaths: true,
  },
  // Admin shares the tuturuuu.com origin with every mounted app, so only
  // nonce-stamped scripts run; injected markup cannot execute.
  csp: (nonce) =>
    defaultContentSecurityPolicy(nonce).replace(
      'script-src ',
      "script-src 'self' "
    ),
  // Robots (the app's seo-policy.json allowlist on its canonical host),
  // framing, sniffing, referrer and private caching on every response; only
  // GET/HEAD static files keep their own caching.
  wrapResponse: createRootResponsePolicy({ seo: appRobots }),
});

// App-owned start-bridge Worker options for contacts: the codemod created this
// file and never overwrites it. See "Worker options" in
// apps/docs/build/devops/start-bridge-codemod.mdx.
import { defaultContentSecurityPolicy } from '@tuturuuu/start-bridge/csp';
import {
  appRobots,
  createRootResponsePolicy,
} from '@tuturuuu/start-bridge/response-policy';
import { defineBridgeAppConfig } from '@tuturuuu/start-bridge/start/app-config';

const decorate = createRootResponsePolicy({ seo: appRobots });

export default defineBridgeAppConfig({
  mounts: {
    unknownHost: 'reject',
    isolation: { ownedCookies: ['NEXT_LOCALE'] },
  },
  worker: { workersDev: false },
  csp: defaultContentSecurityPolicy,
  // Robots (the app's seo-policy.json allowlist on its canonical host),
  // framing, sniffing, referrer and private caching on every response; only
  // GET/HEAD static files keep their own caching.
  wrapResponse(response, context) {
    const decorated = decorate(response, context);
    decorated.headers.set('x-tuturuuu-runtime', 'native');
    return decorated;
  },
});

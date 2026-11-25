// App-owned start-bridge Worker options for whiteboards: the codemod created this
// file and never overwrites it. See "Worker options" in
// apps/docs/build/devops/start-bridge-codemod.mdx.
import {
  appRobots,
  createRootResponsePolicy,
} from '@tuturuuu/start-bridge/response-policy';
import {
  defineBridgeAppConfig,
  withDocumentSecurity,
} from '@tuturuuu/start-bridge/start/app-config';

export default defineBridgeAppConfig(
  withDocumentSecurity('whiteboards', {
    mounts: {
      rootHosts: ['whiteboards.tuturuuu.com'],
      // The apex mount is admitted by the production profile only; the staging
      // artifact answers its own root host and nothing on tuturuuu.com.
      mountHosts:
        import.meta.env?.VITE_WHITEBOARDS_NATIVE_PROFILE === 'production'
          ? ['tuturuuu.com']
          : [],
      basePath: '/whiteboards',
      isolation: {
        ownedCookies: [
          'NEXT_LOCALE',
          'sidebar-collapsed',
          'sidebar-behavior',
          'sidebar-behavior-updated-at',
        ],
      },
      unknownHost: 'reject',
    },
    worker: { workersDev: false },
    // Robots (the app's seo-policy.json allowlist on its canonical host),
    // framing, sniffing, referrer and private caching on every response; only
    // GET/HEAD static files keep their own caching.
    wrapResponse: createRootResponsePolicy({ seo: appRobots }),
  })
);

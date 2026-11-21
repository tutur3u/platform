// App-owned start-bridge Worker options for chat: the codemod created this
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
  withDocumentSecurity('chat', {
    mounts: {
      rootHosts: ['chat.tuturuuu.com'],
      mountHosts: ['tuturuuu.com'],
      basePath: '/chat',
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
    // Robots (the app's seo-policy.json allowlist on its canonical host),
    // framing, sniffing, referrer and private caching on every response; only
    // GET/HEAD static files keep their own caching.
    wrapResponse: createRootResponsePolicy({ seo: appRobots }),
  })
);

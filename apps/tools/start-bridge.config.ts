// App-owned start-bridge Worker options for tools: the codemod created this
// file and never overwrites it. See "Worker options" in
// apps/docs/build/devops/start-bridge-codemod.mdx.
import {
  appRobots,
  createRootResponsePolicy,
} from '@tuturuuu/start-bridge/response-policy';
import { defineBridgeAppConfig } from '@tuturuuu/start-bridge/start/app-config';

export default defineBridgeAppConfig({
  // Production keeps `tools.tuturuuu.com` plus the `tuturuuu.com/tools`
  // mount. Staging is Cloudflare-only on `tools.tutur3u.com`: the Worker
  // serves no other host (no `*.workers.dev`, no Vercel preview). The codemod
  // derives `workers_dev: false` in void.config.ts from this policy.
  mounts: {
    rootHosts: ['tools.tuturuuu.com', 'tools.tutur3u.com'],
    unknownHost: 'reject',
  },
  // Robots (the app's seo-policy.json allowlist on its canonical host),
  // framing, sniffing, referrer and private caching on every response; only
  // GET/HEAD static files keep their own caching.
  wrapResponse: createRootResponsePolicy({ seo: appRobots }),
});

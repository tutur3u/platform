// App-owned start-bridge Worker options for tools: the codemod created this
// file and never overwrites it. See "Worker options" in
// apps/docs/build/devops/start-bridge-codemod.mdx.
import { defineBridgeAppConfig } from '@tuturuuu/start-bridge/start/app-config';

export default defineBridgeAppConfig({
  mounts: {
    // Production keeps `tools.tuturuuu.com` plus the `tuturuuu.com/tools`
    // mount. Staging is Cloudflare-only on `tools.tutur3u.com`: the Worker
    // serves no other host (no `*.workers.dev`, no Vercel preview).
    rootHosts: ['tools.tuturuuu.com', 'tools.tutur3u.com'],
    unknownHost: 'reject',
  },
});

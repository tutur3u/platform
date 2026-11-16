// App-owned start-bridge Worker options for hive: the codemod created this
// file and never overwrites it. See "Worker options" in
// apps/docs/build/devops/start-bridge-codemod.mdx.
import {
  appRobots,
  createRootResponsePolicy,
} from '@tuturuuu/start-bridge/response-policy';
import { defineBridgeAppConfig } from '@tuturuuu/start-bridge/start/app-config';
import {
  HIVE_MOUNTED_REPORT_ONLY_POLICY,
  hiveContentSecurityPolicy,
  isHiveMountedRequest,
} from './cloudflare/apex-csp';
import { hiveApexMounts } from './cloudflare/apex-mount';

const rootResponsePolicy = createRootResponsePolicy({ seo: appRobots });

export default defineBridgeAppConfig({
  mounts: hiveApexMounts,
  // Strict nonce CSP on tuturuuu.com/hive only (see cloudflare/apex-csp.ts).
  csp: hiveContentSecurityPolicy,
  // Robots (the app's seo-policy.json allowlist on its canonical host),
  // framing, sniffing, referrer and private caching on every response; only
  // GET/HEAD static files keep their own caching. Mounted HTML also carries
  // the report-only Trusted Types policy.
  wrapResponse: async (response, context) => {
    const wrapped = await rootResponsePolicy(response, context);
    if (
      !isHiveMountedRequest(context.request) ||
      !wrapped.headers.get('content-type')?.includes('text/html') ||
      wrapped.status === 101
    )
      return wrapped;
    const result = new Response(wrapped.body, wrapped);
    result.headers.set(
      'Content-Security-Policy-Report-Only',
      HIVE_MOUNTED_REPORT_ONLY_POLICY
    );
    return result;
  },
});

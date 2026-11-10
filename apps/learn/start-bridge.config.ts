// App-owned start-bridge Worker options for learn: the codemod created this
// file and never overwrites it. See "Worker options" in
// apps/docs/build/devops/start-bridge-codemod.mdx.
import { defaultContentSecurityPolicy } from '@tuturuuu/start-bridge/csp';
import {
  appRobots,
  createRootResponsePolicy,
} from '@tuturuuu/start-bridge/response-policy';
import { defineBridgeAppConfig } from '@tuturuuu/start-bridge/start/app-config';
import {
  type AppSecurityProfile,
  applyDocumentSecurityHeaders,
  DEFAULT_PERMISSIONS,
  originSources,
} from '@tuturuuu/utils/security-headers';

// Robots (the app's seo-policy.json allowlist on its canonical host),
// framing, sniffing, referrer and private caching on every response; only
// GET/HEAD static files keep their own caching.
const rootPolicy = createRootResponsePolicy({ seo: appRobots });

function readVar(env: unknown, name: string) {
  const value =
    (env as Record<string, unknown> | undefined)?.[name] ??
    (typeof process === 'undefined' ? undefined : process.env[name]);
  return typeof value === 'string' && value ? value : undefined;
}

/**
 * Learn's full document policy, report-only, including Trusted Types: the
 * one-origin gate needs enforced CSP and Trusted Types per mounted app, and
 * this surfaces every violation (also on the tuturuuu.com/learn mount) before
 * enforcement. Scripts are already enforced by the nonce policy below.
 */
function learnSecurityProfile(env: unknown): AppSecurityProfile {
  const supabase = readVar(env, 'NEXT_PUBLIC_SUPABASE_URL');
  return {
    basePath: '/learn',
    connect: originSources(supabase, true),
    img: [...originSources(supabase), 'https:'],
    permissions: DEFAULT_PERMISSIONS,
  };
}

export default defineBridgeAppConfig({
  // Enforced: nonce + strict-dynamic scripts, no plugins, no base rewrites,
  // no framing (the same policy Track and Finance enforce).
  csp: defaultContentSecurityPolicy,
  async wrapResponse(response, context) {
    const secured = await rootPolicy(response, context);
    return applyDocumentSecurityHeaders(
      secured,
      learnSecurityProfile(context.env),
      {
        requestOrigin: new URL(context.request.url).origin,
        sharedOrigin:
          readVar(context.env, 'NEXT_PUBLIC_WEB_APP_URL') ??
          'https://tuturuuu.com',
        reportUri: readVar(context.env, 'TTR_CSP_REPORT_URI'),
      }
    );
  },
});

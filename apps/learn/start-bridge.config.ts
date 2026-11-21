// App-owned start-bridge Worker options for learn: the codemod created this
// file and never overwrites it. See "Worker options" in
// apps/docs/build/devops/start-bridge-codemod.mdx.
import { defaultContentSecurityPolicy } from '@tuturuuu/start-bridge/csp';
import {
  appRobots,
  createRootResponsePolicy,
} from '@tuturuuu/start-bridge/response-policy';
import {
  defineBridgeAppConfig,
  withDocumentSecurity,
} from '@tuturuuu/start-bridge/start/app-config';
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
const FINGERPRINTED_ASSET =
  /^\/assets\/.+-[\w-]{8}\.(?:css|js|mjs|woff2?|wasm|png|svg|webp)$/u;

function readVar(env: unknown, name: string) {
  const binding =
    typeof env === 'object' && env !== null && name in env
      ? Reflect.get(env, name)
      : undefined;
  const value =
    binding ?? (typeof process === 'undefined' ? undefined : process.env[name]);
  return typeof value === 'string' && value ? value : undefined;
}

/**
 * Learn's full document policy, report-only, including Trusted Types: the
 * one-origin gate needs enforced CSP and Trusted Types per mounted app, and
 * this surfaces every violation (also on the tuturuuu.com/learn mount) before
 * enforcement. Scripts are already enforced by the nonce policy below.
 */
function learnSecurityProfile(
  env: unknown,
  basePath: string
): AppSecurityProfile {
  const supabase = readVar(env, 'NEXT_PUBLIC_SUPABASE_URL');
  return {
    basePath,
    connect: originSources(supabase, true),
    img: [...originSources(supabase), 'https:'],
    permissions: DEFAULT_PERMISSIONS,
  };
}

export default defineBridgeAppConfig(
  withDocumentSecurity(
    'learn',
    {
      // Enforced: nonce + strict-dynamic scripts, no plugins, no base rewrites,
      // no framing (the same policy Track and Finance enforce).
      csp: defaultContentSecurityPolicy,
      async wrapResponse(response, context) {
        const secured = await rootPolicy(response, context);
        const { request, mounts } = context;
        const basePath = mounts?.basePath ?? '/learn';
        const url = new URL(request.url);
        const path =
          url.hostname === 'tuturuuu.com'
            ? url.pathname.slice(basePath.length)
            : url.pathname;
        if (
          (request.method === 'GET' || request.method === 'HEAD') &&
          secured.status === 200 &&
          FINGERPRINTED_ASSET.test(path) &&
          secured.headers.get('Cache-Control')?.startsWith('public,') &&
          !secured.headers.has('Set-Cookie')
        ) {
          secured.headers.set(
            'Cache-Control',
            'public, max-age=31536000, immutable'
          );
        }
        if (response.headers.get('Referrer-Policy') === 'no-referrer') {
          secured.headers.set('Referrer-Policy', 'no-referrer');
        }
        return applyDocumentSecurityHeaders(
          secured,
          learnSecurityProfile(context.env, basePath),
          {
            requestOrigin: url.origin,
            sharedOrigin:
              readVar(context.env, 'NEXT_PUBLIC_WEB_APP_URL') ??
              'https://tuturuuu.com',
            reportUri: readVar(context.env, 'TTR_CSP_REPORT_URI'),
          }
        );
      },
    },
    [
      'dompurify',
      'defaultWorkerFactory',
      'domLineBreaksComputer',
      'editorViewLayer',
      'standaloneColorizer',
      'richScreenReaderContent',
      'tokenizeToString',
      'stickyScrollViewLayer',
      'diffEditorWidget',
      'editorGhostText',
      'diffReview',
      'domSanitize0',
    ]
  )
);

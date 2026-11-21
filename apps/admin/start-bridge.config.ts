// App-owned start-bridge Worker options for infrastructure: the codemod created this
// file and never overwrites it. See "Worker options" in
// apps/docs/build/devops/start-bridge-codemod.mdx.
import {
  defaultContentSecurityPolicy,
  TRUSTED_TYPES_DIRECTIVES,
} from '@tuturuuu/start-bridge/csp';
import {
  appRobots,
  createRootResponsePolicy,
} from '@tuturuuu/start-bridge/response-policy';
import { defineBridgeAppConfig } from '@tuturuuu/start-bridge/start/app-config';

const rootPolicy = createRootResponsePolicy({ seo: appRobots });

function trustedTypesReportOnly() {
  return (
    typeof process !== 'undefined' && process.env.TTR_CSP_ADMIN === 'report'
  );
}

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
  // nonce-stamped scripts run and every script sink goes through the
  // document's Trusted Types `default` policy (see src/routes/__root.tsx).
  // TTR_CSP_ADMIN=report moves Trusted Types to a report-only policy.
  csp: (nonce) =>
    [
      defaultContentSecurityPolicy(nonce).replace(
        'script-src ',
        "script-src 'self' "
      ),
      ...(trustedTypesReportOnly() ? [] : [TRUSTED_TYPES_DIRECTIVES]),
    ].join('; '),
  // Robots (the app's seo-policy.json allowlist on its canonical host),
  // framing, sniffing, referrer and private caching on every response; only
  // GET/HEAD static files keep their own caching.
  wrapResponse(response, context) {
    const secured = rootPolicy(response, context);
    if (
      trustedTypesReportOnly() &&
      // Only Admin's own pages: forwarded Web HTML keeps its own policy.
      secured.headers
        .get('Content-Security-Policy')
        ?.includes("'strict-dynamic'") === true
    )
      secured.headers.set(
        'Content-Security-Policy-Report-Only',
        TRUSTED_TYPES_DIRECTIVES
      );
    return secured;
  },
});

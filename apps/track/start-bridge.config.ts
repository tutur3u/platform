// App-owned start-bridge Worker options for track: the codemod created this
// file and never overwrites it. See "Worker options" in
// apps/docs/build/devops/start-bridge-codemod.mdx.
import { defineBridgeAppConfig } from '@tuturuuu/start-bridge/start/app-config';

/** Production serves Track at its own subdomain root only (subdomain-first). */
export const TRACK_ROOT_HOSTS = ['track.tuturuuu.com'] as const;

/** Staging Worker hostnames an operator may admit through a Worker var. */
const STAGING_HOST = {
  test: (host: string) =>
    host === 'track.tutur3u.com' ||
    /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+workers\.dev$/u.test(
      host
    ),
};

/** `PRIVATE_ROBOTS_HEADER`: Track's SEO policy has no public paths. */
const ROBOTS = 'noindex, nofollow, nosnippet';

/** The Next build's one framable path (`createTuturuuuNextConfig`). */
const FRAMABLE =
  /^\/api\/v1\/workspaces\/[^/]+\/external-projects\/assets\/[^/]+\/webgl(?:\/|$)/u;

export interface TrackPolicyEnv {
  /**
   * Comma-separated exact staging hosts (`track.tutur3u.com` or reviewed workers.dev hosts)
   * served at the root, set on the staging Worker only. Never derived from a
   * request.
   */
  TUTURUUU_STAGING_HOSTS?: string;
}

/** Root-only and fail-closed: no apex mount, unlisted hosts get 404. */
export function trackMounts(env: TrackPolicyEnv) {
  const staging = (env.TUTURUUU_STAGING_HOSTS ?? '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter((host) => STAGING_HOST.test(host));
  return {
    rootHosts: [...TRACK_ROOT_HOSTS, ...staging],
    mountHosts: [],
    unknownHost: 'reject' as const,
  };
}

// Loaded on first use: Node imports this file (the runtime test reads
// `mounts`) and cannot resolve an extensionless TypeScript module.
let publicAssets: Promise<ReadonlySet<string>> | undefined;

/** Only a read of a hashed asset or a public file keeps its own caching. */
async function isStaticAssetRead(method: string, path: string) {
  if (method !== 'GET' && method !== 'HEAD') return false;
  if (path.startsWith('/assets/')) return true;
  publicAssets ??= import('./src/start-bridge/public-assets.bridge.gen').then(
    (module) => module.publicAssets
  );
  return (await publicAssets).has(path);
}

const FRAME_ANCESTORS = /^frame-ancestors(?:\s|$)/iu;

/**
 * Keeps the response's own CSP but enforces `frame-ancestors 'none'` in every
 * policy it carries (a comma separates policies), replacing any ancestor
 * directive already there.
 */
export function denyFraming(csp: string | null) {
  const policies = (csp ?? '')
    .split(',')
    .map((policy) =>
      policy
        .split(';')
        .map((directive) => directive.trim())
        .filter((directive) => directive && !FRAME_ANCESTORS.test(directive))
    )
    .filter((directives) => directives.length > 0);
  if (policies.length === 0) return "frame-ancestors 'none'";
  return policies
    .map((directives) => [...directives, "frame-ancestors 'none'"].join('; '))
    .join(', ');
}

/**
 * Production parity with the Next build (robots per the Track SEO policy,
 * anti-framing, HSTS) plus `nosniff` and a referrer policy. Every dynamic
 * response is personalized, so none is stored by any cache, whatever its
 * handler set; hashed assets and public files keep their caching.
 */
export async function decorateTrackResponse(
  response: Response,
  request: Request
) {
  const decorated = new Response(response.body, response);
  const { headers } = decorated;
  const path = new URL(request.url).pathname;
  headers.set('X-Robots-Tag', ROBOTS);
  if (!FRAMABLE.test(path)) {
    headers.set(
      'Content-Security-Policy',
      denyFraming(headers.get('Content-Security-Policy'))
    );
    headers.set('X-Frame-Options', 'DENY');
  }
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Strict-Transport-Security', 'max-age=63072000');
  if (!(await isStaticAssetRead(request.method, path)))
    headers.set('Cache-Control', 'private, no-store, max-age=0');
  return decorated;
}

export default defineBridgeAppConfig({
  mounts: trackMounts({
    TUTURUUU_STAGING_HOSTS: process.env.TUTURUUU_STAGING_HOSTS,
  }),
  wrapResponse: (response, { request }) =>
    decorateTrackResponse(response, request),
});

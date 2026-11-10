import { decideCohort, tagResponse } from '@tuturuuu/start-bridge/canary';
import {
  type AppMountConfig,
  resolveAppBase,
} from '@tuturuuu/start-bridge/mounts';
import type { AssetsBinding } from '@tuturuuu/start-bridge/start/handler';
import {
  type AppSecurityProfile,
  applyDocumentSecurityHeaders,
  DEFAULT_PERMISSIONS,
  originSources,
} from '@tuturuuu/utils/security-headers';
import { PRIVATE_ROBOTS_HEADER } from '@tuturuuu/utils/seo';
import { workerBuildInfo } from '@tuturuuu/utils/worker-build-info';
import { withoutPageRewrite } from '../lib/page-rewrite';
import { PUBLIC_ASSETS } from './public-assets';

/** Production serves Tasks at its own subdomain root only (subdomain-first). */
export const TASKS_ROOT_HOSTS = ['tasks.tuturuuu.com'] as const;

/** Staging Worker hostnames an operator may admit through a Worker var. */
const STAGING_HOST = {
  test: (host: string) =>
    host === 'tasks.tutur3u.com' ||
    /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+workers\.dev$/u.test(
      host
    ),
};

export interface TasksWorkerEnv {
  ASSETS?: AssetsBinding;
  /** Central Web API origin for unowned `/api/*` (default tuturuuu.com). */
  INTERNAL_WEB_API_ORIGIN?: string;
  /**
   * Comma-separated exact staging hosts (`tasks.tutur3u.com` or reviewed workers.dev hosts)
   * served at the root, set on the staging Worker only. Never derived from a
   * request.
   */
  TUTURUUU_STAGING_HOSTS?: string;
  /** Supabase origin for the report-only document policy's connect/img. */
  NEXT_PUBLIC_SUPABASE_URL?: string;
  /** Optional CSP report endpoint (must not log full query strings). */
  TTR_CSP_REPORT_URI?: string;
  /**
   * `enforce` enforces the bridge's script CSP. Anything else sends it
   * report-only (the D87 window before Bea's check and 24 h of clean reports).
   */
  TTR_CSP_TASKS?: string;
  /**
   * `enforce` adds `require-trusted-types-for 'script'` to the enforced CSP
   * (only meaningful with `TTR_CSP_TASKS=enforce`). Anything else keeps
   * Trusted Types report-only.
   */
  TTR_TRUSTED_TYPES_TASKS?: string;
}

export interface TasksExecutionContext {
  waitUntil(work: Promise<unknown>): void;
}

export type TasksBridgeHandler = (
  request: Request,
  env: TasksWorkerEnv,
  ctx: TasksExecutionContext
) => Promise<Response>;

/** The shared origin that serves Tasks under {@link TASKS_BASE_PATH}. */
export const TASKS_MOUNT_HOSTS = ['tuturuuu.com'] as const;

/** Tasks' mount on the shared origin: `https://tuturuuu.com/tasks`. */
export const TASKS_BASE_PATH = '/tasks';

/**
 * One artifact serves the subdomain root and the `tuturuuu.com/tasks` mount
 * (one-origin, D87). Fail-closed: unlisted hosts get 404, and the apex outside
 * `/tasks` is not Tasks'. Whether the apex is served at all is decided by
 * `TTR_ONE_ORIGIN_TASKS` in the bridge, and by the zone routes.
 */
export function tasksMounts(env: TasksWorkerEnv): AppMountConfig {
  const staging = (env.TUTURUUU_STAGING_HOSTS ?? '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter((host) => STAGING_HOST.test(host));
  return {
    app: 'tasks',
    rootHosts: [...TASKS_ROOT_HOSTS, ...staging],
    mountHosts: [...TASKS_MOUNT_HOSTS],
    basePath: TASKS_BASE_PATH,
    unknownHost: 'reject',
  };
}

/**
 * Every response this Worker serves is tagged `x-tuturuuu-runtime: native` so
 * the post-cutover watch can attribute traffic; nothing is persisted.
 */
const NATIVE = decideCohort({ percent: undefined, force: 'native' });

/** Only a read of a hashed asset or a public file keeps its own caching. */
function isStaticAssetRead(method: string, appPath: string) {
  return (
    (method === 'GET' || method === 'HEAD') &&
    (appPath.startsWith('/assets/') || PUBLIC_ASSETS.has(appPath))
  );
}

const FRAME_ANCESTORS = /^frame-ancestors(?:\s|$)/iu;

/** The Next build's one framable path (`createTuturuuuNextConfig`). */
const FRAMABLE =
  /^\/api\/v1\/workspaces\/[^/]+\/external-projects\/assets\/[^/]+\/webgl(?:\/|$)/u;

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
 * Production parity with the Next build (robots per the Tasks SEO policy,
 * anti-framing outside its framable WebGL path, HSTS) plus `nosniff` and a
 * referrer policy. Dynamic responses are personalized, so none is stored by any cache, whatever the handler set
 * (a handler's `private, max-age` would keep it in the browser); only reads of
 * hashed assets and public files keep theirs.
 */
const TRUSTED_TYPES_DIRECTIVE = "require-trusted-types-for 'script'";

function readVar(env: TasksWorkerEnv, name: keyof TasksWorkerEnv) {
  const value =
    env[name] ??
    (typeof process === 'undefined' ? undefined : process.env[name]);
  return typeof value === 'string' && value ? value : undefined;
}

function isHtml(response: Response) {
  return (response.headers.get('content-type') ?? '')
    .toLowerCase()
    .startsWith('text/html');
}

/**
 * Document security for every HTML response (pages, 404s, error and fallback
 * pages): the full policy report-only, including Trusted Types, and Trusted
 * Types enforced once `TTR_TRUSTED_TYPES_TASKS=enforce` (D87 A1).
 */
function secureDocument(
  response: Response,
  request: Request,
  env: TasksWorkerEnv,
  framable: boolean
): Response {
  if (response.status === 101 || !isHtml(response)) return response;
  const supabase = readVar(env, 'NEXT_PUBLIC_SUPABASE_URL');
  const profile: AppSecurityProfile = {
    basePath: TASKS_BASE_PATH,
    connect: originSources(supabase, true),
    img: [...originSources(supabase), 'https:'],
    permissions: DEFAULT_PERMISSIONS,
  };
  const secured = applyDocumentSecurityHeaders(response, profile, {
    requestOrigin: new URL(request.url).origin,
    sharedOrigin: `https://${TASKS_MOUNT_HOSTS[0]}`,
    reportUri: readVar(env, 'TTR_CSP_REPORT_URI'),
  });
  // A framable path's upstream policy (e.g. the WebGL sandbox) stays enforced.
  if (framable) return secured;
  if (readVar(env, 'TTR_CSP_TASKS') !== 'enforce') {
    // Report-only window: the script policy moves to its own report-only
    // header; framing is still enforced by `decorate`.
    const policy = secured.headers.get('Content-Security-Policy');
    if (!policy) return secured;
    const result = new Response(secured.body, secured);
    result.headers.delete('Content-Security-Policy');
    result.headers.append('Content-Security-Policy-Report-Only', policy);
    return result;
  }
  if (readVar(env, 'TTR_TRUSTED_TYPES_TASKS') !== 'enforce') return secured;
  const policy = secured.headers.get('Content-Security-Policy');
  if (policy?.includes(TRUSTED_TYPES_DIRECTIVE)) return secured;
  const result = new Response(secured.body, secured);
  result.headers.set(
    'Content-Security-Policy',
    policy ? `${policy}; ${TRUSTED_TYPES_DIRECTIVE}` : TRUSTED_TYPES_DIRECTIVE
  );
  return result;
}

function decorate(
  response: Response,
  appPath: string | null,
  method: string,
  document?: { request: Request; env: TasksWorkerEnv }
) {
  const tagged = tagResponse(
    document
      ? secureDocument(
          response,
          document.request,
          document.env,
          appPath !== null && FRAMABLE.test(appPath)
        )
      : response,
    NATIVE
  );
  const { headers } = tagged;
  headers.set('X-Robots-Tag', PRIVATE_ROBOTS_HEADER);
  if (appPath === null || !FRAMABLE.test(appPath)) {
    headers.set(
      'Content-Security-Policy',
      denyFraming(headers.get('Content-Security-Policy'))
    );
    headers.set('X-Frame-Options', 'DENY');
  }
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Strict-Transport-Security', 'max-age=63072000');
  if (appPath === null || !isStaticAssetRead(method, appPath))
    headers.set('Cache-Control', 'private, no-store, max-age=0');
  return tagged;
}

/**
 * The Worker's outer request step around the bridge: drop client-sent page
 * rewrites, admit only the configured hosts (an unlisted host, including the
 * apex, is a 404 before anything else runs), answer build-info, then decorate.
 * `createBridge` receives the admitted mounts so the bridge agrees with this
 * gate; bridges are reused per distinct staging-host set.
 */
export function createTasksRequestHandler(
  createBridge: (mounts: AppMountConfig) => TasksBridgeHandler
) {
  const bridges = new Map<string, TasksBridgeHandler>();
  return async function handleTasksRequest(
    incoming: Request,
    env: TasksWorkerEnv,
    ctx: TasksExecutionContext
  ): Promise<Response> {
    // Only the proxy may name a page rewrite.
    const request = withoutPageRewrite(incoming);
    const url = new URL(request.url);
    const mounts = tasksMounts(env);
    const mount = resolveAppBase(url, mounts);
    if (!mount)
      return decorate(
        new Response('Not Found', { status: 404 }),
        null,
        request.method
      );
    const appPath = url.pathname.slice(mount.basePath.length) || '/';
    const buildInfo =
      appPath === '/api/build-info'
        ? workerBuildInfo(
            new Request(new URL(appPath, url), { method: request.method }),
            'tasks'
          )
        : null;
    if (buildInfo) return decorate(buildInfo, appPath, request.method);
    const key = [
      mounts.rootHosts.join(','),
      (mounts.mountHosts ?? []).join(','),
      mounts.basePath ?? '',
    ].join('|');
    let bridge = bridges.get(key);
    if (!bridge) {
      bridge = createBridge(mounts);
      bridges.set(key, bridge);
    }
    return decorate(await bridge(request, env, ctx), appPath, request.method, {
      request,
      env,
    });
  };
}

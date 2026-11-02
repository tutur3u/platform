import { decideCohort, tagResponse } from '@tuturuuu/start-bridge/canary';
import {
  type AppMountConfig,
  resolveAppBase,
} from '@tuturuuu/start-bridge/mounts';
import type { AssetsBinding } from '@tuturuuu/start-bridge/start/handler';
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
   * Comma-separated staging hostnames (`*.workers.dev` or `*.staging.tutur3u.com`)
   * served at the root, set on the staging Worker only. Never derived from a
   * request.
   */
  TUTURUUU_STAGING_HOSTS?: string;
}

export interface TasksExecutionContext {
  waitUntil(work: Promise<unknown>): void;
}

export type TasksBridgeHandler = (
  request: Request,
  env: TasksWorkerEnv,
  ctx: TasksExecutionContext
) => Promise<Response>;

/** Root-only and fail-closed: no apex mount, unlisted hosts get 404. */
export function tasksMounts(env: TasksWorkerEnv): AppMountConfig {
  const staging = (env.TUTURUUU_STAGING_HOSTS ?? '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter((host) => STAGING_HOST.test(host));
  return {
    app: 'tasks',
    rootHosts: [...TASKS_ROOT_HOSTS, ...staging],
    mountHosts: [],
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
function decorate(response: Response, appPath: string | null, method: string) {
  const tagged = tagResponse(response, NATIVE);
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
    const key = mounts.rootHosts.join(',');
    let bridge = bridges.get(key);
    if (!bridge) {
      bridge = createBridge(mounts);
      bridges.set(key, bridge);
    }
    return decorate(await bridge(request, env, ctx), appPath, request.method);
  };
}

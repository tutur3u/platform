import { decideCohort, tagResponse } from '@tuturuuu/start-bridge/canary';
import {
  type AppMountConfig,
  resolveAppBase,
} from '@tuturuuu/start-bridge/mounts';
import type { AssetsBinding } from '@tuturuuu/start-bridge/start/handler';
import {
  buildPermissionsPolicy,
  DEFAULT_PERMISSIONS,
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
/**
 * Trusted Types for the target policy: script sinks need Trusted Types, and
 * only DOMPurify's policy may be created (no duplicates). The report-only
 * window reveals any other policy name before enforcement.
 */
const TRUSTED_TYPES_DIRECTIVES =
  "require-trusted-types-for 'script'; trusted-types dompurify";

/** Same-origin CSP report collector, relative to the app base. */
export const CSP_REPORT_PATH = '/api/csp-report';

const MAX_REPORT_BYTES = 16 * 1024;
const REPORT_LOG_BUDGET = 50;
let reportLogWindow = { start: 0, count: 0 };

const CSP_DIRECTIVES = new Set([
  'base-uri',
  'child-src',
  'connect-src',
  'default-src',
  'font-src',
  'form-action',
  'frame-ancestors',
  'frame-src',
  'img-src',
  'manifest-src',
  'media-src',
  'object-src',
  'require-trusted-types-for',
  'sandbox',
  'script-src',
  'script-src-attr',
  'script-src-elem',
  'style-src',
  'style-src-attr',
  'style-src-elem',
  'trusted-types',
  'upgrade-insecure-requests',
  'worker-src',
]);

function sanitizeViolation(raw: Record<string, unknown>) {
  const directive =
    raw['effective-directive'] ??
    raw.effectiveDirective ??
    raw['violated-directive'];
  return {
    effectiveDirective:
      typeof directive === 'string' && CSP_DIRECTIVES.has(directive)
        ? directive
        : 'unknown',
    disposition: raw.disposition === 'enforce' ? 'enforce' : 'report',
  };
}

/** The body as text, or `null` once it passes `cap` bytes (stream cancelled). */
async function readCapped(
  request: Request,
  cap: number
): Promise<string | null> {
  const reader = request.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > cap) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/**
 * The Tasks CSP report collector (`<base>/api/csp-report`): accepts
 * `report-uri` and Reporting API bodies (read with a 16 KB cap), logs at most
 * a fixed budget per
 * minute per isolate with query strings and fragments stripped, never echoes
 * anything, and always answers 204.
 */
export async function collectCspReport(request: Request): Promise<Response> {
  const done = () => new Response(null, { status: 204 });
  if (request.method !== 'POST') {
    return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  }
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_REPORT_BYTES) return done();
  let body: unknown;
  try {
    // Chunked bodies carry no Content-Length: stop reading past the cap.
    const text = await readCapped(request, MAX_REPORT_BYTES);
    if (text === null) return done();
    body = JSON.parse(text);
  } catch {
    return done();
  }
  const entries = Array.isArray(body)
    ? body
        .filter((entry) => entry && typeof entry === 'object')
        .map((entry) => (entry as { body?: unknown }).body)
    : [(body as { 'csp-report'?: unknown } | null)?.['csp-report']];
  const now = Date.now();
  if (now - reportLogWindow.start > 60_000)
    reportLogWindow = { start: now, count: 0 };
  for (const entry of entries.slice(0, 10)) {
    if (!entry || typeof entry !== 'object') continue;
    if (reportLogWindow.count >= REPORT_LOG_BUDGET) break;
    reportLogWindow.count += 1;
    console.warn(
      'tasks csp violation',
      sanitizeViolation(entry as Record<string, unknown>)
    );
  }
  return done();
}

function readVar(env: TasksWorkerEnv, name: keyof TasksWorkerEnv) {
  const value =
    env[name] ??
    (typeof process === 'undefined' ? undefined : process.env[name]);
  return typeof value === 'string' ? value.trim() : undefined;
}

/** `enforce` (any case, trimmed) switches a policy on; anything else is report-only. */
function isEnforced(env: TasksWorkerEnv, name: keyof TasksWorkerEnv) {
  return readVar(env, name)?.toLowerCase() === 'enforce';
}

function isHtml(response: Response) {
  return (response.headers.get('content-type') ?? '')
    .toLowerCase()
    .startsWith('text/html');
}

/**
 * Document security for Tasks' own HTML (pages, 404s, error and fallback
 * pages), staged by env (D87 A1):
 * - the report-only header always carries the exact target policy (the
 *   bridge's nonce script policy plus Trusted Types) and reports it to
 *   `<base>/api/csp-report`;
 * - `TTR_CSP_TASKS=enforce` enforces the script policy, and with it
 *   `TTR_TRUSTED_TYPES_TASKS=enforce` enforces Trusted Types too;
 * - framing stays enforced in every stage (`decorate`).
 * `/api` responses (including HTML forwarded from Web) and framable paths
 * keep whatever policy they carry.
 */
function secureDocument(
  response: Response,
  appPath: string,
  basePath: string,
  env: TasksWorkerEnv
): Response {
  if (response.status === 101 || !isHtml(response)) return response;
  if (appPath === '/api' || appPath.startsWith('/api/')) return response;
  if (FRAMABLE.test(appPath)) return response;
  const scriptPolicy = response.headers.get('Content-Security-Policy');
  if (!scriptPolicy) return response;
  const reportUri = `${basePath}${CSP_REPORT_PATH}`;
  const target = `${scriptPolicy}; ${TRUSTED_TYPES_DIRECTIVES}`;
  const reporting = `report-uri ${reportUri}; report-to csp`;
  const result = new Response(response.body, response);
  const headers = result.headers;
  headers.set('Reporting-Endpoints', `csp="${reportUri}"`);
  headers.set(
    'Permissions-Policy',
    buildPermissionsPolicy(DEFAULT_PERMISSIONS)
  );
  const cspEnforced = isEnforced(env, 'TTR_CSP_TASKS');
  const ttEnforced = cspEnforced && isEnforced(env, 'TTR_TRUSTED_TYPES_TASKS');
  if (!cspEnforced) headers.delete('Content-Security-Policy');
  else
    headers.set(
      'Content-Security-Policy',
      `${ttEnforced ? target : scriptPolicy}; ${reporting}`
    );
  if (!ttEnforced)
    headers.set(
      'Content-Security-Policy-Report-Only',
      `${target}; ${reporting}`
    );
  else headers.delete('Content-Security-Policy-Report-Only');
  return result;
}

function decorate(
  response: Response,
  appPath: string | null,
  method: string,
  document?: { basePath: string; env: TasksWorkerEnv }
) {
  const tagged = tagResponse(
    document && appPath !== null
      ? secureDocument(response, appPath, document.basePath, document.env)
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
    if (appPath === CSP_REPORT_PATH)
      return decorate(await collectCspReport(request), appPath, request.method);
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
      basePath: mount.basePath,
      env,
    });
  };
}

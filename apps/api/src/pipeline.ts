import { enforceAuthorization } from './authorization';
import { readJsonBody } from './body';
import type {
  ApiEnv,
  Endpoint,
  ExecutionContext,
  Principal,
  RequestMetric,
  SecurityAdapter,
} from './contracts';
import { ApiError, encodeError } from './errors';
import { forwardToRetainedOrigin } from './forward';
import { matchPath, validateRegistry } from './registry';

export interface PipelineOptions {
  endpoints: readonly Endpoint[];
  retained: readonly { path: string }[];
  security?: SecurityAdapter;
  fetcher?: (request: Request) => Promise<Response>;
  metric?: (metric: RequestMetric) => void;
}

function canonicalPath(request: Request): string {
  const path = new URL(request.url).pathname;
  if (/\/{2}|\\|%2f|%5c|%00/i.test(path))
    throw new ApiError('bad_request', 400, 'Invalid request path');
  try {
    decodeURIComponent(path);
  } catch {
    throw new ApiError('bad_request', 400, 'Malformed request path');
  }
  return path.length > 1 ? path.replace(/\/$/, '') : path;
}

function allowedOrigin(request: Request, env: ApiEnv): string | null {
  const origin = request.headers.get('origin');
  if (!origin) return null;
  const ownOrigin = new URL(request.url).origin;
  const allowed = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (origin !== ownOrigin && !allowed.includes(origin))
    throw new ApiError('forbidden', 403, 'Origin is not allowed');
  return origin;
}

function validateCookieSyntax(request: Request): void {
  const cookie = request.headers.get('cookie');
  if (!cookie) return;
  if (cookie.length > 32_768)
    throw new ApiError('bad_request', 400, 'Malformed cookies');
  try {
    decodeURIComponent(cookie);
  } catch {
    throw new ApiError('bad_request', 400, 'Malformed cookies');
  }
}

async function withDeadline<T>(
  request: Request,
  deadlineMs: number,
  run: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const controller = new AbortController();
  const signal = AbortSignal.any([request.signal, controller.signal]);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(
        new ApiError('deadline_exceeded', 504, 'Request deadline exceeded')
      );
    }, deadlineMs);
  });
  try {
    return await Promise.race([run(signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function queryValues(request: Request): Record<string, string> {
  const query: Record<string, string> = {};
  for (const [key, value] of new URL(request.url).searchParams) {
    if (Object.hasOwn(query, key))
      throw new ApiError('bad_request', 400, 'Duplicate query parameter');
    Object.defineProperty(query, key, { value, enumerable: true });
  }
  return query;
}

export function createApi(options: PipelineOptions) {
  validateRegistry(options.endpoints);
  return async (
    request: Request,
    env: ApiEnv,
    execution: ExecutionContext
  ): Promise<Response> => {
    const requestId = crypto.randomUUID();
    const started = performance.now();
    let operationId = 'unmatched';
    let runtime: RequestMetric['runtime'] = 'worker';
    let encoding: 'canonical' | 'legacy-error' | 'legacy-message' = 'canonical';
    let origin: string | null = null;
    let response: Response;
    try {
      const pathname = canonicalPath(request);
      const enabled = new Set(
        (env.API_WORKER_OPERATIONS ?? '').split(',').filter(Boolean)
      );
      if (
        [...enabled].some(
          (id) =>
            !options.endpoints.some((endpoint) => endpoint.operationId === id)
        )
      )
        throw new ApiError('unavailable', 503, 'Unknown enabled operation');
      const matches = options.endpoints.flatMap((endpoint) =>
        [
          { path: endpoint.path, errorEncoding: 'canonical' as const },
          ...endpoint.aliases,
        ].flatMap((alias) => {
          const params = matchPath(alias.path, pathname);
          return params
            ? [{ endpoint, params, encoding: alias.errorEncoding }]
            : [];
        })
      );
      const method = request.method === 'HEAD' ? 'GET' : request.method;
      const match = matches.find(({ endpoint }) => endpoint.method === method);
      const selected = match
        ? enabled.has(match.endpoint.operationId)
        : matches.some(({ endpoint }) => enabled.has(endpoint.operationId));
      if (!matches.length || !selected) {
        if (!options.retained.some((route) => matchPath(route.path, pathname)))
          throw new ApiError('not_found', 404, 'Route not found');
        runtime = 'retained-next';
        operationId = 'retainedOrigin';
        response = await withDeadline(request, 30_000, (signal) =>
          forwardToRetainedOrigin(
            request,
            env,
            signal,
            options.fetcher ?? fetch
          )
        );
      } else {
        origin = allowedOrigin(request, env);
        validateCookieSyntax(request);
        const allow = [
          ...new Set(
            matches.flatMap(({ endpoint }) =>
              endpoint.method === 'GET' ? ['GET', 'HEAD'] : [endpoint.method]
            )
          ),
          'OPTIONS',
        ].join(', ');
        if (request.method === 'OPTIONS') {
          const requested = request.headers.get(
            'access-control-request-method'
          );
          if (requested && !allow.split(', ').includes(requested))
            throw new ApiError('method_not_allowed', 405, 'Method not allowed');
          const headers = request.headers.get('access-control-request-headers');
          if (
            headers
              ?.split(',')
              .some(
                (header) =>
                  ![
                    'content-type',
                    'authorization',
                    'x-csrf-token',
                    'idempotency-key',
                  ].includes(header.trim().toLowerCase())
              )
          )
            throw new ApiError(
              'forbidden',
              403,
              'Request headers are not allowed'
            );
          response = new Response(null, {
            status: 204,
            headers: {
              allow,
              'access-control-allow-methods': allow,
              'access-control-allow-headers':
                'content-type, authorization, x-csrf-token, idempotency-key',
              'cache-control': 'no-store',
            },
          });
        } else if (!match) {
          response = encodeError(
            new ApiError('method_not_allowed', 405, 'Method not allowed'),
            requestId
          );
          response.headers.set('allow', allow);
        } else {
          const { endpoint, params } = match;
          operationId = endpoint.operationId;
          encoding = match.encoding;
          response = await withDeadline(
            request,
            endpoint.limits.deadlineMs,
            async (signal) => {
              const declaredLength = request.headers.get('content-length');
              if (
                declaredLength &&
                (!/^\d+$/.test(declaredLength) ||
                  Number(declaredLength) > endpoint.limits.bodyBytes)
              )
                throw new ApiError(
                  'payload_too_large',
                  413,
                  'Request body is too large'
                );
              if (endpoint.body === 'none' && request.body)
                throw new ApiError(
                  'payload_too_large',
                  413,
                  'Request body is not allowed'
                );
              let principal: Principal = { kind: 'public' };
              if (endpoint.guard === 'web-api') {
                const security = options.security;
                if (!security)
                  throw new ApiError(
                    'unavailable',
                    503,
                    'Security adapter is not installed'
                  );
                await security.guard(request, endpoint, signal);
                principal = await security.resolvePrincipal(
                  request,
                  endpoint.policy,
                  signal
                );
                if (
                  !['GET', 'HEAD'].includes(request.method) &&
                  request.headers.has('cookie') &&
                  (principal.kind !== 'user' ||
                    principal.authentication === 'cookie')
                ) {
                  const sourceOrigin = request.headers.get('origin');
                  if (sourceOrigin !== new URL(request.url).origin)
                    throw new ApiError(
                      'forbidden',
                      403,
                      'Same-origin request required'
                    );
                }
                const evidence = await security.authorize(
                  principal,
                  endpoint.policy,
                  params,
                  signal
                );
                enforceAuthorization(
                  principal,
                  endpoint.policy,
                  params,
                  evidence
                );
              } else if (endpoint.policy.kind !== 'public')
                throw new ApiError('forbidden', 403, 'Invalid metadata policy');
              const body =
                endpoint.body === 'json'
                  ? await readJsonBody(
                      request,
                      endpoint.limits.bodyBytes,
                      signal
                    )
                  : null;
              return endpoint.execute(
                { params, query: queryValues(request), body },
                {
                  request,
                  requestId,
                  params,
                  principal,
                  signal,
                  env,
                  execution,
                }
              );
            }
          );
        }
      }
    } catch (error) {
      response = encodeError(
        error instanceof ApiError
          ? error
          : new ApiError('internal_error', 500, 'Internal error'),
        requestId,
        encoding
      );
    }
    const headers = new Headers(response.headers);
    headers.set('x-request-id', requestId);
    if (origin) {
      headers.set('access-control-allow-origin', origin);
      headers.set('access-control-allow-credentials', 'true');
      headers.append('vary', 'Origin');
    }
    const metric = {
      requestId,
      operationId,
      status: response.status,
      durationMs: Math.round(performance.now() - started),
      runtime,
    };
    // Only allowlisted metadata reaches logs; paths, identities, bodies and credentials never do.
    if (response.status >= 500) console.error('api.request', metric);
    else if (response.status >= 400) console.warn('api.request', metric);
    else console.info('api.request', metric);
    try {
      options.metric?.(metric);
    } catch {
      console.warn('api.metric_failed', { requestId });
    }
    return new Response(request.method === 'HEAD' ? null : response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}

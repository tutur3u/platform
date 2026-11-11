import { normalizeRequestHost } from '@tuturuuu/utils/workspace-domain-hostnames';
import { renderToReadableStream } from 'react-dom/server';
import {
  HTML_CONTENT_TYPE,
  landingPageHtml,
  notFoundHtml,
  securityHeaders,
  TEXT_CONTENT_TYPE,
} from './html';
import {
  type CacheLike,
  EDGE_SECRET_HEADER,
  EDGE_USER_AGENT,
  type Env,
  RESOLVE_CACHE_SECONDS,
  type ResolvedWorkspace,
  resolveHost,
  resolveOrigin,
} from './resolve';
import {
  type DeliveryPayload,
  isDeliveryPayload,
  SiteDocument,
  selectSitePage,
} from './site';

export type { Env } from './resolve';

export interface HandlerDeps {
  cache: () => CacheLike | null | Promise<CacheLike | null>;
}

interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void;
}

const SITE_CACHE_ORIGIN = 'https://workspace-domains-site.cache.invalid';
const PAGE_CACHE_CONTROL = `public, max-age=${RESOLVE_CACHE_SECONDS}`;

function respond(
  body: BodyInit | null,
  status: number,
  contentType: string,
  method: string,
  extra?: Record<string, string>
): Response {
  const headers = securityHeaders(contentType);
  for (const [name, value] of Object.entries(extra ?? {})) {
    headers.set(name, value);
  }
  return new Response(method === 'HEAD' ? null : body, { headers, status });
}

/**
 * Published site content from apps/web's edge-only site endpoint. Only
 * resolver-backed hosts have one; static bootstrap hosts get the landing page.
 */
async function loadSite(
  host: string,
  workspace: ResolvedWorkspace,
  env: Env,
  cache: CacheLike | null,
  waitUntil: (promise: Promise<unknown>) => void
): Promise<DeliveryPayload | null> {
  const secret = env.WORKSPACE_DOMAINS_EDGE_SECRET;
  if (!secret || workspace.source !== 'resolver' || !workspace.siteAvailable) {
    return null;
  }
  const key = new Request(
    `${SITE_CACHE_ORIGIN}/site?host=${encodeURIComponent(host)}`
  );
  const cached = await cache?.match(key).catch(() => undefined);
  if (cached) {
    const body = await cached.json().catch(() => null);
    return isDeliveryPayload(body) ? body : null;
  }

  let response: Response;
  try {
    response = await fetch(
      `${resolveOrigin(env)}/api/v1/workspace-domains/site?host=${encodeURIComponent(host)}`,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': EDGE_USER_AGENT,
          [EDGE_SECRET_HEADER]: secret,
        },
        redirect: 'manual',
      }
    );
  } catch {
    return null;
  }
  // Failures fall back to the landing page without caching.
  if (response.status !== 200 && response.status !== 404) return null;
  const body = response.ok ? await response.json().catch(() => null) : null;
  const payload = isDeliveryPayload(body) ? body : null;
  if (cache) {
    waitUntil(
      cache
        .put(
          key,
          new Response(JSON.stringify(payload), {
            headers: {
              'Cache-Control': `max-age=${RESOLVE_CACHE_SECONDS}`,
              'Content-Type': 'application/json',
            },
          })
        )
        .catch(() => undefined)
    );
  }
  return payload;
}

/** Builds the fetch handler; tests inject the cache, production uses caches.default. */
export function createHandler(deps: HandlerDeps) {
  return async function handle(
    request: Request,
    env: Env,
    ctx?: ExecutionContextLike
  ): Promise<Response> {
    const waitUntil = (promise: Promise<unknown>) => {
      if (ctx) ctx.waitUntil(promise);
      else void promise;
    };
    const method = request.method.toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
      return respond('Method Not Allowed', 405, TEXT_CONTENT_TYPE, method, {
        Allow: 'GET, HEAD',
      });
    }

    const url = new URL(request.url);
    if (url.pathname === '/__health') {
      return respond('ok', 200, TEXT_CONTENT_TYPE, method, {
        'Cache-Control': 'no-store',
      });
    }

    const host = normalizeRequestHost(request.headers.get('host') ?? url.host);
    if (!host) {
      return respond(notFoundHtml(), 404, HTML_CONTENT_TYPE, method);
    }

    const cache = await Promise.resolve(deps.cache()).catch(() => null);
    const workspace = await resolveHost(host, env, cache, waitUntil);
    if (!workspace) {
      return respond(notFoundHtml(), 404, HTML_CONTENT_TYPE, method, {
        'Cache-Control': 'no-store',
      });
    }

    if (url.pathname === '/robots.txt') {
      return respond(
        `User-agent: *\nAllow: /\n`,
        200,
        TEXT_CONTENT_TYPE,
        method,
        { 'Cache-Control': PAGE_CACHE_CONTROL }
      );
    }

    const payload = await loadSite(host, workspace, env, cache, waitUntil);
    if (!payload) {
      if (url.pathname !== '/') {
        return respond(notFoundHtml(), 404, HTML_CONTENT_TYPE, method, {
          'Cache-Control': PAGE_CACHE_CONTROL,
        });
      }
      return respond(
        landingPageHtml(workspace),
        200,
        HTML_CONTENT_TYPE,
        method,
        { 'Cache-Control': PAGE_CACHE_CONTROL }
      );
    }

    const page = selectSitePage(payload, url.pathname);
    if (!page) {
      return respond(notFoundHtml(), 404, HTML_CONTENT_TYPE, method, {
        'Cache-Control': PAGE_CACHE_CONTROL,
      });
    }

    const stream = await renderToReadableStream(
      <SiteDocument page={page} payload={payload} workspace={workspace} />
    );
    if (method === 'HEAD') await stream.cancel();
    else await stream.allReady;
    return respond(stream, 200, HTML_CONTENT_TYPE, method, {
      'Cache-Control': PAGE_CACHE_CONTROL,
    });
  };
}

const handle = createHandler({
  cache: () =>
    (globalThis as { caches?: { default?: CacheLike } }).caches?.default ??
    null,
});

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContextLike) {
    return handle(request, env, ctx);
  },
};

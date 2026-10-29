import {
  getAuthCookieName,
  stripAuthCookiePrefix,
} from '@tuturuuu/supabase/next/common';
import { getLaunchableAppByTitle } from '@tuturuuu/utils/launchable-apps';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  buildGatewayRedirectUrl,
  getGatewayApp,
} from '../src/lib/apps-registry';
import {
  CatalogueEntry,
  type CatalogueLocale,
  catalogueMessages,
} from '../src/portable/catalogue-entry';

type Assets = { fetch(request: Request): Promise<Response> };
export type GatewayEnvironment = { ASSETS: Assets; SOURCE_SHA?: string };
const originalOrigin = 'https://apps.tuturuuu.com';
const sessionCookies = new Set(
  [
    'tuturuuu_app_session',
    'tuturuuu_web_app_session',
    'tuturuuu_app_session_refresh',
    'tuturuuu_web_app_session_refresh',
  ].map(getAuthCookieName)
);

function headers() {
  return new Headers({
    'Cache-Control': 'private, no-store, max-age=0',
    Vary: 'Cookie, Authorization, Accept-Language',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy':
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Robots-Tag': 'noindex, nofollow',
  });
}
function response(status: number, body: string, extra?: HeadersInit) {
  const result = headers();
  new Headers(extra).forEach((value, key) => {
    result.set(key, value);
  });
  return new Response(body, { status, headers: result });
}
function authenticatedEntry(request: Request) {
  if (request.headers.has('authorization')) return true;
  return (request.headers.get('cookie') ?? '').split(';').some((part) => {
    const name = part.trim().split('=', 1)[0] ?? '';
    return (
      sessionCookies.has(name) ||
      /^sb-.+-auth-token(?:\.\d+)?$/.test(stripAuthCookiePrefix(name) ?? '')
    );
  });
}
function cookieLocale(request: Request): CatalogueLocale {
  const cookie = (request.headers.get('cookie') ?? '')
    .split(';')
    .find((part) => part.trim().startsWith('NEXT_LOCALE='));
  const saved = cookie?.trim().slice('NEXT_LOCALE='.length);
  if (saved === 'en' || saved === 'vi') return saved;
  return /^vi(?:\b|[-,;])/i.test(request.headers.get('accept-language') ?? '')
    ? 'vi'
    : 'en';
}
function escapeAttribute(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character] ?? character;
  });
}

/** Staging-only entry. It never implements or proxies authenticated app APIs. */
async function handleGatewayRequest(request: Request, env: GatewayEnvironment) {
  const url = new URL(request.url);
  if (url.hostname === 'apps.tuturuuu.com')
    return response(503, 'Staging gateway only');
  if (!['GET', 'HEAD'].includes(request.method))
    return response(405, 'Method not allowed', { Allow: 'GET, HEAD' });
  if (url.pathname === '/api/build-info')
    return response(
      200,
      JSON.stringify({
        app: 'apps',
        runtime: 'vite-cloudflare-staging',
        sourceSha: env.SOURCE_SHA ?? null,
        fullAppPort: false,
      }),
      { 'Content-Type': 'application/json' }
    );
  if (url.pathname.startsWith('/api/')) return response(404, 'Not found');
  if (
    url.pathname.startsWith('/assets/') ||
    ['/favicon.ico', '/site.webmanifest', '/theme-bootstrap.js'].includes(
      url.pathname
    )
  )
    return env.ASSETS.fetch(request);
  if (authenticatedEntry(request)) {
    const fallback = new URL(originalOrigin);
    fallback.pathname = url.pathname;
    fallback.search = url.search;
    return response(307, '', { Location: fallback.toString() });
  }

  let path: string[];
  try {
    path = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    return response(400, 'Invalid path');
  }
  const first = path[0];
  if (first === 'en' || first === 'vi') {
    const canonical = new URL(url);
    canonical.pathname = `/${url.pathname.split('/').filter(Boolean).slice(1).join('/')}`;
    return response(307, '', {
      Location: canonical.toString(),
      'Set-Cookie': `NEXT_LOCALE=${first}; Path=/; Max-Age=31536000; SameSite=Lax${url.protocol === 'https:' ? '; Secure' : ''}`,
    });
  }
  if (first) {
    const app = getGatewayApp(first) ?? getLaunchableAppByTitle(first);
    if (!app) return response(404, 'Not found');
    const searchParams = Object.fromEntries(
      [...new Set(url.searchParams.keys())].map((key) => [
        key,
        url.searchParams.getAll(key),
      ])
    );
    const destination = buildGatewayRedirectUrl({
      app,
      path: path.slice(1),
      searchParams,
    });
    // A staging build must never redirect a visitor to a developer's localhost.
    if (new URL(destination).origin !== new URL(app.productionUrl).origin)
      return response(503, 'Gateway build environment unavailable');
    return response(307, '', { Location: destination });
  }
  const locale = cookieLocale(request);
  let template: Response;
  try {
    template = await env.ASSETS.fetch(new Request(new URL('/index.html', url)));
  } catch {
    return response(503, 'Catalogue assets unavailable');
  }
  if (!template.ok) return response(503, 'Catalogue assets unavailable');
  const templateHtml = await template.text();
  if (
    !templateHtml.includes('<div id="root"></div>') ||
    !templateHtml.includes('<!--gateway-metadata-->')
  )
    return response(503, 'Catalogue template unavailable');
  const markup = renderToStaticMarkup(
    createElement(CatalogueEntry, { locale })
  );
  const copy = catalogueMessages[locale].appsGateway.metadata;
  const html = templateHtml
    .replace('<html lang="en">', `<html lang="${locale}">`)
    .replace(
      '<title>Tuturuuu Apps</title>',
      `<title>${escapeAttribute(copy.title)}</title>`
    )
    .replace(
      '<!--gateway-metadata-->',
      `<meta name="description" content="${escapeAttribute(copy.description)}" />`
    )
    .replace('<div id="root"></div>', `<div id="root">${markup}</div>`);
  return response(200, request.method === 'HEAD' ? '' : html, {
    'Content-Type': 'text/html; charset=utf-8',
  });
}

export async function gatewayRequest(
  request: Request,
  env: GatewayEnvironment
) {
  const result = await handleGatewayRequest(request, env);
  return request.method === 'HEAD'
    ? new Response(null, { status: result.status, headers: result.headers })
    : result;
}

export default { fetch: gatewayRequest };

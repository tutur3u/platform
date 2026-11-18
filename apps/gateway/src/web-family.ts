import { HOP_HEADER, isClientForwardingHeader } from './forwarding-headers';
import { type Manifest, splitLocale, type WebFamily } from './manifest';
import type { Env, ServiceBinding } from './worker';

/**
 * Security headers the live Vercel responses carry and a family Worker does
 * not emit on its own. Captured from `https://tuturuuu.com/api/health` and
 * `https://tuturuuu.com/personal` on 2026-11-18. They only fill gaps: a header
 * the family sends (CSP, X-Frame-Options, a route-specific Referrer-Policy)
 * is never overridden. The live responses carry no Permissions-Policy, so the
 * gateway adds none.
 */
export const FAMILY_PARITY_HEADERS: Readonly<Record<string, string>> = {
  'strict-transport-security': 'max-age=63072000',
  'referrer-policy': 'same-origin',
};

const BINDING_PATTERN = /^WEB_FAMILY_[A-Z0-9_]+$/u;

export interface WebFamilyTarget {
  id: string;
  binding: ServiceBinding;
  /** Path the family Worker receives (asset prefix removed). */
  path: string;
}

/** True when `pathname` is `entry` or lies below it. */
export function inSubtree(pathname: string, entry: string) {
  const base = entry.endsWith('/') ? entry.slice(0, -1) : entry;
  return pathname === base || pathname.startsWith(`${base}/`);
}

/**
 * Percent-encoded, doubled or backslashed paths can resolve to a different
 * route inside the app than the gateway matched, so they stay on WEB_ORIGIN.
 */
function isCanonicalPath(pathname: string) {
  return !/%|\/\/|\\/u.test(pathname);
}

function flaggedFamilies(env: Env) {
  return new Set(
    (env.GATEWAY_WEB_FAMILIES ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
  );
}

function matchesFamilyPath(family: WebFamily, pathname: string) {
  if (family.exclude.some((entry) => inSubtree(pathname, entry))) return false;
  return (
    family.exact.includes(pathname) ||
    family.prefix.some((prefix) => pathname.startsWith(prefix))
  );
}

/** The path a family serves for `pathname`, or null when it does not own it. */
export function matchFamily(
  pathname: string,
  family: WebFamily,
  locales: string[]
): string | null {
  if (family.assetPrefix && pathname.startsWith(`${family.assetPrefix}/`)) {
    return pathname.slice(family.assetPrefix.length);
  }
  if (matchesFamilyPath(family, pathname)) return pathname;
  if (family.localized) {
    const split = splitLocale(pathname, locales);
    if (split.locale && matchesFamilyPath(family, split.pathname)) {
      return pathname;
    }
  }
  return null;
}

/**
 * The family Worker that serves this request, or null for WEB_ORIGIN. Only
 * PUBLIC_HOST requests on canonical paths qualify; the global deny list wins
 * over every family; a family must be both flagged and bound.
 */
export function webFamilyTarget(
  request: Request,
  env: Env,
  manifest: Manifest
): WebFamilyTarget | null {
  const config = manifest.webFamilies;
  if (!config) return null;
  const url = new URL(request.url);
  if (!env.PUBLIC_HOST || url.host !== env.PUBLIC_HOST) return null;
  const { pathname } = url;
  if (!isCanonicalPath(pathname)) return null;
  if (config.deny.some((entry) => inSubtree(pathname, entry))) return null;
  const flagged = flaggedFamilies(env);
  if (flagged.size === 0) return null;
  for (const family of config.families) {
    if (!flagged.has(family.id)) continue;
    const path = matchFamily(pathname, family, manifest.locales);
    if (path === null) continue;
    if (!BINDING_PATTERN.test(family.binding)) return null;
    const binding = (env as unknown as Record<string, unknown>)[family.binding];
    if (
      !binding ||
      typeof (binding as Partial<ServiceBinding>).fetch !== 'function'
    ) {
      // Flagged without a binding: today's behavior, never an error.
      return null;
    }
    return { id: family.id, binding: binding as ServiceBinding, path };
  }
  return null;
}

/**
 * The request a family Worker receives: same method, body, redirect mode and
 * query; client forwarding headers removed; the public host and scheme stated
 * by the gateway. Cookies, authorization and `cf-connecting-ip` pass through.
 */
export function familyRequest(
  request: Request,
  path: string,
  publicHost: string
) {
  const target = new URL(request.url);
  target.pathname = path;
  const outgoing = new Request(target, request);
  for (const name of [...outgoing.headers.keys()]) {
    if (isClientForwardingHeader(name)) outgoing.headers.delete(name);
  }
  outgoing.headers.set('x-forwarded-host', publicHost);
  outgoing.headers.set('x-forwarded-proto', 'https');
  outgoing.headers.set(HOP_HEADER, '1');
  return outgoing;
}

/** Fills the parity headers the family response does not set itself. */
export function withFamilyHeaders(response: Response, id: string) {
  if (response.status === 101) return response;
  const next = new Response(response.body, response);
  for (const [name, value] of Object.entries(FAMILY_PARITY_HEADERS)) {
    if (!next.headers.has(name)) next.headers.set(name, value);
  }
  next.headers.set('x-gateway-cache', 'FAMILY');
  next.headers.set('x-gateway-family', id);
  return next;
}

/**
 * Serves a family request. Family responses are per-user and never enter the
 * gateway cache; Set-Cookie and cache-control are returned as the family sent
 * them.
 */
export async function dispatchWebFamily(
  request: Request,
  target: WebFamilyTarget,
  env: Env
) {
  let response: Response;
  try {
    response = await target.binding.fetch(
      familyRequest(request, target.path, env.PUBLIC_HOST as string)
    );
  } catch {
    return new Response('gateway family unreachable', {
      status: 502,
      headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain' },
    });
  }
  return withFamilyHeaders(response, target.id);
}

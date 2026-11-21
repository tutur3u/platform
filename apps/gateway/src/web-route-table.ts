import { splitLocale } from './manifest';
import type { WebFamilyTarget } from './web-family';
import routeTableJson from './web-routes.generated.json';
import type { Env, ServiceBinding } from './worker';

/**
 * Route table for the apps/web vinext family Workers, generated from the app
 * route entries by apps/web/cloudflare/vinext/gateway-routes.ts.
 */
export interface WebRouteTable {
  fallback: string;
  families: { id: string; binding: string; assetPrefix: string }[];
  routes: { family: string; localized: boolean; pattern: string }[];
}

export const webRouteTable = routeTableJson as WebRouteTable;

type Segment =
  | { kind: 'static'; value: string }
  | { kind: 'dynamic' }
  | { kind: 'catchAll'; optional: boolean };

/** Specificity of a matched segment, as in Next.js route precedence. */
const RANK = { static: 3, dynamic: 2, catchAll: 1, optionalCatchAll: 0 };

interface CompiledRoute {
  family: string;
  localized: boolean;
  segments: Segment[];
}

function compile(pattern: string): Segment[] {
  return pattern
    .split('/')
    .filter(Boolean)
    .map((part): Segment => {
      if (/^\[\[\.\.\.[^\]]+\]\]$/u.test(part)) {
        return { kind: 'catchAll', optional: true };
      }
      if (/^\[\.\.\.[^\]]+\]$/u.test(part)) {
        return { kind: 'catchAll', optional: false };
      }
      if (/^\[[^\]]+\]$/u.test(part)) return { kind: 'dynamic' };
      return { kind: 'static', value: part.toLowerCase() };
    });
}

const compiled = new WeakMap<WebRouteTable, CompiledRoute[]>();

function compiledRoutes(table: WebRouteTable) {
  let routes = compiled.get(table);
  if (!routes) {
    routes = table.routes.map((route) => ({
      family: route.family,
      localized: route.localized,
      segments: compile(route.pattern),
    }));
    compiled.set(table, routes);
  }
  return routes;
}

/** Per-segment ranks when `segments` matches `parts`, or null. */
function matchRanks(segments: Segment[], parts: string[]): number[] | null {
  const ranks: number[] = [];
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index] as Segment;
    if (segment.kind === 'catchAll') {
      if (index !== segments.length - 1) return null;
      const rest = parts.length - index;
      if (rest < (segment.optional ? 0 : 1)) return null;
      ranks.push(segment.optional ? RANK.optionalCatchAll : RANK.catchAll);
      return ranks;
    }
    const part = parts[index];
    if (part === undefined) return null;
    if (segment.kind === 'static') {
      if (part.toLowerCase() !== segment.value) return null;
      ranks.push(RANK.static);
    } else {
      ranks.push(RANK.dynamic);
    }
  }
  return ranks.length === parts.length ? ranks : null;
}

function moreSpecific(a: number[], b: number[]) {
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const left = a[index] ?? -1;
    const right = b[index] ?? -1;
    if (left !== right) return left > right;
  }
  return false;
}

/** Decode only unreserved bytes, so a match cannot introduce separators. */
function decodeUnreserved(part: string) {
  return part.replace(/%([0-9a-f]{2})/giu, (escape, hex: string) => {
    const char = String.fromCharCode(Number.parseInt(hex, 16));
    return /^[a-zA-Z0-9._~-]$/u.test(char) ? char : escape;
  });
}

/**
 * The family that owns `pathname`: its asset prefix, else the most specific
 * route pattern (static over dynamic over catch-all, with or without a
 * leading locale for localized routes), else the fallback family.
 * Framework paths, doubled slashes and backslashes go to the fallback, whose
 * build owns none of the other families' routes.
 */
export function routeFamily(
  pathname: string,
  locales: string[],
  table: WebRouteTable = webRouteTable
): string {
  const lowered = pathname.toLowerCase();
  for (const family of table.families) {
    if (lowered.startsWith(`${family.assetPrefix.toLowerCase()}/`)) {
      return family.id;
    }
  }
  // Framework endpoints (image optimizer, unprefixed assets) and
  // non-canonical paths go to the fallback family.
  if (/^\/_(?:next|vinext)\//u.test(lowered) || /\/\/|\\/u.test(pathname)) {
    return table.fallback;
  }
  const parts = pathname.split('/').filter(Boolean).map(decodeUnreserved);
  const split = splitLocale(pathname, locales);
  const localizedParts = split.locale ? parts.slice(1) : parts;
  let best: { family: string; ranks: number[] } | null = null;
  for (const route of compiledRoutes(table)) {
    const candidates = route.localized
      ? split.locale
        ? [localizedParts]
        : [parts]
      : [parts];
    for (const candidate of candidates) {
      const ranks = matchRanks(route.segments, candidate);
      if (ranks && (!best || moreSpecific(ranks, best.ranks))) {
        best = { family: route.family, ranks };
      }
    }
  }
  return best?.family ?? table.fallback;
}

function flaggedFamilies(env: Env) {
  return new Set(
    (env.GATEWAY_WEB_FAMILIES ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
  );
}

/**
 * The vinext family Worker for a PUBLIC_HOST request, or null when that
 * family is not flagged in GATEWAY_WEB_FAMILIES or not bound. The family
 * receives the path unchanged: it serves its client assets under its asset
 * prefix itself.
 */
export function vinextFamilyTarget(
  request: Request,
  env: Env,
  locales: string[],
  table: WebRouteTable = webRouteTable
): WebFamilyTarget | null {
  const url = new URL(request.url);
  if (!env.PUBLIC_HOST || url.host !== env.PUBLIC_HOST) return null;
  const id = routeFamily(url.pathname, locales, table);
  if (!flaggedFamilies(env).has(id)) return null;
  const family = table.families.find((candidate) => candidate.id === id);
  const binding = family
    ? (env as unknown as Record<string, unknown>)[family.binding]
    : undefined;
  if (
    !binding ||
    typeof (binding as Partial<ServiceBinding>).fetch !== 'function'
  ) {
    return null;
  }
  return { id, binding: binding as ServiceBinding, path: url.pathname };
}

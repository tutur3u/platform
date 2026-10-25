export type RouteParams = Record<string, string | string[]>;

/**
 * Matches a Next App Router pattern (`/a/[id]/[...rest]`, `[[...optional]]`)
 * against a decoded-on-demand pathname. Throws `URIError` for malformed
 * percent-encoding so callers can answer 400 instead of 404.
 */
export function matchRoute(
  pattern: string,
  pathname: string
): RouteParams | null {
  const route = pattern.split('/').filter(Boolean);
  const path = pathname.split('/').filter(Boolean);
  const params: RouteParams = {};
  for (let i = 0; i < route.length; i++) {
    const segment = route[i];
    if (!segment) return null;
    const catchAll = /^\[(\[)?\.\.\.(\w+)\]\]?$/u.exec(segment);
    if (catchAll?.[2]) {
      const optional = catchAll[1] === '[';
      if (optional !== segment.endsWith(']]')) return null;
      const rest = path.slice(i);
      if (!optional && rest.length === 0) return null;
      params[catchAll[2]] = rest.map(decodeURIComponent);
      return params;
    }
    const dynamic = /^\[(\w+)\]$/u.exec(segment);
    const value = path[i];
    if (value === undefined) return null;
    if (dynamic?.[1]) params[dynamic[1]] = decodeURIComponent(value);
    else if (segment !== value) return null;
  }
  return route.length === path.length ? params : null;
}

function segmentRank(segment: string | undefined): number {
  if (segment === undefined) return -1;
  if (segment.startsWith('[[...')) return 3;
  if (segment.startsWith('[...')) return 2;
  if (segment.startsWith('[')) return 1;
  return 0;
}

/**
 * Orders patterns the way the App Router resolves overlaps: at the first
 * differing segment, static beats dynamic beats catch-all beats optional
 * catch-all. Use as an `Array#sort` comparator (most specific first).
 */
export function compareRoutePatterns(a: string, b: string): number {
  const left = a.split('/').filter(Boolean);
  const right = b.split('/').filter(Boolean);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const difference = segmentRank(left[i]) - segmentRank(right[i]);
    if (difference !== 0) return difference;
  }
  return 0;
}

export function routeParam(params: RouteParams, name: string): string {
  const value = params[name];
  if (typeof value !== 'string')
    throw new Error(`Missing route parameter: ${name}`);
  return value;
}

export function routeSegments(params: RouteParams, name: string): string[] {
  const value = params[name];
  if (!Array.isArray(value)) throw new Error(`Missing route segments: ${name}`);
  return value;
}

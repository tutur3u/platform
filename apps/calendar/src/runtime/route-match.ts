export type RouteParams = Record<string, string | string[]>;

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
    const catchAll = /^\[\[\.\.\.(\w+)\]\]$/u.exec(segment);
    if (catchAll?.[1]) {
      params[catchAll[1]] = path.slice(i).map(decodeURIComponent);
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

// https://developers.cloudflare.com/workers/configuration/routing/routes/#matching-behavior
// Matches a request URL, not route precedence or zone/DNS eligibility. Retain
// the complete route inventory, including scriptless exclusions, for rollback.
export function matchesRoute(pattern, requestUrl) {
  const route = /^(?:(https?):\/\/)?(\*?[^/*?#:]+)(\/[^?#]*)?$/iu.exec(pattern);
  if (!route) return false;
  const [, scheme, hostname, routePath = '/'] = route;
  const pathPrefix = routePath.endsWith('*')
    ? routePath.slice(0, -1)
    : routePath;
  if (pathPrefix.includes('*')) return false;
  const url = new URL(requestUrl);
  if (!['http:', 'https:'].includes(url.protocol)) return false;
  if (scheme && `${scheme.toLowerCase()}:` !== url.protocol) return false;
  const host = hostname.toLowerCase();
  if (
    host.startsWith('*')
      ? !url.hostname.endsWith(host.slice(1))
      : url.hostname !== host
  )
    return false;
  const requestPath = `${url.pathname}${url.search}`;
  return routePath.endsWith('*')
    ? requestPath.startsWith(pathPrefix)
    : requestPath === routePath;
}

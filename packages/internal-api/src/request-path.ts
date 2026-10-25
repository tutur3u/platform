let resolveAppPath = (path: string) => path;

/** Installs the owning app adapter; central API paths remain unchanged by default. */
export function configureInternalApiPaths(resolver: (path: string) => string) {
  resolveAppPath = resolver;
}

export function resolveAppApiPath(path: string, explicitOrigin?: string) {
  return explicitOrigin ? path : resolveAppPath(path);
}

export function normalizeBaseUrl(baseUrl: string) {
  let end = baseUrl.length;
  while (end > 0 && baseUrl.charCodeAt(end - 1) === 47) end -= 1;
  return end === baseUrl.length ? baseUrl : baseUrl.slice(0, end);
}

export function normalizePath(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return path.startsWith('/') ? path : `/${path}`;
}

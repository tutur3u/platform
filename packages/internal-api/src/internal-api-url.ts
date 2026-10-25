/**
 * Resolve an app-owned path to a mounted path or an absolute server URL.
 * Adapters own request context and route selection for central Web APIs.
 */
export type InternalApiAppBaseResolver = (path: string) => string;

const defaultAppBaseResolvers = new Map<symbol, InternalApiAppBaseResolver>();

/**
 * Register once at adapter startup. On servers, read request-local context inside
 * the resolver on every call; never register a closure over an incoming request.
 * The latest active registration wins. Cleanup is idempotent and may be unordered.
 */
export function registerDefaultAppBaseResolver(
  resolver: InternalApiAppBaseResolver
): () => void {
  const key = Symbol();
  defaultAppBaseResolvers.set(key, resolver);
  return () => {
    defaultAppBaseResolvers.delete(key);
  };
}

function defaultAppBaseResolver() {
  let resolver: InternalApiAppBaseResolver | undefined;
  for (const registered of defaultAppBaseResolvers.values())
    resolver = registered;
  return resolver;
}

export function hasAppBaseResolver(options: {
  appBaseResolver?: InternalApiAppBaseResolver;
}) {
  return Boolean(options.appBaseResolver ?? defaultAppBaseResolver());
}

export function normalizeApiPath(path: string) {
  if (/^https?:\/\//.test(path)) {
    return path;
  }

  return path.startsWith('/') ? path : `/${path}`;
}

export function normalizeBaseUrl(baseUrl: string) {
  let end = baseUrl.length;

  while (end > 0 && baseUrl.charCodeAt(end - 1) === 47) {
    end -= 1;
  }

  return end === baseUrl.length ? baseUrl : baseUrl.slice(0, end);
}

export function resolveInternalApiUrlWithAppBase(
  path: string,
  baseUrl: string | undefined,
  appBaseResolver: InternalApiAppBaseResolver | undefined,
  defaultBaseUrl: string | undefined
) {
  const normalizedPath = normalizeApiPath(path);

  if (/^https?:\/\//.test(normalizedPath)) {
    return normalizedPath;
  }

  const resolver = appBaseResolver ?? defaultAppBaseResolver();
  const resolvedPath = resolver?.(normalizedPath) ?? normalizedPath;

  if (/^https?:\/\//.test(resolvedPath)) {
    return resolvedPath;
  }

  const resolvedBaseUrl = baseUrl
    ? normalizeBaseUrl(baseUrl)
    : defaultBaseUrl
      ? normalizeBaseUrl(defaultBaseUrl)
      : undefined;

  return resolvedBaseUrl
    ? new URL(resolvedPath, resolvedBaseUrl).toString()
    : resolvedPath;
}

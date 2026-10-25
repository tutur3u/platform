/**
 * Inject `appPath` from `@tuturuuu/start-bridge/app-url` for app-owned APIs.
 * Leave it unset for central Web API requests.
 */
export type InternalApiAppBaseResolver = (path: string) => string;

export function normalizeApiPath(path: string) {
  if (/^https?:\/\//.test(path)) {
    return path;
  }

  return path.startsWith('/') ? path : `/${path}`;
}

function normalizeBaseUrl(baseUrl: string) {
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

  const resolvedPath = appBaseResolver?.(normalizedPath) ?? normalizedPath;
  const resolvedBaseUrl = baseUrl
    ? normalizeBaseUrl(baseUrl)
    : defaultBaseUrl
      ? normalizeBaseUrl(defaultBaseUrl)
      : undefined;

  return resolvedBaseUrl
    ? new URL(resolvedPath, resolvedBaseUrl).toString()
    : resolvedPath;
}

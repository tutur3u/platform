/**
 * Resolve an app-owned path to a mounted path or an absolute server URL.
 * Adapters own request context and route selection for central Web APIs.
 */
export type InternalApiAppBaseResolver = (path: string) => string;

type AppBaseRegistration = {
  resolver: InternalApiAppBaseResolver;
  /** The app whose own routes the resolver serves; `undefined` if untagged. */
  app?: string;
};

const defaultAppBaseResolvers = new Map<symbol, AppBaseRegistration>();

/**
 * Register once at adapter startup. On servers, read request-local context inside
 * the resolver on every call; never register a closure over an incoming request.
 * The latest active registration wins. Cleanup is idempotent and may be unordered.
 *
 * Pass `{ app }` so cross-app helpers (`withTaskApiBaseUrl` and friends) keep
 * their owning app's origin and only that app's own helper defers to this
 * resolver. An untagged resolver is used for a cross-app call only when it
 * claims the path (returns a different path).
 */
export function registerDefaultAppBaseResolver(
  resolver: InternalApiAppBaseResolver,
  options: { app?: string } = {}
): () => void {
  const key = Symbol();
  defaultAppBaseResolvers.set(key, { resolver, app: options.app });
  return () => {
    defaultAppBaseResolvers.delete(key);
  };
}

function defaultAppBaseRegistration() {
  let registration: AppBaseRegistration | undefined;
  for (const registered of defaultAppBaseResolvers.values())
    registration = registered;
  return registration;
}

function defaultAppBaseResolver() {
  return defaultAppBaseRegistration()?.resolver;
}

export function hasAppBaseResolver(options: {
  appBaseResolver?: InternalApiAppBaseResolver;
}) {
  return Boolean(options.appBaseResolver ?? defaultAppBaseResolver());
}

/**
 * Whether app-base resolution should serve `app`'s own API calls: a resolver
 * passed explicitly on the client, or a default registered for `app`.
 */
export function hasAppBaseResolverFor(
  app: string,
  options: { appBaseResolver?: InternalApiAppBaseResolver }
) {
  if (options.appBaseResolver) return true;
  return defaultAppBaseRegistration()?.app === app;
}

type AppApiBaseOptions = {
  appBaseResolver?: InternalApiAppBaseResolver;
  baseUrl?: string;
  crossAppBaseUrl?: string;
};

/**
 * Shared policy for per-app helpers. An explicit base, the app's own runtime,
 * or a resolver serving `app` keep the options; any other registered resolver
 * leaves the owning app's origin as `crossAppBaseUrl` (see
 * `resolveInternalApiUrlWithAppBase`); with no resolver the origin becomes
 * the base, as before.
 */
export function withAppApiBaseUrl<Options extends AppApiBaseOptions>(
  app: string,
  options: Options,
  getConfiguredBaseUrl: () => string,
  isOwnRuntime: () => boolean = () => false
): Options {
  if (options.baseUrl || isOwnRuntime()) return options;
  if (hasAppBaseResolverFor(app, options)) return options;
  if (defaultAppBaseResolver())
    return { ...options, crossAppBaseUrl: getConfiguredBaseUrl() };
  return { ...options, baseUrl: getConfiguredBaseUrl() };
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
  defaultBaseUrl: string | undefined,
  crossAppBaseUrl?: string
) {
  const normalizedPath = normalizeApiPath(path);

  if (/^https?:\/\//.test(normalizedPath)) {
    return normalizedPath;
  }

  if (baseUrl) {
    return new URL(normalizedPath, normalizeBaseUrl(baseUrl)).toString();
  }

  const registration = appBaseResolver ? undefined : defaultAppBaseRegistration();
  const resolver = appBaseResolver ?? registration?.resolver;

  if (crossAppBaseUrl) {
    // A cross-app call keeps its owning app's origin. Only an untagged
    // default may keep the path local, and only when it claims the path.
    const claimed =
      registration && registration.app === undefined
        ? registration.resolver(normalizedPath)
        : normalizedPath;
    if (claimed === normalizedPath)
      return new URL(
        normalizedPath,
        normalizeBaseUrl(crossAppBaseUrl)
      ).toString();
    return absoluteOrDefault(claimed, defaultBaseUrl);
  }

  const resolvedPath = resolver?.(normalizedPath) ?? normalizedPath;
  return absoluteOrDefault(resolvedPath, defaultBaseUrl);
}

function absoluteOrDefault(path: string, defaultBaseUrl: string | undefined) {
  if (/^https?:\/\//.test(path)) {
    return path;
  }

  const resolvedBaseUrl = defaultBaseUrl
    ? normalizeBaseUrl(defaultBaseUrl)
    : undefined;

  return resolvedBaseUrl ? new URL(path, resolvedBaseUrl).toString() : path;
}

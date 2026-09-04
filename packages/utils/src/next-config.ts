import type { NextConfig } from 'next';
import { resolveInternalAppUrl } from './app-url';
import { getLocalInternalAppUrl } from './internal-domains';
import { getTuturuuuPortlessAllowedDevOrigins } from './portless';

type Environment = Record<string, string | undefined>;

export const TUTURUUU_NEXT_OPTIMIZE_PACKAGE_IMPORTS = [
  '@lucide/lab',
  '@tuturuuu/icons',
  '@tuturuuu/icons/lab',
  '@tuturuuu/icons/lucide',
  'lucide-react',
] as const;

export const TUTURUUU_WEB_WORKSPACE_API_RESERVED_PATHS = [
  '/api/workspaces/invitations',
  '/api/v1/workspaces/:wsId/settings/permissions',
  '/api/v1/workspaces/:wsId/users/feedbacks',
] as const;

type NextImageConfig = NonNullable<NextConfig['images']>;
type NextImageRemotePattern = NonNullable<
  NextImageConfig['remotePatterns']
>[number];

export const TUTURUUU_NEXT_IMAGE_REMOTE_PATTERNS = [
  {
    protocol: 'https',
    hostname: '**.supabase.co',
  },
  {
    protocol: 'https',
    hostname: 'avatars.githubusercontent.com',
  },
  {
    protocol: 'https',
    hostname: 'tuturuuu.com',
  },
] satisfies NextImageRemotePattern[];

export const TUTURUUU_NEXT_IMAGE_MINIMUM_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * Paths every app excludes from the anti-framing headers.
 *
 * Framing is denied by default across the platform; anything listed here has
 * been deliberately designed to be embedded in a third-party page.
 */
const TUTURUUU_DEFAULT_FRAMABLE_PATTERNS = [
  'api/v1/workspaces/[^/]+/external-projects/assets/[^/]+/webgl',
];

/**
 * Builds the anti-framing `source` as a negative lookahead over every framable
 * path, so those paths simply never match the deny rule.
 *
 * A later permissive header would not reliably win: `X-Frame-Options` has no
 * "allow from any origin" value, so the deny header has to be absent rather
 * than overridden.
 */
function buildAntiFramingSource(framablePathPatterns: readonly string[]) {
  const alternatives = framablePathPatterns
    .map((pattern) => `${pattern}(?:/|$)`)
    .join('|');

  return `/:path((?!${alternatives}).*)`;
}

const TUTURUUU_ANTI_FRAMING_HEADERS = [
  {
    key: 'Content-Security-Policy',
    value: "frame-ancestors 'none'",
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
];

function mergeStringArrays(
  first: readonly string[] | undefined,
  second: readonly string[] | undefined
) {
  return Array.from(new Set([...(first ?? []), ...(second ?? [])]));
}

function getRemotePatternKey(pattern: NextImageRemotePattern) {
  return pattern instanceof URL ? pattern.toString() : JSON.stringify(pattern);
}

function mergeRemotePatterns(
  first: readonly NextImageRemotePattern[] | undefined,
  second: readonly NextImageRemotePattern[] | undefined
) {
  const merged = new Map<string, NextImageRemotePattern>();

  for (const pattern of [...(first ?? []), ...(second ?? [])]) {
    merged.set(getRemotePatternKey(pattern), pattern);
  }

  return Array.from(merged.values());
}

export function isTuturuuuNextReactCompilerEnabled(
  _env: Environment = process.env
) {
  return true;
}

export function isTuturuuuNextCacheComponentsEnabled(
  _env: Environment = process.env
) {
  return true;
}

export function isTuturuuuTurbopackRustReactCompilerEnabled(
  env: Environment = process.env
) {
  return env.NEXT_WEBPACK_BUILD !== '1';
}

export function getTuturuuuNextOptimizePackageImports(
  appImports: readonly string[] | undefined,
  env: Environment = process.env
) {
  // Next's webpack dev server can leave optimized workspace-package barrels
  // out of the React Server Consumer Manifest after enough on-demand route
  // compilations. E2E-owned satellites deliberately use webpack, so retain
  // only explicit app imports there and keep the shared optimization for
  // normal Turbopack development and production builds.
  return env.NEXT_WEBPACK_BUILD === '1'
    ? [...(appImports ?? [])]
    : mergeStringArrays(TUTURUUU_NEXT_OPTIMIZE_PACKAGE_IMPORTS, appImports);
}

export interface TuturuuuNextConfigOptions extends NextConfig {
  /**
   * Path patterns (no leading slash, regex fragments) that this app allows to
   * be framed by third-party sites. Excluded from the platform-wide
   * `frame-ancestors 'none'` / `X-Frame-Options: DENY` rule.
   *
   * Opt in per route, never per app: everything not listed here stays denied.
   */
  framablePathPatterns?: readonly string[];
}

export function createTuturuuuNextConfig(
  config: TuturuuuNextConfigOptions = {}
): NextConfig {
  const experimentalConfig = config.experimental ?? {};
  const imageConfig = config.images ?? {};
  const { framablePathPatterns, ...nextConfig } = config;
  const antiFramingSource = buildAntiFramingSource([
    ...TUTURUUU_DEFAULT_FRAMABLE_PATTERNS,
    ...(framablePathPatterns ?? []),
  ]);

  return {
    reactStrictMode: true,
    poweredByHeader: false,
    ...nextConfig,
    reactCompiler: isTuturuuuNextReactCompilerEnabled(),
    cacheComponents:
      config.cacheComponents ?? isTuturuuuNextCacheComponentsEnabled(),
    partialPrefetching: config.partialPrefetching ?? true,
    allowedDevOrigins: mergeStringArrays(
      getTuturuuuPortlessAllowedDevOrigins(),
      config.allowedDevOrigins
    ),
    images: {
      ...imageConfig,
      minimumCacheTTL:
        imageConfig.minimumCacheTTL ??
        TUTURUUU_NEXT_IMAGE_MINIMUM_CACHE_TTL_SECONDS,
      remotePatterns: mergeRemotePatterns(
        TUTURUUU_NEXT_IMAGE_REMOTE_PATTERNS,
        imageConfig.remotePatterns
      ),
    },
    typescript: {
      ignoreBuildErrors: true,
      ...config.typescript,
    },
    experimental: {
      ...experimentalConfig,
      useTypeScriptCli: true,
      turbopackFileSystemCacheForBuild:
        experimentalConfig.turbopackFileSystemCacheForBuild ?? true,
      turbopackRustReactCompiler:
        experimentalConfig.turbopackRustReactCompiler ??
        isTuturuuuTurbopackRustReactCompilerEnabled(),
      devMemoryThresholdRestart:
        experimentalConfig.devMemoryThresholdRestart ??
        process.env.NEXT_WEBPACK_BUILD !== '1',
      optimizePackageImports: getTuturuuuNextOptimizePackageImports(
        experimentalConfig.optimizePackageImports
      ),
    },
    async headers() {
      return [
        {
          source: antiFramingSource,
          headers: TUTURUUU_ANTI_FRAMING_HEADERS,
        },
        ...((await nextConfig.headers?.()) ?? []),
      ];
    },
  };
}

export function trimTrailingSlashes(value: string) {
  let end = value.length;

  while (end > 0 && value.charCodeAt(end - 1) === 47) {
    end -= 1;
  }

  return end === value.length ? value : value.slice(0, end);
}

export function createTuturuuuWebWorkspaceApiRewrites(webAppUrl: string) {
  const destinationOrigin = trimTrailingSlashes(webAppUrl);

  return TUTURUUU_WEB_WORKSPACE_API_RESERVED_PATHS.map((source) => ({
    source,
    destination: `${destinationOrigin}${source}`,
  }));
}

export function isTuturuuuNextDeployedEnvironment(
  env: Environment = process.env
) {
  return (
    env.VERCEL === '1' ||
    env.VERCEL_ENV === 'preview' ||
    env.VERCEL_ENV === 'production' ||
    env.NODE_ENV === 'production'
  );
}

function resolveNextPublicPlatformAppUrl(env: Environment) {
  if (!env.NEXT_PUBLIC_APP_URL) {
    return undefined;
  }

  const resolvedUrl = resolveInternalAppUrl({
    appName: 'platform',
    candidates: [env.NEXT_PUBLIC_APP_URL],
    fallback: '',
  });

  return resolvedUrl || undefined;
}

export function resolveTuturuuuWebAppUrl({
  centralPort,
  env = process.env,
  localFallbackUrl,
  productionUrl = 'https://tuturuuu.com',
}: {
  centralPort?: number | string;
  env?: Environment;
  localFallbackUrl?: string;
  productionUrl?: string;
} = {}) {
  const localCentralPort = centralPort ?? env.CENTRAL_PORT ?? 7803;
  const localUrl =
    localFallbackUrl ??
    getLocalInternalAppUrl('platform', `http://localhost:${localCentralPort}`);

  return trimTrailingSlashes(
    env.INTERNAL_WEB_API_ORIGIN ||
      env.WEB_APP_URL ||
      env.NEXT_PUBLIC_WEB_APP_URL ||
      resolveNextPublicPlatformAppUrl(env) ||
      (isTuturuuuNextDeployedEnvironment(env) ? productionUrl : localUrl)
  );
}

export function resolveTuturuuuInfrastructureAppUrl({
  env = process.env,
  localFallbackUrl,
  productionUrl = 'https://infrastructure.tuturuuu.com',
}: {
  env?: Environment;
  localFallbackUrl?: string;
  productionUrl?: string;
} = {}) {
  const localUrl =
    localFallbackUrl ??
    getLocalInternalAppUrl('infra', 'http://localhost:7823');

  return trimTrailingSlashes(
    resolveInternalAppUrl({
      appName: 'infra',
      candidates: [
        env.INTERNAL_INFRASTRUCTURE_API_ORIGIN,
        env.INFRASTRUCTURE_APP_URL,
        env.NEXT_PUBLIC_INFRASTRUCTURE_APP_URL,
      ],
      fallback: isTuturuuuNextDeployedEnvironment(env)
        ? productionUrl
        : localUrl,
    })
  );
}

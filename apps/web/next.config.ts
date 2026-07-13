import { getTurbopackConfig } from '@tuturuuu/offline/config';
import { createTuturuuuNextConfig } from '@tuturuuu/utils/next-config';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();
const serwistConfig = getTurbopackConfig({ projectRoot: __dirname });
const isDockerStandaloneBuild = process.env.DOCKER_WEB_STANDALONE === '1';
const isNativeDockerStandaloneBuild =
  isDockerStandaloneBuild && process.env.DOCKER_WEB_NATIVE_BUILD === '1';
const authShellHeaders = [
  {
    key: 'Cache-Control',
    value: 'public, max-age=0, must-revalidate',
  },
  {
    key: 'CDN-Cache-Control',
    value: 'public, max-age=86400, stale-while-revalidate=604800',
  },
  {
    key: 'Vercel-CDN-Cache-Control',
    value: 'public, max-age=86400, stale-while-revalidate=604800',
  },
  {
    key: 'X-Robots-Tag',
    value: 'noindex, nofollow',
  },
];

function parsePositiveIntegerEnv(name: string, fallback?: number) {
  const rawValue = process.env[name]?.trim();

  if (!rawValue) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

const staticPageGenerationTimeout = parsePositiveIntegerEnv(
  'DOCKER_WEB_STATIC_PAGE_GENERATION_TIMEOUT',
  isDockerStandaloneBuild ? 180 : undefined
);
const staticGenerationMaxConcurrency = parsePositiveIntegerEnv(
  'DOCKER_WEB_STATIC_GENERATION_MAX_CONCURRENCY',
  isDockerStandaloneBuild && !isNativeDockerStandaloneBuild ? 4 : undefined
);
const dockerNextBuildCpus = parsePositiveIntegerEnv(
  'DOCKER_WEB_NEXT_BUILD_CPUS',
  isDockerStandaloneBuild && !isNativeDockerStandaloneBuild ? 4 : undefined
);
const nextConfig = createTuturuuuNextConfig({
  ...serwistConfig,
  ...(isDockerStandaloneBuild ? { output: 'standalone' } : {}),
  ...(staticPageGenerationTimeout ? { staticPageGenerationTimeout } : {}),
  outputFileTracingIncludes: serwistConfig.outputFileTracingIncludes,
  reactCompiler: true,
  serverExternalPackages: [...(serwistConfig.serverExternalPackages ?? [])],
  experimental: {
    ...(serwistConfig.experimental ?? {}),
    // Reuse static route stages and shared shells across similar navigations.
    // Personalized runtime stages remain request-bound unless a segment opts in.
    cachedNavigations: true,
    appShells: true,
    ...(staticGenerationMaxConcurrency
      ? { staticGenerationMaxConcurrency }
      : {}),
    ...(dockerNextBuildCpus ? { cpus: dockerNextBuildCpus } : {}),
  },
  transpilePackages: [
    '@tuturuuu/ai',
    '@tuturuuu/auth',
    '@tuturuuu/ui',
    '@tuturuuu/types',
    '@tuturuuu/utils',
    '@tuturuuu/supabase',
    '@tuturuuu/microsoft',
    '@tuturuuu/google',
    '@tuturuuu/hive-ui',
    '@tuturuuu/internal-api',
    '@tuturuuu/inventory-core',
    '@tuturuuu/storage-core',
    '@tuturuuu/mind-ui',
    '@tuturuuu/offline',
    '@tuturuuu/realtime',
  ],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'models.dev',
      },
    ],
  },
  async headers() {
    return [
      '/login',
      '/:locale/login',
      '/add-account',
      '/:locale/add-account',
    ].map((source) => ({
      source,
      headers: authShellHeaders,
    }));
  },
});

export default withNextIntl(nextConfig);

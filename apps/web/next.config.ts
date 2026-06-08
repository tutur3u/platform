import { getTurbopackConfig } from '@tuturuuu/offline/config';
import {
  createTuturuuuNextConfig,
  isTuturuuuNextReactCompilerEnabled,
} from '@tuturuuu/utils/next-config';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();
const serwistConfig = getTurbopackConfig();
const isDockerStandaloneBuild = process.env.DOCKER_WEB_STANDALONE === '1';
const reactCompilerEnabled = isDockerStandaloneBuild
  ? process.env.DOCKER_WEB_REACT_COMPILER === '1'
  : isTuturuuuNextReactCompilerEnabled();

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
  isDockerStandaloneBuild ? 4 : undefined
);
const dockerNextBuildCpus = parsePositiveIntegerEnv(
  'DOCKER_WEB_NEXT_BUILD_CPUS',
  isDockerStandaloneBuild ? 4 : undefined
);
const cronMonitoringTraceIncludes = {
  '/api/v1/infrastructure/monitoring/cron': ['./cron.config.json'],
  '/api/v1/infrastructure/monitoring/cron/**': ['./cron.config.json'],
};
const nextConfig = createTuturuuuNextConfig({
  ...serwistConfig,
  ...(isDockerStandaloneBuild ? { output: 'standalone' } : {}),
  ...(staticPageGenerationTimeout ? { staticPageGenerationTimeout } : {}),
  outputFileTracingIncludes: {
    ...(serwistConfig.outputFileTracingIncludes ?? {}),
    ...cronMonitoringTraceIncludes,
  },
  reactCompiler: reactCompilerEnabled,
  serverExternalPackages: [...(serwistConfig.serverExternalPackages ?? [])],
  experimental: {
    ...(serwistConfig.experimental ?? {}),
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
});

export default withNextIntl(nextConfig);

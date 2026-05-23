import { getTurbopackConfig } from '@tuturuuu/offline/config';
import { TUTURUUU_PORTLESS_ALLOWED_DEV_ORIGINS } from '@tuturuuu/utils/portless';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();
const serwistConfig = getTurbopackConfig();
const isDockerStandaloneBuild = process.env.DOCKER_WEB_STANDALONE === '1';
const reactCompilerEnabled =
  !isDockerStandaloneBuild || process.env.DOCKER_WEB_REACT_COMPILER === '1';

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

function parseBooleanEnv(name: string, fallback: boolean) {
  const rawValue = process.env[name]?.trim().toLowerCase();

  if (!rawValue) {
    return fallback;
  }

  if (['1', 'true', 'yes', 'on'].includes(rawValue)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(rawValue)) {
    return false;
  }

  throw new Error(`${name} must be a boolean value.`);
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
const webpackBuildWorkerEnabled = parseBooleanEnv(
  'DOCKER_WEB_WEBPACK_BUILD_WORKER',
  true
);

const nextConfig: NextConfig = {
  ...serwistConfig,
  allowedDevOrigins: [...TUTURUUU_PORTLESS_ALLOWED_DEV_ORIGINS],
  ...(isDockerStandaloneBuild ? { output: 'standalone' } : {}),
  ...(staticPageGenerationTimeout ? { staticPageGenerationTimeout } : {}),
  reactCompiler: reactCompilerEnabled,
  reactStrictMode: true,
  poweredByHeader: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  serverExternalPackages: [...(serwistConfig.serverExternalPackages ?? [])],
  experimental: {
    ...(serwistConfig.experimental ?? {}),
    ...(isDockerStandaloneBuild
      ? {
          webpackBuildWorker: webpackBuildWorkerEnabled,
          webpackMemoryOptimizations: true,
        }
      : {}),
    ...(staticGenerationMaxConcurrency
      ? { staticGenerationMaxConcurrency }
      : {}),
    ...(dockerNextBuildCpus ? { cpus: dockerNextBuildCpus } : {}),
  },
  transpilePackages: [
    '@tuturuuu/ai',
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
        protocol: 'http',
        hostname: 'localhost',
      },
      {
        protocol: 'http',
        hostname: '127.0.0.1',
      },
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
      {
        protocol: 'https',
        hostname: 'models.dev',
      },
    ],
  },
};

export default withNextIntl(nextConfig);

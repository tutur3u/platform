import type { NextConfig } from 'next';
import { getLocalInternalAppUrl } from './internal-domains';
import { TUTURUUU_PORTLESS_ALLOWED_DEV_ORIGINS } from './portless';

type Environment = Record<string, string | undefined>;

export const TUTURUUU_NEXT_OPTIMIZE_PACKAGE_IMPORTS = [
  '@lucide/lab',
  '@tuturuuu/icons',
  '@tuturuuu/icons/lab',
  '@tuturuuu/icons/lucide',
  'lucide-react',
] as const;

const TRUTHY_ENV_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSY_ENV_VALUES = new Set(['0', 'false', 'no', 'off']);

function mergeStringArrays(
  first: readonly string[] | undefined,
  second: readonly string[] | undefined
) {
  return Array.from(new Set([...(first ?? []), ...(second ?? [])]));
}

function readBooleanEnvOverride(value: string | undefined) {
  const normalizedValue = value?.trim().toLowerCase();

  if (!normalizedValue) {
    return undefined;
  }

  if (TRUTHY_ENV_VALUES.has(normalizedValue)) {
    return true;
  }

  if (FALSY_ENV_VALUES.has(normalizedValue)) {
    return false;
  }

  return undefined;
}

export function isTuturuuuNextReactCompilerEnabled(
  env: Environment = process.env
) {
  const override = readBooleanEnvOverride(env.TUTURUUU_NEXT_REACT_COMPILER);

  if (override !== undefined) {
    return override;
  }

  return env.NODE_ENV !== 'development';
}

export function createTuturuuuNextConfig(config: NextConfig = {}): NextConfig {
  const experimentalConfig = config.experimental ?? {};

  return {
    reactCompiler: isTuturuuuNextReactCompilerEnabled(),
    reactStrictMode: true,
    poweredByHeader: false,
    ...config,
    allowedDevOrigins: mergeStringArrays(
      TUTURUUU_PORTLESS_ALLOWED_DEV_ORIGINS,
      config.allowedDevOrigins
    ),
    typescript: {
      ignoreBuildErrors: true,
      ...config.typescript,
    },
    experimental: {
      ...experimentalConfig,
      optimizePackageImports: mergeStringArrays(
        TUTURUUU_NEXT_OPTIMIZE_PACKAGE_IMPORTS,
        experimentalConfig.optimizePackageImports
      ),
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
      env.NEXT_PUBLIC_WEB_APP_URL ||
      env.WEB_APP_URL ||
      env.NEXT_PUBLIC_APP_URL ||
      (isTuturuuuNextDeployedEnvironment(env) ? productionUrl : localUrl)
  );
}

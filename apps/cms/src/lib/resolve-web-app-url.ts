import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';
import { getTuturuuuPortlessAppOrigin } from '@tuturuuu/utils/portless';

type Environment = Record<string, string | undefined>;

function isDeployedEnvironment(env: Environment) {
  return (
    env.VERCEL === '1' ||
    env.VERCEL_ENV === 'preview' ||
    env.VERCEL_ENV === 'production' ||
    env.NODE_ENV === 'production'
  );
}

function trimTrailingSlashes(value: string) {
  let end = value.length;

  while (end > 0 && value.charCodeAt(end - 1) === 47) {
    end -= 1;
  }

  return end === value.length ? value : value.slice(0, end);
}

function getOrigin(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function matchesCurrentCmsOrigin(
  candidate: string | undefined,
  currentAppOrigins: string[]
) {
  const candidateOrigin = getOrigin(candidate);

  return (
    !!candidateOrigin &&
    currentAppOrigins.some((origin) => origin === candidateOrigin)
  );
}

export function resolveCmsWebAppUrl(env: Environment = process.env) {
  const centralPort = env.CENTRAL_PORT || '7803';
  const cmsPort = env.PORT || '7811';
  const deployed = isDeployedEnvironment(env);
  const fallbackWebUrl = deployed
    ? 'https://tuturuuu.com'
    : getLocalInternalAppUrl('platform', `http://localhost:${centralPort}`);
  const currentAppOrigins = [
    deployed ? 'https://cms.tuturuuu.com' : getTuturuuuPortlessAppOrigin('cms'),
    `http://localhost:${cmsPort}`,
    env.CMS_APP_URL,
    env.NEXT_PUBLIC_CMS_APP_URL,
    env.BASE_URL,
    env.VERCEL_URL ? `https://${env.VERCEL_URL}` : undefined,
  ].flatMap((value) => {
    const origin = getOrigin(value);
    return origin ? [origin] : [];
  });

  const candidates = [
    env.INTERNAL_WEB_API_ORIGIN,
    env.NEXT_PUBLIC_WEB_APP_URL,
    env.WEB_APP_URL,
    env.NEXT_PUBLIC_APP_URL,
    fallbackWebUrl,
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const trimmedCandidate = trimTrailingSlashes(candidate);

    if (matchesCurrentCmsOrigin(trimmedCandidate, currentAppOrigins)) {
      continue;
    }

    return trimmedCandidate;
  }

  return fallbackWebUrl;
}

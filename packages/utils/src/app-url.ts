import { type AppName, getAppDomainByUrl } from './internal-domains';

type AppUrlCandidate = string | null | undefined;

interface ResolveAppUrlOptions {
  candidates: readonly AppUrlCandidate[];
  fallback: string;
}

interface ResolveInternalAppUrlOptions extends ResolveAppUrlOptions {
  appName: AppName;
}

function trimTrailingSlashes(value: string) {
  let end = value.length;

  while (end > 0 && value.charCodeAt(end - 1) === 47) {
    end -= 1;
  }

  return end === value.length ? value : value.slice(0, end);
}

function isWildcardListenerHostname(hostname: string) {
  return hostname === '0.0.0.0' || hostname === '::' || hostname === '[::]';
}

function normalizeHttpUrl(value: AppUrlCandidate) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    if (isWildcardListenerHostname(url.hostname)) {
      return null;
    }

    return trimTrailingSlashes(trimmed);
  } catch {
    return null;
  }
}

export function resolveAppUrl({ candidates, fallback }: ResolveAppUrlOptions) {
  for (const candidate of candidates) {
    const resolvedUrl = normalizeHttpUrl(candidate);

    if (resolvedUrl) {
      return resolvedUrl;
    }
  }

  return normalizeHttpUrl(fallback) ?? fallback;
}

function getRegisteredAppNameForUrl(value: string) {
  return getAppDomainByUrl(value)?.name ?? null;
}

export function resolveInternalAppUrl({
  appName,
  candidates,
  fallback,
}: ResolveInternalAppUrlOptions) {
  for (const candidate of candidates) {
    const resolvedUrl = normalizeHttpUrl(candidate);

    if (!resolvedUrl) {
      continue;
    }

    const registeredAppName = getRegisteredAppNameForUrl(resolvedUrl);

    if (registeredAppName && registeredAppName !== appName) {
      continue;
    }

    const registeredAppUrl = getAppDomainByUrl(resolvedUrl);

    if (registeredAppUrl?.kind === 'internal') {
      return trimTrailingSlashes(registeredAppUrl.canonicalUrl);
    }

    return resolvedUrl;
  }

  return normalizeHttpUrl(fallback) ?? fallback;
}

import type { AppDomain } from './internal-domains';

const INTERNAL_APP_DOMAINS_ENV_KEY =
  'NEXT_PUBLIC_TUTURUUU_INTERNAL_APP_DOMAINS';

const warnedInternalAppDomainEntries = new Set<string>();

function warnIgnoredInternalAppDomainEntry(entry: string, reason: string) {
  if (warnedInternalAppDomainEntries.has(entry)) {
    return;
  }

  warnedInternalAppDomainEntries.add(entry);
  console.warn(
    `[internal-domains] Ignoring ${INTERNAL_APP_DOMAINS_ENV_KEY} entry "${entry}": ${reason}`
  );
}

function parseInternalAppDomainEntry(entry: string): AppDomain | null {
  const trimmed = entry.trim();

  if (!trimmed) {
    return null;
  }

  const separatorIndex = trimmed.indexOf(':');
  const name =
    separatorIndex > 0
      ? trimmed.slice(0, separatorIndex).trim().toLowerCase()
      : '';
  const rawUrl =
    separatorIndex > 0 ? trimmed.slice(separatorIndex + 1).trim() : '';

  if (!/^[a-z0-9_-]{1,64}$/u.test(name) || !rawUrl) {
    warnIgnoredInternalAppDomainEntry(trimmed, 'expected name:https://origin');
    return null;
  }

  if (rawUrl.includes('*')) {
    warnIgnoredInternalAppDomainEntry(trimmed, 'wildcards are not allowed');
    return null;
  }

  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    warnIgnoredInternalAppDomainEntry(trimmed, 'invalid URL');
    return null;
  }

  if (url.protocol !== 'https:') {
    warnIgnoredInternalAppDomainEntry(
      trimmed,
      'only https origins are allowed'
    );
    return null;
  }

  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  ) {
    warnIgnoredInternalAppDomainEntry(trimmed, 'value must be an exact origin');
    return null;
  }

  return {
    kind: 'internal',
    name,
    requiresExactOrigin: true,
    url: url.origin,
  };
}

/**
 * Staging apps live on `https://<app>.staging.tutur3u.com`, so they cannot be
 * derived from the production registry. Register them as `internal` apps
 * (token handoff through `/verify-token`) with `name:https://origin` entries.
 */
export function getConfiguredInternalAppDomains(): AppDomain[] {
  const configured = process.env.NEXT_PUBLIC_TUTURUUU_INTERNAL_APP_DOMAINS;

  if (!configured?.trim()) {
    return [];
  }

  return configured
    .split(/[,\n]/u)
    .map(parseInternalAppDomainEntry)
    .filter((entry): entry is AppDomain => Boolean(entry));
}

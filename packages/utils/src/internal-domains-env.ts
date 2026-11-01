import type { AppDomain } from './internal-domains';
import {
  getConfiguredSharedCookieDomainOverride,
  type TuturuuuSharedCookieDomain,
} from './shared-cookie';

const INTERNAL_APP_DOMAINS_ENV_KEY =
  'NEXT_PUBLIC_TUTURUUU_INTERNAL_APP_DOMAINS';

const warnedInternalAppDomainEntries = new Set<string>();

const STAGING_ISSUER_HOSTNAME = 'tutur3u.com';

function warnIgnoredInternalAppDomainEntry(entry: string, reason: string) {
  if (warnedInternalAppDomainEntries.has(entry)) {
    return;
  }

  warnedInternalAppDomainEntries.add(entry);
  console.warn(
    `[internal-domains] Ignoring ${INTERNAL_APP_DOMAINS_ENV_KEY} entry "${entry}": ${reason}`
  );
}

function parseInternalAppDomainEntry(
  entry: string,
  override: TuturuuuSharedCookieDomain,
  knownAppNames: ReadonlySet<string>
): AppDomain | null {
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

  if (!knownAppNames.has(name)) {
    warnIgnoredInternalAppDomainEntry(
      trimmed,
      'name must be an existing app name'
    );
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

  if (url.port || /^https:\/\/[^/?#]*:\d*(?:[/?#]|$)/iu.test(rawUrl)) {
    warnIgnoredInternalAppDomainEntry(
      trimmed,
      'explicit ports are not allowed'
    );
    return null;
  }

  // The staging issuer (`platform`) is the `tutur3u.com` apex, which serves
  // host-only cookies and sits outside the shared cookie domain: satellites
  // reach it only through the token handoff. No other app may use the apex.
  const issuerApex =
    name === 'platform' && url.hostname === STAGING_ISSUER_HOSTNAME;

  if (
    url.hostname.endsWith('.') ||
    (!issuerApex &&
      url.hostname !== override.hostname &&
      !url.hostname.endsWith(`.${override.hostname}`))
  ) {
    warnIgnoredInternalAppDomainEntry(
      trimmed,
      `host must be ${override.hostname} or a subdomain of it` +
        (name === 'platform' ? ` (or ${STAGING_ISSUER_HOSTNAME})` : '')
    );
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
 *
 * The registry only exists on the cookie-isolated staging deployment: it is
 * empty unless the shared cookie domain is the accepted override, each entry's
 * host must sit under that override's hostname, and each name must already be a
 * known app name. A production deployment therefore never acts on it, even if
 * the variable is set by mistake.
 */
export function resolveConfiguredInternalAppDomains(
  knownAppNames: ReadonlySet<string>
): AppDomain[] {
  const configured = process.env.NEXT_PUBLIC_TUTURUUU_INTERNAL_APP_DOMAINS;

  if (!configured?.trim()) {
    return [];
  }

  const override = getConfiguredSharedCookieDomainOverride();

  if (!override) {
    warnIgnoredInternalAppDomainEntry(
      configured.trim(),
      'requires the staging shared cookie domain override'
    );
    return [];
  }

  return configured
    .split(/[,\n]/u)
    .map((entry) => parseInternalAppDomainEntry(entry, override, knownAppNames))
    .filter((entry): entry is AppDomain => Boolean(entry));
}

import { resolveConfiguredInternalAppDomains } from './internal-domains-env';
import {
  getTuturuuuPortlessAppOrigin,
  TUTURUUU_PORTLESS_APP_HOSTS,
} from './portless';
import { isRetiredAppHostname, isRetiredAppUrl } from './retired-app-hosts';
import { getConfiguredSharedCookieDomainOverride } from './shared-cookie';

import {
  LOCALHOST_INTERNAL_APP_DOMAINS,
  PORTLESS_INTERNAL_APP_DOMAINS,
  PRODUCTION_INTERNAL_APP_DOMAINS,
} from './internal-domain-entries';

export {
  LOCALHOST_INTERNAL_APP_DOMAINS,
  PORTLESS_INTERNAL_APP_DOMAINS,
  PRODUCTION_INTERNAL_APP_DOMAINS,
};

export const DEV_INTERNAL_APP_DOMAINS = [
  ...PORTLESS_INTERNAL_APP_DOMAINS,
  ...LOCALHOST_INTERNAL_APP_DOMAINS,
] as const;

export const APP_DOMAIN_MAP = [
  ...PRODUCTION_INTERNAL_APP_DOMAINS,
  ...DEV_INTERNAL_APP_DOMAINS,
] as const;

export type AppName = (typeof APP_DOMAIN_MAP)[number]['name'];

export type AppDomain = {
  kind?: 'external' | 'internal';
  name: string;
  requiresExactOrigin?: boolean;
  url: string;
};

export type AppDomainUrlMatch = AppDomain & {
  canonicalUrl: string;
};

export function getPortlessInternalAppUrl(appName: AppName) {
  return appName in TUTURUUU_PORTLESS_APP_HOSTS
    ? getTuturuuuPortlessAppOrigin(
        appName as keyof typeof TUTURUUU_PORTLESS_APP_HOSTS
      )
    : null;
}

export function getLocalInternalAppUrl(appName: AppName, legacyUrl: string) {
  return getPortlessInternalAppUrl(appName) ?? legacyUrl;
}

function parseExternalAppDomainEntry(entry: string): AppDomain | null {
  const trimmed = entry.trim();

  if (!trimmed) {
    return null;
  }

  const separatorIndex = trimmed.indexOf(':');

  if (separatorIndex <= 0) {
    return null;
  }

  const name = trimmed.slice(0, separatorIndex).trim().toLowerCase();
  const url = trimmed.slice(separatorIndex + 1).trim();

  if (!/^[a-z0-9_-]{1,64}$/u.test(name)) {
    return null;
  }

  if (isRetiredAppUrl(url)) {
    return null;
  }

  try {
    return {
      kind: 'external',
      name,
      url: new URL(url).origin,
    };
  } catch {
    return null;
  }
}

export function getConfiguredExternalAppDomains(): AppDomain[] {
  const configured =
    process.env.NEXT_PUBLIC_TUTURUUU_EXTERNAL_APP_DOMAINS ??
    process.env.TUTURUUU_EXTERNAL_APP_DOMAINS;

  if (typeof configured !== 'string' || !configured.trim()) {
    return [];
  }

  return configured
    .split(/[,\n]/u)
    .map(parseExternalAppDomainEntry)
    .filter((entry): entry is AppDomain => Boolean(entry));
}

export function getConfiguredInternalAppDomains(): AppDomain[] {
  return resolveConfiguredInternalAppDomains(
    new Set<string>(APP_DOMAIN_MAP.map((domain) => domain.name))
  );
}

export function getAppDomainMap(): AppDomain[] {
  // A cookie-isolated staging deployment never trusts production app origins:
  // returns to them are cross-environment and go unresolved (rejected).
  const isolatedFromProduction = Boolean(
    getConfiguredSharedCookieDomainOverride()
  );
  const builtInDomains = isolatedFromProduction
    ? DEV_INTERNAL_APP_DOMAINS
    : APP_DOMAIN_MAP;

  return [
    ...builtInDomains.map((domain) => ({
      ...domain,
      kind: 'internal' as const,
    })),
    ...getConfiguredInternalAppDomains(),
    ...getConfiguredExternalAppDomains(),
  ];
}

function parseHttpUrl(value: string) {
  try {
    const url = new URL(value);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    if (url.username || url.password) return null;

    return url;
  } catch {
    return null;
  }
}

function canUpgradeToRegisteredHttpsOrigin(value: URL, registeredUrl: URL) {
  return (
    registeredUrl.protocol === 'https:' &&
    value.protocol === 'http:' &&
    value.hostname === registeredUrl.hostname &&
    value.port === registeredUrl.port
  );
}

const PORTLESS_APP_HOSTS = new Set(Object.values(TUTURUUU_PORTLESS_APP_HOSTS));
const DEFAULT_PORTLESS_PROXY_PORT = '1355';

function normalizePortlessProxyPort(value: string | undefined) {
  const trimmed = value?.trim();

  if (!trimmed || !/^\d+$/u.test(trimmed)) {
    return null;
  }

  const port = Number(trimmed);
  return Number.isInteger(port) && port > 0 && port <= 65535
    ? String(port)
    : null;
}

function getPortFromUrl(value: string | undefined) {
  if (!value?.trim()) {
    return null;
  }

  try {
    return normalizePortlessProxyPort(new URL(value).port);
  } catch {
    return null;
  }
}

function getAllowedPortlessProxyPorts() {
  return new Set(
    [
      DEFAULT_PORTLESS_PROXY_PORT,
      normalizePortlessProxyPort(process.env.PORTLESS_PORT),
      getPortFromUrl(process.env.PORTLESS_URL),
    ].filter((port): port is string => Boolean(port))
  );
}

function isAllowedPortlessProxyPort(port: string) {
  return getAllowedPortlessProxyPorts().has(port);
}

function canUseLocalPortlessProxyPort(value: URL, registeredUrl: URL) {
  return (
    value.protocol === registeredUrl.protocol &&
    !registeredUrl.port &&
    Boolean(value.port) &&
    isAllowedPortlessProxyPort(value.port) &&
    PORTLESS_APP_HOSTS.has(registeredUrl.hostname)
  );
}

function hasCompatiblePortlessPort(value: URL, registeredUrl: URL) {
  return (
    value.port === registeredUrl.port ||
    canUseLocalPortlessProxyPort(value, registeredUrl)
  );
}

function matchesPortlessProxyOrigin(value: URL, registeredUrl: URL) {
  return (
    canUseLocalPortlessProxyPort(value, registeredUrl) &&
    value.hostname === registeredUrl.hostname
  );
}

function matchesPrefixedPortlessOrigin(value: URL, registeredUrl: URL) {
  if (
    value.protocol !== registeredUrl.protocol ||
    !hasCompatiblePortlessPort(value, registeredUrl) ||
    !PORTLESS_APP_HOSTS.has(registeredUrl.hostname) ||
    PORTLESS_APP_HOSTS.has(value.hostname)
  ) {
    return false;
  }

  const suffix = `.${registeredUrl.hostname}`;

  if (!value.hostname.endsWith(suffix)) {
    return false;
  }

  const prefix = value.hostname.slice(0, -suffix.length);

  return Boolean(prefix) && !prefix.includes('.');
}

function serializeUrl(value: URL) {
  return value.pathname === '/' && !value.search && !value.hash
    ? value.origin
    : value.toString();
}

function matchesAppDomainUrl(value: URL, domain: AppDomain) {
  const registeredUrl = parseHttpUrl(domain.url);

  if (!registeredUrl) {
    return false;
  }

  if (value.origin === registeredUrl.origin) {
    return true;
  }

  if (domain.requiresExactOrigin) return false;

  if (
    domain.kind === 'internal' &&
    (matchesPortlessProxyOrigin(value, registeredUrl) ||
      matchesPrefixedPortlessOrigin(value, registeredUrl))
  ) {
    return true;
  }

  return domain.kind === 'internal'
    ? canUpgradeToRegisteredHttpsOrigin(value, registeredUrl)
    : false;
}

function canonicalizeAppDomainUrl(value: URL, domain: AppDomain) {
  const registeredUrl = parseHttpUrl(domain.url);
  const matchesDirectPortlessProxy =
    registeredUrl &&
    domain.kind === 'internal' &&
    matchesPortlessProxyOrigin(value, registeredUrl);
  const matchesPrefixedPortlessProxy =
    registeredUrl &&
    domain.kind === 'internal' &&
    matchesPrefixedPortlessOrigin(value, registeredUrl);

  if (
    registeredUrl &&
    domain.kind === 'internal' &&
    (canUpgradeToRegisteredHttpsOrigin(value, registeredUrl) ||
      matchesDirectPortlessProxy ||
      matchesPrefixedPortlessProxy)
  ) {
    const canonicalUrl = new URL(value.toString());
    canonicalUrl.protocol = registeredUrl.protocol;
    canonicalUrl.hostname = matchesPrefixedPortlessProxy
      ? value.hostname
      : registeredUrl.hostname;
    canonicalUrl.port = registeredUrl.port;
    return serializeUrl(canonicalUrl);
  }

  return serializeUrl(value);
}

export function getAppDomainByUrl(value: string): AppDomainUrlMatch | null {
  const url = parseHttpUrl(value);

  if (!url || isRetiredAppHostname(url.hostname)) {
    return null;
  }

  const domain = getAppDomainMap().find((entry) =>
    matchesAppDomainUrl(url, entry)
  );

  return domain
    ? {
        ...domain,
        canonicalUrl: canonicalizeAppDomainUrl(url, domain),
      }
    : null;
}

export function getInternalAppDomainByUrl(
  value: string
): AppDomainUrlMatch | null {
  const appDomain = getAppDomainByUrl(value);

  return appDomain?.kind === 'internal' ? appDomain : null;
}

export const INTERNAL_DOMAINS = [
  ...PRODUCTION_INTERNAL_APP_DOMAINS,
  ...DEV_INTERNAL_APP_DOMAINS,
].map((domain) => domain.url);

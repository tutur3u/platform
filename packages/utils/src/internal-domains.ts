import {
  getTuturuuuPortlessAppOrigin,
  TUTURUUU_PORTLESS_APP_HOSTS,
} from './portless';

export const PRODUCTION_INTERNAL_APP_DOMAINS = [
  {
    name: 'apps',
    url: 'https://apps.tuturuuu.com',
  },
  {
    name: 'platform',
    url: 'https://tuturuuu.com',
  },
  {
    name: 'cms',
    url: 'https://cms.tuturuuu.com',
  },
  {
    name: 'docs',
    url: 'https://docs.tuturuuu.com',
  },
  {
    name: 'calendar',
    url: 'https://calendar.tuturuuu.com',
  },
  {
    name: 'chat',
    url: 'https://chat.tuturuuu.com',
  },
  {
    name: 'drive',
    url: 'https://drive.tuturuuu.com',
  },
  {
    name: 'mail',
    url: 'https://mail.tuturuuu.com',
  },
  {
    name: 'meet',
    url: 'https://meet.tuturuuu.com',
  },
  {
    name: 'qr',
    url: 'https://qr.tuturuuu.com',
  },
  {
    name: 'tools',
    url: 'https://tools.tuturuuu.com',
  },
  {
    name: 'nova',
    url: 'https://nova.ai.vn',
  },
  {
    name: 'mira',
    url: 'https://mira.tuturuuu.com',
  },
  {
    name: 'rewise',
    url: 'https://rewise.me',
  },
  {
    name: 'tasks',
    url: 'https://tasks.tuturuuu.com',
  },
  {
    name: 'finance',
    url: 'https://finance.tuturuuu.com',
  },
  {
    name: 'infra',
    url: 'https://infrastructure.tuturuuu.com',
  },
  {
    name: 'infra',
    url: 'https://infra.tuturuuu.com',
  },
  {
    name: 'inventory',
    url: 'https://inventory.tuturuuu.com',
  },
  {
    name: 'storefront',
    url: 'https://storefront.tuturuuu.com',
  },
  {
    name: 'tanstack-web',
    url: 'https://tanstack.tuturuuu.com',
  },
  {
    name: 'track',
    url: 'https://track.tuturuuu.com',
  },
  {
    name: 'learn',
    url: 'https://learn.tuturuuu.com',
  },
  {
    name: 'teach',
    url: 'https://teach.tuturuuu.com',
  },
  {
    name: 'pay',
    url: 'https://pay.tuturuuu.com',
  },
  {
    name: 'contacts',
    url: 'https://contacts.tuturuuu.com',
  },
  {
    name: 'hive',
    url: 'https://hive.tuturuuu.com',
  },
  {
    name: 'mind',
    url: 'https://mind.tuturuuu.com',
  },
] as const;

export const PORTLESS_INTERNAL_APP_DOMAINS = [
  {
    name: 'apps',
    url: getTuturuuuPortlessAppOrigin('apps'),
  },
  {
    name: 'platform',
    url: getTuturuuuPortlessAppOrigin('platform'),
  },
  {
    name: 'cms',
    url: getTuturuuuPortlessAppOrigin('cms'),
  },
  {
    name: 'docs',
    url: getTuturuuuPortlessAppOrigin('docs'),
  },
  {
    name: 'calendar',
    url: getTuturuuuPortlessAppOrigin('calendar'),
  },
  {
    name: 'chat',
    url: getTuturuuuPortlessAppOrigin('chat'),
  },
  {
    name: 'drive',
    url: getTuturuuuPortlessAppOrigin('drive'),
  },
  {
    name: 'mail',
    url: getTuturuuuPortlessAppOrigin('mail'),
  },
  {
    name: 'meet',
    url: getTuturuuuPortlessAppOrigin('meet'),
  },
  {
    name: 'qr',
    url: getTuturuuuPortlessAppOrigin('qr'),
  },
  {
    name: 'tools',
    url: getTuturuuuPortlessAppOrigin('tools'),
  },
  {
    name: 'nova',
    url: getTuturuuuPortlessAppOrigin('nova'),
  },
  {
    name: 'rewise',
    url: getTuturuuuPortlessAppOrigin('rewise'),
  },
  {
    name: 'tasks',
    url: getTuturuuuPortlessAppOrigin('tasks'),
  },
  {
    name: 'finance',
    url: getTuturuuuPortlessAppOrigin('finance'),
  },
  {
    name: 'infra',
    url: getTuturuuuPortlessAppOrigin('infra'),
  },
  {
    name: 'inventory',
    url: getTuturuuuPortlessAppOrigin('inventory'),
  },
  {
    name: 'storefront',
    url: getTuturuuuPortlessAppOrigin('storefront'),
  },
  {
    name: 'tanstack-web',
    url: getTuturuuuPortlessAppOrigin('tanstack-web'),
  },
  {
    name: 'track',
    url: getTuturuuuPortlessAppOrigin('track'),
  },
  {
    name: 'learn',
    url: getTuturuuuPortlessAppOrigin('learn'),
  },
  {
    name: 'teach',
    url: getTuturuuuPortlessAppOrigin('teach'),
  },
  {
    name: 'pay',
    url: getTuturuuuPortlessAppOrigin('pay'),
  },
  {
    name: 'contacts',
    url: getTuturuuuPortlessAppOrigin('contacts'),
  },
  {
    name: 'hive',
    url: getTuturuuuPortlessAppOrigin('hive'),
  },
  {
    name: 'mind',
    url: getTuturuuuPortlessAppOrigin('mind'),
  },
] as const;

export const LOCALHOST_INTERNAL_APP_DOMAINS = [
  {
    name: 'apps',
    url: 'http://localhost:7818',
  },
  {
    name: 'cms',
    url: 'http://localhost:7811',
  },
  {
    name: 'calendar',
    url: 'http://localhost:7806',
  },
  {
    name: 'chat',
    url: 'http://localhost:7821',
  },
  {
    name: 'drive',
    url: 'http://localhost:7817',
  },
  {
    name: 'mail',
    url: 'http://localhost:7820',
  },
  {
    name: 'meet',
    url: 'http://localhost:7807',
  },
  {
    name: 'qr',
    url: 'http://localhost:7819',
  },
  {
    name: 'tools',
    url: 'http://localhost:7825',
  },
  {
    name: 'platform',
    url: 'http://localhost:7803',
  },
  {
    name: 'rewise',
    url: 'http://localhost:7804',
  },
  {
    name: 'nova',
    url: 'http://localhost:7805',
  },
  {
    name: 'tasks',
    url: 'http://localhost:7809',
  },
  {
    name: 'finance',
    url: 'http://localhost:7808',
  },
  {
    name: 'infra',
    url: 'http://localhost:7823',
  },
  {
    name: 'inventory',
    url: 'http://localhost:7815',
  },
  {
    name: 'storefront',
    url: 'http://localhost:7822',
  },
  {
    name: 'tanstack-web',
    url: 'http://localhost:7824',
  },
  {
    name: 'track',
    url: 'http://localhost:7810',
  },
  {
    name: 'learn',
    url: 'http://localhost:7812',
  },
  {
    name: 'teach',
    url: 'http://localhost:7813',
  },
  {
    name: 'pay',
    url: 'http://localhost:7826',
  },
  {
    name: 'contacts',
    url: 'http://localhost:7827',
  },
  {
    name: 'hive',
    url: 'http://localhost:7814',
  },
  {
    name: 'mind',
    url: 'http://localhost:7816',
  },
] as const;

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

  if (!configured?.trim()) {
    return [];
  }

  return configured
    .split(/[,\n]/u)
    .map(parseExternalAppDomainEntry)
    .filter((entry): entry is AppDomain => Boolean(entry));
}

export function getAppDomainMap(): AppDomain[] {
  return [
    ...APP_DOMAIN_MAP.map((domain) => ({
      ...domain,
      kind: 'internal' as const,
    })),
    ...getConfiguredExternalAppDomains(),
  ];
}

function parseHttpUrl(value: string) {
  try {
    const url = new URL(value);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

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

  if (!url) {
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

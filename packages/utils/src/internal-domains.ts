import { getTuturuuuPortlessAppOrigin } from './portless';

export const PRODUCTION_INTERNAL_APP_DOMAINS = [
  {
    name: 'platform',
    url: 'https://tuturuuu.com',
  },
  {
    name: 'cms',
    url: 'https://cms.tuturuuu.com',
  },
  {
    name: 'calendar',
    url: 'https://calendar.tuturuuu.com',
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
    name: 'tudo',
    url: 'https://tasks.tuturuuu.com',
  },
  {
    name: 'finance',
    url: 'https://finance.tuturuuu.com',
  },
  {
    name: 'inventory',
    url: 'https://inventory.tuturuuu.com',
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
    name: 'hive',
    url: 'https://hive.tuturuuu.com',
  },
] as const;

export const PORTLESS_INTERNAL_APP_DOMAINS = [
  {
    name: 'platform',
    url: getTuturuuuPortlessAppOrigin('platform'),
  },
  {
    name: 'cms',
    url: getTuturuuuPortlessAppOrigin('cms'),
  },
  {
    name: 'calendar',
    url: getTuturuuuPortlessAppOrigin('calendar'),
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
    name: 'tudo',
    url: getTuturuuuPortlessAppOrigin('tasks'),
  },
  {
    name: 'finance',
    url: getTuturuuuPortlessAppOrigin('finance'),
  },
  {
    name: 'inventory',
    url: getTuturuuuPortlessAppOrigin('inventory'),
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
    name: 'hive',
    url: getTuturuuuPortlessAppOrigin('hive'),
  },
] as const;

export const LOCALHOST_INTERNAL_APP_DOMAINS = [
  {
    name: 'cms',
    url: 'http://localhost:7811',
  },
  {
    name: 'calendar',
    url: 'http://localhost:7806',
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
    name: 'tudo',
    url: 'http://localhost:7809',
  },
  {
    name: 'finance',
    url: 'http://localhost:7808',
  },
  {
    name: 'inventory',
    url: 'http://localhost:7815',
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
    name: 'hive',
    url: 'http://localhost:7814',
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

export function getPortlessInternalAppUrl(appName: AppName) {
  return (
    PORTLESS_INTERNAL_APP_DOMAINS.find((domain) => domain.name === appName)
      ?.url ?? null
  );
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

export const INTERNAL_DOMAINS = [
  ...PRODUCTION_INTERNAL_APP_DOMAINS,
  ...DEV_INTERNAL_APP_DOMAINS,
].map((domain) => domain.url);

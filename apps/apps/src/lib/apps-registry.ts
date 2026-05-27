import { getTuturuuuPortlessAppOrigin } from '@tuturuuu/utils/portless';

export const APP_CATEGORIES = [
  'core',
  'productivity',
  'content',
  'operations',
  'learning',
  'developer',
  'ai',
] as const;

export type AppCategory = (typeof APP_CATEGORIES)[number];

export type GatewayApp = {
  appRoot: string;
  category: AppCategory;
  packageName: string;
  portlessApp: Parameters<typeof getTuturuuuPortlessAppOrigin>[0];
  productionUrl: string;
  slug: string;
  title: string;
};

export const GATEWAY_APPS = [
  {
    appRoot: 'apps/web',
    category: 'core',
    packageName: '@tuturuuu/web',
    portlessApp: 'platform',
    productionUrl: 'https://tuturuuu.com',
    slug: 'platform',
    title: 'Platform',
  },
  {
    appRoot: 'apps/calendar',
    category: 'productivity',
    packageName: '@tuturuuu/calendar',
    portlessApp: 'calendar',
    productionUrl: 'https://calendar.tuturuuu.com',
    slug: 'calendar',
    title: 'Calendar',
  },
  {
    appRoot: 'apps/cms',
    category: 'content',
    packageName: '@tuturuuu/cms',
    portlessApp: 'cms',
    productionUrl: 'https://cms.tuturuuu.com',
    slug: 'cms',
    title: 'CMS',
  },
  {
    appRoot: 'apps/drive',
    category: 'productivity',
    packageName: '@tuturuuu/drive',
    portlessApp: 'drive',
    productionUrl: 'https://drive.tuturuuu.com',
    slug: 'drive',
    title: 'Drive',
  },
  {
    appRoot: 'apps/external',
    category: 'developer',
    packageName: '@tuturuuu/external',
    portlessApp: 'external',
    productionUrl: 'https://external.tuturuuu.com',
    slug: 'external',
    title: 'External',
  },
  {
    appRoot: 'apps/finance',
    category: 'operations',
    packageName: '@tuturuuu/finance',
    portlessApp: 'finance',
    productionUrl: 'https://finance.tuturuuu.com',
    slug: 'finance',
    title: 'Finance',
  },
  {
    appRoot: 'apps/hive',
    category: 'ai',
    packageName: '@tuturuuu/hive',
    portlessApp: 'hive',
    productionUrl: 'https://hive.tuturuuu.com',
    slug: 'hive',
    title: 'Hive',
  },
  {
    appRoot: 'apps/inventory',
    category: 'operations',
    packageName: '@tuturuuu/inventory',
    portlessApp: 'inventory',
    productionUrl: 'https://inventory.tuturuuu.com',
    slug: 'inventory',
    title: 'Inventory',
  },
  {
    appRoot: 'apps/learn',
    category: 'learning',
    packageName: '@tuturuuu/learn',
    portlessApp: 'learn',
    productionUrl: 'https://learn.tuturuuu.com',
    slug: 'learn',
    title: 'Learn',
  },
  {
    appRoot: 'apps/mail',
    category: 'productivity',
    packageName: '@tuturuuu/mail',
    portlessApp: 'mail',
    productionUrl: 'https://mail.tuturuuu.com',
    slug: 'mail',
    title: 'Mail',
  },
  {
    appRoot: 'apps/meet',
    category: 'productivity',
    packageName: '@tuturuuu/meet',
    portlessApp: 'meet',
    productionUrl: 'https://tumeet.me',
    slug: 'meet',
    title: 'Meet',
  },
  {
    appRoot: 'apps/mind',
    category: 'ai',
    packageName: '@tuturuuu/mind',
    portlessApp: 'mind',
    productionUrl: 'https://mind.tuturuuu.com',
    slug: 'mind',
    title: 'Mind',
  },
  {
    appRoot: 'apps/nova',
    category: 'ai',
    packageName: '@tuturuuu/nova',
    portlessApp: 'nova',
    productionUrl: 'https://nova.ai.vn',
    slug: 'nova',
    title: 'Nova',
  },
  {
    appRoot: 'apps/playground',
    category: 'developer',
    packageName: '@tuturuuu/playground',
    portlessApp: 'playground',
    productionUrl: 'https://playground.tuturuuu.com',
    slug: 'playground',
    title: 'Playground',
  },
  {
    appRoot: 'apps/qr',
    category: 'developer',
    packageName: '@tuturuuu/qr',
    portlessApp: 'qr',
    productionUrl: 'https://qr.tuturuuu.com',
    slug: 'qr',
    title: 'QR',
  },
  {
    appRoot: 'apps/rewise',
    category: 'learning',
    packageName: '@tuturuuu/rewise',
    portlessApp: 'rewise',
    productionUrl: 'https://rewise.me',
    slug: 'rewise',
    title: 'Rewise',
  },
  {
    appRoot: 'apps/shortener',
    category: 'developer',
    packageName: '@tuturuuu/shortener',
    portlessApp: 'shortener',
    productionUrl: 'https://shortener.tuturuuu.com',
    slug: 'shortener',
    title: 'Shortener',
  },
  {
    appRoot: 'apps/tasks',
    category: 'productivity',
    packageName: '@tuturuuu/tasks',
    portlessApp: 'tasks',
    productionUrl: 'https://tasks.tuturuuu.com',
    slug: 'tasks',
    title: 'Tasks',
  },
  {
    appRoot: 'apps/teach',
    category: 'learning',
    packageName: '@tuturuuu/teach',
    portlessApp: 'teach',
    productionUrl: 'https://teach.tuturuuu.com',
    slug: 'teach',
    title: 'Teach',
  },
  {
    appRoot: 'apps/track',
    category: 'productivity',
    packageName: '@tuturuuu/track',
    portlessApp: 'track',
    productionUrl: 'https://track.tuturuuu.com',
    slug: 'track',
    title: 'Track',
  },
] as const satisfies GatewayApp[];

export type GatewayAppSlug = (typeof GATEWAY_APPS)[number]['slug'];

export function getGatewayApp(slug: string) {
  return GATEWAY_APPS.find((app) => app.slug === slug) ?? null;
}

export function getGatewayAppOrigin(app: GatewayApp) {
  return process.env.NODE_ENV === 'production'
    ? app.productionUrl
    : getTuturuuuPortlessAppOrigin(app.portlessApp);
}

function trimTrailingSlashes(value: string) {
  let end = value.length;

  while (end > 0 && value.charCodeAt(end - 1) === 47) {
    end -= 1;
  }

  return end === value.length ? value : value.slice(0, end);
}

export function buildGatewayRedirectUrl({
  app,
  path = [],
  searchParams,
}: {
  app: GatewayApp;
  path?: string[];
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const url = new URL(getGatewayAppOrigin(app));
  const suffix = path.map((segment) => encodeURIComponent(segment)).join('/');

  if (suffix) {
    url.pathname = `${trimTrailingSlashes(url.pathname)}/${suffix}`;
  }

  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, item);
      }
      continue;
    }

    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}

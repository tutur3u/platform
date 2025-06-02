export const PRODUCTION_INTERNAL_APP_DOMAINS = [
  {
    name: 'platform',
    url: 'https://tuturuuu.com',
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
    name: 'upskii',
    url: 'https://upskii.com',
  },
  {
    name: 'famigo',
    url: 'https://famigo.vercel.app',
  },
] as const;

export const DEV_INTERNAL_APP_DOMAINS = [
  {
    name: 'calendar',
    url: 'http://localhost:7001',
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
    name: 'upskii',
    url: 'http://localhost:7806',
  },
  {
    name: 'famigo',
    url: 'http://localhost:7807',
  },
] as const;

export const APP_DOMAIN_MAP = [
  ...PRODUCTION_INTERNAL_APP_DOMAINS,
  ...DEV_INTERNAL_APP_DOMAINS,
] as const;

export type AppName = (typeof APP_DOMAIN_MAP)[number]['name'];

export const INTERNAL_DOMAINS = [
  ...PRODUCTION_INTERNAL_APP_DOMAINS,
  ...DEV_INTERNAL_APP_DOMAINS,
].map((domain) => domain.url);

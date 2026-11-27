import { getTuturuuuPortlessAppOrigin } from './portless';

/**
 * The registered app origins: production, Portless and localhost. Split from
 * `internal-domains.ts` so registering an app does not grow the resolver.
 */
export const PRODUCTION_INTERNAL_APP_DOMAINS = [
  { name: 'parley', url: 'https://parley.tuturuuu.com' },
  { name: 'lettin', url: 'https://lettin.tuturuuu.com' },
  { name: 'colab', url: 'https://colab.tuturuuu.com' },
  {
    name: 'ai',
    url: 'https://ai.tuturuuu.com',
  },
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
    url: 'https://nova.tuturuuu.com',
  },
  { name: 'nova', url: 'https://nova.ai.vn', requiresExactOrigin: true },
  {
    name: 'mira',
    url: 'https://mira.tuturuuu.com',
  },
  {
    name: 'rewise',
    url: 'https://rewise.tuturuuu.com',
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
    name: 'whiteboards',
    url: 'https://whiteboards.tuturuuu.com',
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
    name: 'forms',
    url: 'https://forms.tuturuuu.com',
  },
  {
    name: 'git',
    url: 'https://git.tuturuuu.com',
  },
  {
    name: 'hive',
    url: 'https://hive.tuturuuu.com',
  },
  {
    name: 'mind',
    url: 'https://mind.tuturuuu.com',
  },
  {
    name: 'workspace',
    url: 'https://workspace.tuturuuu.com',
  },
  {
    name: 'worlds',
    url: 'https://worlds.tuturuuu.com',
    requiresExactOrigin: true,
  },
  { name: 'mastermind', url: 'https://mastermind.tuturuuu.com' },
] as const;

export const PORTLESS_INTERNAL_APP_DOMAINS = [
  { name: 'parley', url: getTuturuuuPortlessAppOrigin('parley') },
  { name: 'lettin', url: getTuturuuuPortlessAppOrigin('lettin') },
  { name: 'colab', url: getTuturuuuPortlessAppOrigin('colab') },
  {
    name: 'ai',
    url: getTuturuuuPortlessAppOrigin('ai'),
  },
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
    name: 'whiteboards',
    url: getTuturuuuPortlessAppOrigin('whiteboards'),
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
    name: 'forms',
    url: getTuturuuuPortlessAppOrigin('forms'),
  },
  {
    name: 'git',
    url: getTuturuuuPortlessAppOrigin('git'),
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
  { name: 'parley', url: 'http://localhost:7834' },
  { name: 'lettin', url: 'http://localhost:7833' },
  { name: 'colab', url: 'http://localhost:8795' },
  {
    name: 'ai',
    url: 'http://localhost:7829',
  },
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
    name: 'whiteboards',
    url: 'http://localhost:7837',
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
    name: 'forms',
    url: 'http://localhost:7828',
  },
  {
    name: 'git',
    url: 'http://localhost:7830',
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

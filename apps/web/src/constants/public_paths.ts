import { supportedLocales } from '@/i18n/routing';

export const APP_PUBLIC_PATHS = [
  '/account/delete',
  '/invite',
  '/email-appeals',
  '/api/v1/email-appeals/confirm',
  '/api/v1/email-appeals/preview',
  '/api/v1/email-appeals/recipient',
  '/api/v1/webhooks/email/appeals',
  '/home',
  '/login',
  '/logout',
  '/pricing',
  '/roadmap',
  '/pitch',
  '/portfolio',
  '/about',
  '/download',
  '/contact',
  '/features',
  '/products',
  '/solutions',
  '/careers',
  '/partners',
  '/models',
  '/security',
  '/security/bug-bounty',
  '/contributors',
  '/blog',
  '/faq',
  '/legal',
  '/terms',
  '/privacy',
  '/community-guidelines',
  '/acceptable-use',
  '/branding',
  '/changelog',
  '/ai/chats',
  '/facebook-mockup',
  '/qr-generator',
  '/signup',
  '/docs',
  '/documents',
  '/share',
  '/tools',
  '/ui',
  '/u',
  // Forms moved to forms.tuturuuu.com/f/<shareCode>. This path no longer
  // renders anything, but already-distributed links still arrive here and are
  // permanently redirected — it must stay public so anonymous respondents and
  // social crawlers are never bounced to /login first.
  '/shared/forms',
  '/meet',
  '/meet-together',
  '/women-in-tech',
  '/vietnamese-womens-day',
  '/visualizations/horse-racing',
].reduce((acc: string[], path) => {
  // Add the original path
  acc.push(path);

  // Add localized paths
  const localizedPaths = supportedLocales.map((locale) => `/${locale}${path}`);
  acc.push(...localizedPaths);

  return acc;
}, []);

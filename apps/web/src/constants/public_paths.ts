import { supportedLocales } from '@/i18n/routing';

export const APP_PUBLIC_PATHS = [
  '/account/delete',
  '/invite',
  '/home',
  '/login',
  '/logout',
  '/pricing',
  '/about',
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
  '/terms',
  '/privacy',
  '/community-guidelines',
  '/acceptable-use',
  '/branding',
  '/changelog',
  '/ai/chats',
  '/facebook-mockup',
  '/qr-generator',
  '/docs',
  '/documents',
  '/share',
  '/tools',
  '/ui',
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

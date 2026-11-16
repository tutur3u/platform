import { getInternalAppDomainByUrl } from './internal-domains';
import { getTuturuuuSharedCookieDomains } from './shared-cookie';

const LOGOUT_APPS = new Set([
  'ai',
  'calendar',
  'chat',
  'cms',
  'contacts',
  'drive',
  'finance',
  'forms',
  'git',
  'hive',
  'infra',
  'inventory',
  'learn',
  'lettin',
  'mail',
  'meet',
  'mind',
  'nova',
  'parley',
  'pay',
  'rewise',
  'storefront',
  'tasks',
  'teach',
  'track',
]);

export interface LogoutTarget {
  name: string;
  origin: string;
}

export function resolveLogoutTarget({
  appUrl,
  centralOrigin,
}: {
  appUrl: string | undefined;
  centralOrigin: string;
}): LogoutTarget | null {
  if (!appUrl) return null;
  try {
    const url = new URL(appUrl);
    if (url.protocol !== 'https:') return null;
    const central = new URL(centralOrigin);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/'
    )
      return null;
    // Ports share cookies; an app mounted on the central host cannot log out in isolation.
    if (url.hostname === central.hostname) return null;
    const onDomain = (hostname: string, domain: string) =>
      hostname === domain || hostname.endsWith(`.${domain}`);
    if (
      !getTuturuuuSharedCookieDomains().some(
        ({ hostname }) =>
          onDomain(url.hostname, hostname) &&
          onDomain(central.hostname, hostname)
      )
    )
      return null;
    const app = getInternalAppDomainByUrl(url.origin);
    if (!app || !LOGOUT_APPS.has(app.name)) return null;
    const origin = new URL(app.canonicalUrl).origin;
    if (origin !== url.origin) return null;
    const name =
      app.name === 'infra'
        ? 'Infrastructure'
        : app.name === 'ai'
          ? 'AI Studio'
          : app.name === 'cms'
            ? 'CMS'
            : app.name.charAt(0).toUpperCase() + app.name.slice(1);
    return { name, origin };
  } catch {
    return null;
  }
}

export function createLogoutConfirmationUrl({
  centralUrl,
  appOrigin,
  locale,
}: {
  centralUrl: string;
  appOrigin: string;
  locale: string | undefined;
}) {
  const url = new URL(locale === 'vi' ? '/vi/logout' : '/logout', centralUrl);
  url.searchParams.set('appUrl', appOrigin);
  return url.toString();
}

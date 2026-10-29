import { getTuturuuuSharedCookieDomains } from '../shared-cookie-domains';

const hosts = new Set([
  'staging.tutur3u.com',
  'meet.staging.tutur3u.com',
  'calendar.staging.tutur3u.com',
  'mail.staging.tutur3u.com',
  'apps.staging.tutur3u.com',
  'web.staging.tutur3u.com',
]);

export function stagingCookieDomain(value: string | URL | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const accepted = getTuturuuuSharedCookieDomains().find(
      (entry) => entry.cookieDomain === '.staging.tutur3u.com'
    );
    return accepted &&
      url.protocol === 'https:' &&
      !url.port &&
      hosts.has(url.hostname)
      ? ({
          cookieDomain: '.staging.tutur3u.com',
          hostname: 'staging.tutur3u.com',
          secure: true,
        } as const)
      : null;
  } catch {
    return null;
  }
}

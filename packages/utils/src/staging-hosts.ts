/** Exact staging app identities; reserved service names are deliberately absent. */
export const STAGING_APP_LABELS = [
  'web',
  'ai',
  'apps',
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
  'infrastructure',
  'inventory',
  'learn',
  'lettin',
  'mail',
  'meet',
  'mind',
  'mira',
  'nova',
  'parley',
  'pay',
  'qr',
  'rewise',
  'storefront',
  'tanstack',
  'tasks',
  'teach',
  'tools',
  'track',
  'colab',
] as const;
const hosts = new Set<string>(
  STAGING_APP_LABELS.map((label) => `${label}.tutur3u.com`)
);
export function isStagingAppHostname(host: string) {
  return hosts.has(host);
}
export function isStagingAppOrigin(origin: string) {
  try {
    const url = new URL(origin);
    return (
      url.protocol === 'https:' &&
      !url.port &&
      origin === url.origin &&
      isStagingAppHostname(url.hostname)
    );
  } catch {
    return false;
  }
}

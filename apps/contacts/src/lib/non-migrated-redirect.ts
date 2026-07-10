import { WEB_APP_URL } from '@/constants/common';

/**
 * Builds the equivalent apps/web dashboard URL for a workspace route that
 * apps/contacts does not (yet) own. Contacts only ships a subset of the
 * `/[wsId]/users/*` surface; any other dashboard route is served by apps/web,
 * so catch-all routes redirect the browser there instead of returning a 404.
 *
 * Migrated routes always win via Next.js route specificity, so this only ever
 * runs for routes contacts genuinely does not have — no allowlist to maintain.
 */
export function buildWebDashboardRedirectUrl({
  locale,
  wsId,
  segments = [],
  searchParams = {},
}: {
  locale: string;
  wsId: string;
  segments?: string[];
  searchParams?: Record<string, string | string[] | undefined>;
}): string {
  const path = [locale, wsId, ...segments]
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  const url = new URL(`/${path}`, WEB_APP_URL);

  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      for (const entry of value) url.searchParams.append(key, entry);
    } else if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}

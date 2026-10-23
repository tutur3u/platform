import type { LinkClickRecord, ShortLinkStore } from './store';

/** The subset of Cloudflare `request.cf` used for click geolocation. */
export interface ClickGeolocation {
  country?: string;
  region?: string;
  regionCode?: string;
  city?: string;
  latitude?: string;
  longitude?: string;
  timezone?: string;
  postalCode?: string;
}

function coordinate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Build one click row. Vercel geolocation headers keep their meaning while a
 * request still reaches the legacy origin; on Cloudflare the trusted `cf`
 * object supplies the same columns and the Vercel-only columns stay null.
 */
export function clickRecord(
  linkId: string,
  headers: Headers,
  cf?: ClickGeolocation
): LinkClickRecord {
  const header = (name: string) => headers.get(name) || null;
  const vercelId = header('x-vercel-id');
  // Cloudflare appends to a client-supplied X-Forwarded-For, so prefer its own
  // connecting address there; the legacy header order applies elsewhere.
  const ip =
    (cf ? header('cf-connecting-ip') : null) ||
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    header('x-real-ip');
  return {
    link_id: linkId,
    ip_address: ip || null,
    user_agent: header('user-agent'),
    referrer: header('referer') ?? header('referrer'),
    country: header('x-vercel-ip-country') ?? cf?.country ?? null,
    country_region:
      header('x-vercel-ip-country-region') ?? cf?.regionCode ?? null,
    city: header('x-vercel-ip-city') ?? cf?.city ?? null,
    latitude: coordinate(header('x-vercel-ip-latitude') ?? cf?.latitude),
    longitude: coordinate(header('x-vercel-ip-longitude') ?? cf?.longitude),
    timezone: header('x-vercel-ip-timezone') ?? cf?.timezone ?? null,
    postal_code: header('x-vercel-ip-postal-code') ?? cf?.postalCode ?? null,
    vercel_region: vercelId?.split('::')[0] || null,
    vercel_id: vercelId,
  };
}

/** Analytics failures are logged and never block the redirect or response. */
export async function trackClick(
  store: ShortLinkStore,
  record: LinkClickRecord
) {
  try {
    await store.recordClick(record);
  } catch (error) {
    console.error('Failed to track link click analytics:', error);
  }
}

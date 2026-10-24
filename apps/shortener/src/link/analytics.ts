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
 * Build one click row. On Cloudflare the trusted `cf` object and
 * `cf-connecting-ip` are the only geolocation and address sources: client-sent
 * `x-vercel-*` and `x-forwarded-for` headers are ignored there, and the
 * Vercel-only columns stay null. Without `cf` (the legacy Vercel origin), the
 * Vercel edge headers keep their meaning.
 */
export function clickRecord(
  linkId: string,
  headers: Headers,
  cf?: ClickGeolocation
): LinkClickRecord {
  const header = (name: string) => headers.get(name) || null;
  const common = {
    link_id: linkId,
    user_agent: header('user-agent'),
    referrer: header('referer') ?? header('referrer'),
  };
  if (cf)
    return {
      ...common,
      ip_address: header('cf-connecting-ip'),
      country: cf.country ?? null,
      country_region: cf.regionCode ?? null,
      city: cf.city ?? null,
      latitude: coordinate(cf.latitude),
      longitude: coordinate(cf.longitude),
      timezone: cf.timezone ?? null,
      postal_code: cf.postalCode ?? null,
      vercel_region: null,
      vercel_id: null,
    };
  const vercelId = header('x-vercel-id');
  const ip =
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    header('x-real-ip');
  return {
    ...common,
    ip_address: ip || null,
    country: header('x-vercel-ip-country'),
    country_region: header('x-vercel-ip-country-region'),
    city: header('x-vercel-ip-city'),
    latitude: coordinate(header('x-vercel-ip-latitude')),
    longitude: coordinate(header('x-vercel-ip-longitude')),
    timezone: header('x-vercel-ip-timezone'),
    postal_code: header('x-vercel-ip-postal-code'),
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

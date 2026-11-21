import { isNavigableDestination, locationHeaderValue } from './destination';
import type { ShortLinkStore } from './store';

export type ShortLinkPage =
  | { kind: 'not-found' }
  | { kind: 'invalid' }
  | { kind: 'password'; linkId: string; slug: string; hint: string | null };

export type ShortLinkResolution =
  | ShortLinkPage
  | { kind: 'redirect'; linkId: string; location: string };

/** True when a stored expiry is unreadable or no later than `now`. */
export function isExpired(expiresAt: string | null | undefined, now: number) {
  if (!expiresAt) return false;
  const at = Date.parse(expiresAt);
  return !Number.isFinite(at) || at <= now;
}

/**
 * Resolve a slug exactly as stored: custom aliases and generated slugs share
 * one case-sensitive lookup, and the destination is never rewritten. An
 * expired link resolves as missing.
 */
export async function resolveShortLink(
  store: ShortLinkStore,
  slug: string,
  now: number = Date.now()
): Promise<ShortLinkResolution> {
  const link = await store.findBySlug(slug);
  if (!link || isExpired(link.expires_at, now)) return { kind: 'not-found' };
  if (!isNavigableDestination(link.link)) return { kind: 'invalid' };
  if (link.password_hash) {
    return {
      kind: 'password',
      linkId: link.id,
      slug,
      hint: link.password_hint,
    };
  }
  return {
    kind: 'redirect',
    linkId: link.id,
    location: locationHeaderValue(link.link),
  };
}

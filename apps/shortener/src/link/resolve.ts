import { isNavigableDestination, locationHeaderValue } from './destination';
import type { ShortLinkStore } from './store';

export type ShortLinkPage =
  | { kind: 'not-found' }
  | { kind: 'invalid' }
  | { kind: 'password'; linkId: string; slug: string; hint: string | null };

export type ShortLinkResolution =
  | ShortLinkPage
  | { kind: 'redirect'; linkId: string; location: string };

/**
 * Resolve a slug exactly as stored: custom aliases and generated slugs share
 * one case-sensitive lookup, and the destination is never rewritten.
 */
export async function resolveShortLink(
  store: ShortLinkStore,
  slug: string
): Promise<ShortLinkResolution> {
  const link = await store.findBySlug(slug);
  if (!link) return { kind: 'not-found' };
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

import { getPublicProfileUrl } from './public-profile-url';

const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type PublicContentLink =
  | { type: 'profile'; username: string }
  | { type: 'notebook'; worldId: string; entryId?: string };
/** Routing only. The caller must supply an already-public content projection. */
export function getPublicContentLink(
  content: PublicContentLink
): string | null {
  if (content.type === 'profile') return getPublicProfileUrl(content.username);
  if (
    !guid.test(content.worldId) ||
    (content.entryId !== undefined && !guid.test(content.entryId))
  )
    return null;
  const url = new URL(
    `/worlds/${content.worldId.toLowerCase()}`,
    'https://lettin.tuturuuu.com'
  );
  if (content.entryId)
    url.searchParams.set('entry', content.entryId.toLowerCase());
  return url.href;
}
/** Reject private paths, arbitrary destinations and accidental actor/tracking query values. */
export function safePublicContentLink(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password || url.hash) return null;
    if (url.origin === 'https://tuturuuu.com' && !url.search) {
      const match = /^\/u\/([a-zA-Z0-9_]{1,100})$/.exec(url.pathname);
      return match
        ? getPublicContentLink({ type: 'profile', username: match[1]! })
        : null;
    }
    if (url.origin !== 'https://lettin.tuturuuu.com') return null;
    const match = /^\/worlds\/([^/]+)$/.exec(url.pathname);
    if (
      !match ||
      [...url.searchParams.keys()].some((key) => key !== 'entry') ||
      url.searchParams.getAll('entry').length > 1
    )
      return null;
    return getPublicContentLink({
      type: 'notebook',
      worldId: match[1]!,
      entryId: url.searchParams.has('entry')
        ? url.searchParams.get('entry')!
        : undefined,
    });
  } catch {
    return null;
  }
}

const origin = 'https://tuturuuu.com';
export const wikiSpaceSlugPattern = /^[a-z0-9][a-z0-9-]{1,62}$/;
export const wikiPageSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const segment = '[a-z0-9]+(?:-[a-z0-9]+)*';
const space = '[a-z0-9][a-z0-9-]{1,62}';
const wikiPath = new RegExp(`^/wiki/${space}(?:/${segment})*/?$`);
const assetPath = new RegExp(`^/wiki/${space}/_assets/[a-f0-9]{64}$`);
const controls = /[\x00-\x20\x7f\\]/;

export function isWikiHost(host: string): boolean {
  const canonical = host.replace(/\.$/, '');
  return canonical === 'tuturuuu.com' || canonical === 'www.tuturuuu.com';
}

export function isWikiAsset(value: string): boolean {
  return assetPath.test(value);
}

export function parseWikiLink(value: string): URL | undefined {
  if (!value || controls.test(value)) return;
  try {
    const url = new URL(value, origin);
    if (value.startsWith('#')) {
      decodeURIComponent(value);
      return url;
    }
    const destination = value.split('#', 1)[0] ?? '';
    if (value.startsWith('/')) {
      // Check the raw path before the URL parser normalizes dot segments.
      return wikiPath.test(destination) && validFragment(url.hash)
        ? url
        : undefined;
    }
    if (/^mailto:/i.test(value)) {
      return url.pathname &&
        !value.slice('mailto:'.length).startsWith('/') &&
        !/%0[ad]/i.test(value)
        ? url
        : undefined;
    }
    if (
      !/^https?:\/\/[^/?#]/i.test(value) ||
      !url.hostname ||
      url.username ||
      url.password
    )
      return;
    if (isWikiHost(url.hostname)) {
      const rawPath = /^https?:\/\/[^/?#]+([^?#]*)/i.exec(value)?.[1] ?? '';
      if (
        !wikiPath.test(rawPath) ||
        destination.includes('?') ||
        url.protocol !== 'https:' ||
        url.port ||
        !validFragment(url.hash)
      )
        return;
    }
    return url;
  } catch {
    return;
  }
}

function validFragment(value: string): boolean {
  decodeURIComponent(value);
  return true;
}

export function wikiHeadingAnchor(id: string): string {
  return `wiki-heading-${id}`;
}

export function renderedLink(value: string): string {
  const url = parseWikiLink(value);
  if (!url?.hash || !isWikiHost(url.hostname)) return value;
  const fragment = `#${encodeURIComponent(wikiHeadingAnchor(decodeURIComponent(url.hash.slice(1))))}`;
  return value.startsWith('#') ? fragment : `${value.split('#')[0]}${fragment}`;
}

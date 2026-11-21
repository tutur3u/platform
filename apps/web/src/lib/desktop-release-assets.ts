import { DomUtils, parseDocument } from 'htmlparser2';
import {
  DESKTOP_PACKAGES,
  DESKTOP_PLATFORMS,
  DESKTOP_REPOSITORY,
  DESKTOP_TAG_PATTERN,
  type DesktopDownload,
  type DesktopRelease,
} from './desktop-downloads';

export const DESKTOP_RELEASES_WEB = `https://github.com/${DESKTOP_REPOSITORY}/releases`;

export function parseDesktopReleaseFeed(xml: string): string[] {
  const prefix = `${DESKTOP_RELEASES_WEB}/tag/`;
  const entries = DomUtils.findAll(
    (element) => element.name === 'entry',
    parseDocument(xml, { xmlMode: true }).children
  );
  const tags = entries.flatMap((entry) => {
    const link = DomUtils.findOne(
      (element) =>
        element.name === 'link' && element.attribs.rel === 'alternate',
      entry.children
    );
    const href = link?.attribs.href;
    if (!href?.startsWith(prefix)) return [];
    const tag = href.slice(prefix.length);
    return DESKTOP_TAG_PATTERN.test(tag) ? [tag] : [];
  });
  return [...new Set(tags)].sort((a, b) => compareDesktopReleaseTags(b, a));
}

const tagOrder = new Intl.Collator('en', { numeric: true });
export function compareDesktopReleaseTags(left: string, right: string) {
  return tagOrder.compare(left, right);
}

export function mergeDesktopReleases(
  first: DesktopRelease,
  second: DesktopRelease | null
): DesktopRelease {
  if (!second) return first;
  const latest =
    compareDesktopReleaseTags(first.tag, second.tag) >= 0 ? first : second;
  const downloads = new Map(
    first.downloads.map((item) => [item.platform, item])
  );
  for (const item of second.downloads) {
    const previous = downloads.get(item.platform);
    if (!previous || compareDesktopReleaseTags(item.tag, previous.tag) > 0)
      downloads.set(item.platform, item);
  }
  return { ...latest, downloads: [...downloads.values()] };
}

export function parseDesktopReleaseAssets(
  tag: string,
  html: string
): DesktopRelease | null {
  if (!DESKTOP_TAG_PATTERN.test(tag)) return null;
  const rows = DomUtils.findAll(
    (element) => element.name === 'li',
    parseDocument(html).children
  );
  const releaseUrl = `${DESKTOP_RELEASES_WEB}/tag/${tag}`;
  const downloads: DesktopDownload[] = [];

  for (const platform of DESKTOP_PLATFORMS) {
    const { name, architecture, minimumOs } = DESKTOP_PACKAGES[platform];
    const path = `/${DESKTOP_REPOSITORY}/releases/download/${tag}/${name}`;
    const matches = rows.flatMap((row) =>
      DomUtils.findAll(
        (element) => element.name === 'a' && element.attribs.href === path,
        row.children
      ).map(() => row)
    );
    const [row] = matches;
    if (matches.length !== 1 || !row) continue;

    const digests = DomUtils.findAll(
      (element) =>
        element.name === 'clipboard-copy' &&
        element.attribs['aria-label'] ===
          `Copy to clipboard digest for ${name}`,
      row.children
    );
    const digest = digests[0]?.attribs.value;
    if (
      digests.length !== 1 ||
      !digest ||
      !/^sha256:[a-f0-9]{64}$/.test(digest)
    )
      continue;

    downloads.push({
      platform,
      architecture,
      minimumOs,
      // The asset listing has neither a signing receipt nor an exact byte size.
      unsigned: false,
      size: null,
      tag,
      releaseUrl,
      url: `https://github.com${path}`,
      sha256: digest.slice(7),
    });
  }

  return downloads.length ? { tag, url: releaseUrl, downloads } : null;
}

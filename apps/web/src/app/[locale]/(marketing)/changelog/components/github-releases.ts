import { GITHUB_OWNER, GITHUB_REPO } from '@/constants/common';

/**
 * The published release history, read from GitHub and cached.
 *
 * Releases in this repository are cut by Release Please, one per package per
 * train, so the feed is wide (fifty-odd packages) and long (several hundred
 * entries). That shape is why this module parses the notes rather than
 * rendering the raw markdown: once every bullet is a `{type, scope,
 * description, commit}` record, the page can filter and sort by things people
 * actually ask for — "what changed in `tasks`", "show me the fixes" — instead
 * of leaving a reader to scroll a wall of generated text.
 *
 * Nothing here is authored content. Editorial changelog entries live in
 * Supabase and are unaffected.
 */

export type ChangeType =
  | 'breaking'
  | 'features'
  | 'fixes'
  | 'performance'
  | 'other';

export const changeTypes: ChangeType[] = [
  'breaking',
  'features',
  'fixes',
  'performance',
  'other',
];

export interface ReleaseChange {
  description: string;
  /** Conventional-commit scope, e.g. `web` in `**web:** ...`. */
  scope: string | null;
  sha: string | null;
  url: string | null;
}

export interface ReleaseSection {
  type: ChangeType;
  changes: ReleaseChange[];
}

export interface PlatformRelease {
  id: number;
  /** Raw tag, e.g. `utils-v0.17.0`. */
  tag: string;
  /** Tag prefix, e.g. `utils`. Root tags fall back to the repo name. */
  packageName: string;
  version: string;
  publishedAt: string;
  url: string;
  prerelease: boolean;
  sections: ReleaseSection[];
  totalChanges: number;
  /** Distinct scopes across every change, for search. */
  scopes: string[];
}

export interface ReleaseFeed {
  releases: PlatformRelease[];
  /** False when GitHub was unreachable, so the page can say so honestly. */
  ok: boolean;
  /** True when the repository has more releases than this feed serves. */
  truncated: boolean;
}

interface GithubRelease {
  id: number;
  tag_name: string;
  published_at: string | null;
  created_at: string;
  html_url: string;
  body: string | null;
  draft: boolean;
  prerelease: boolean;
}

const PER_PAGE = 100;
/**
 * How far back the public feed reaches. The repository has more than this, and
 * `truncated` reports that rather than letting the page imply it is complete.
 */
const MAX_PAGES = 5;

const headingTypes: [RegExp, ChangeType][] = [
  [/breaking/i, 'breaking'],
  [/feature/i, 'features'],
  [/fix/i, 'fixes'],
  [/performance/i, 'performance'],
];

/** `* **scope:** description ([sha](url))` — scope and commit both optional. */
const bulletPattern =
  /^\*\s+(?:\*\*(?<scope>[^*]+?):\*\*\s*)?(?<description>.*?)\s*(?:\(\[(?<sha>[0-9a-f]{6,40})\]\((?<url>[^)]+)\)\))?\s*$/u;

const tagPattern = /^(?<packageName>.+)-v(?<version>\d.*)$/u;

export function classifyHeading(heading: string): ChangeType {
  for (const [pattern, type] of headingTypes) {
    if (pattern.test(heading)) return type;
  }
  return 'other';
}

/**
 * Turns Release Please markdown into structured sections.
 *
 * Bullets that carry no commit link, and bullets with no scope, are both kept
 * — dropping them would silently lose real changes from the counts the page
 * reports.
 */
export function parseReleaseNotes(body: string | null): ReleaseSection[] {
  if (!body) return [];

  const sections: ReleaseSection[] = [];
  let current: ReleaseSection | null = null;

  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim();

    const heading = /^#{2,4}\s+(?<title>.+)$/u.exec(line);
    if (heading?.groups?.title) {
      const title = heading.groups.title;
      // The `## [1.2.3](compare) (date)` line is the release header, not a
      // change section — skip it rather than opening an empty group.
      if (/^\[?\d+\.\d+\.\d+/u.test(title)) {
        current = null;
        continue;
      }

      const type = classifyHeading(title);
      current = { type, changes: [] };
      sections.push(current);
      continue;
    }

    if (!line.startsWith('*') || !current) continue;

    const bullet = bulletPattern.exec(line);
    if (!bullet?.groups) continue;

    const description = bullet.groups.description?.trim();
    if (!description) continue;

    current.changes.push({
      description,
      scope: bullet.groups.scope?.trim() || null,
      sha: bullet.groups.sha ?? null,
      url: bullet.groups.url ?? null,
    });
  }

  return sections.filter((section) => section.changes.length > 0);
}

export function parseTag(tag: string): {
  packageName: string;
  version: string;
} {
  const match = tagPattern.exec(tag);

  if (match?.groups?.packageName && match.groups.version) {
    return {
      packageName: match.groups.packageName,
      version: match.groups.version,
    };
  }

  // Root tags such as `v1.4.0` have no package prefix.
  return { packageName: GITHUB_REPO, version: tag.replace(/^v/u, '') };
}

export function toPlatformRelease(
  release: GithubRelease
): PlatformRelease | null {
  const publishedAt = release.published_at ?? release.created_at;
  if (release.draft || !publishedAt) return null;

  const sections = parseReleaseNotes(release.body);
  const { packageName, version } = parseTag(release.tag_name);
  const scopes = new Set<string>();
  let totalChanges = 0;

  for (const section of sections) {
    totalChanges += section.changes.length;
    for (const change of section.changes) {
      if (change.scope) scopes.add(change.scope);
    }
  }

  return {
    id: release.id,
    tag: release.tag_name,
    packageName,
    version,
    publishedAt,
    url: release.html_url,
    prerelease: release.prerelease,
    sections,
    totalChanges,
    scopes: [...scopes].sort(),
  };
}

async function fetchReleasePage(
  page: number
): Promise<GithubRelease[] | undefined> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases?per_page=${PER_PAGE}&page=${page}`,
      {
        headers: { Accept: 'application/vnd.github+json' },
        // One shared hourly refresh from our own infrastructure rather than a
        // request per visitor: unauthenticated GitHub allows sixty per hour
        // per IP, and this feed alone would burn that in minutes.
        next: { revalidate: 3600 },
      }
    );

    if (!response.ok) return undefined;

    return (await response.json()) as GithubRelease[];
  } catch {
    return undefined;
  }
}

export async function getReleaseFeed(): Promise<ReleaseFeed> {
  const pages = await Promise.all(
    Array.from({ length: MAX_PAGES }, (_, index) => fetchReleasePage(index + 1))
  );

  // A failed first page means GitHub is unreachable; a failed later page just
  // means the feed is shorter than requested.
  if (!pages[0]) return { releases: [], ok: false, truncated: false };

  const releases = pages
    .filter((page): page is GithubRelease[] => Boolean(page))
    .flat()
    .map(toPlatformRelease)
    .filter((release): release is PlatformRelease => release !== null);

  releases.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  return {
    releases,
    ok: true,
    truncated: pages.at(-1)?.length === PER_PAGE,
  };
}

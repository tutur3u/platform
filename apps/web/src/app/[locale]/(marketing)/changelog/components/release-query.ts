import {
  type ChangeType,
  changeTypes,
  type PlatformRelease,
  type ReleaseSection,
} from './github-releases';

/**
 * Filtering, sorting and pagination for the release feed.
 *
 * Kept as pure functions over plain data, and driven entirely by the URL, for
 * two reasons. Shipping several hundred parsed releases to the browser so it
 * could filter them in memory would be a large payload for a marketing page;
 * and a filtered view someone can send to a colleague ("every `tasks` fix") is
 * worth more than one that lives in component state and disappears on reload.
 */

export const SORTS = ['newest', 'oldest', 'changes', 'package'] as const;
export type ReleaseSort = (typeof SORTS)[number];

export const PAGE_SIZE = 20;

export interface ReleaseQuery {
  q: string;
  packageName: string;
  type: ChangeType | '';
  sort: ReleaseSort;
  page: number;
}

export const emptyQuery: ReleaseQuery = {
  q: '',
  packageName: '',
  type: '',
  sort: 'newest',
  page: 1,
};

export type RawSearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

/** Anything unrecognised falls back to the default rather than 404-ing. */
export function parseQuery(params: RawSearchParams): ReleaseQuery {
  const sort = firstValue(params.sort) as ReleaseSort;
  const type = firstValue(params.type) as ChangeType;
  const page = Number.parseInt(firstValue(params.page), 10);

  return {
    q: firstValue(params.q).trim().slice(0, 120),
    packageName: firstValue(params.pkg).trim().slice(0, 80),
    type: changeTypes.includes(type) ? type : '',
    sort: SORTS.includes(sort) ? sort : 'newest',
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

export function isFiltered(query: ReleaseQuery): boolean {
  return Boolean(query.q || query.packageName || query.type);
}

/** Serialises back to a query string, dropping defaults so URLs stay short. */
export function buildSearch(query: Partial<ReleaseQuery>): string {
  const params = new URLSearchParams();

  if (query.q) params.set('q', query.q);
  if (query.packageName) params.set('pkg', query.packageName);
  if (query.type) params.set('type', query.type);
  if (query.sort && query.sort !== 'newest') params.set('sort', query.sort);
  if (query.page && query.page > 1) params.set('page', String(query.page));

  const search = params.toString();
  return search ? `?${search}` : '';
}

function sectionMatches(section: ReleaseSection, needle: string) {
  return section.changes.some(
    (change) =>
      change.description.toLowerCase().includes(needle) ||
      change.scope?.toLowerCase().includes(needle)
  );
}

function narrowSections(
  section: ReleaseSection,
  needle: string
): ReleaseSection {
  return {
    type: section.type,
    changes: section.changes.filter(
      (change) =>
        change.description.toLowerCase().includes(needle) ||
        change.scope?.toLowerCase().includes(needle)
    ),
  };
}

/**
 * Applies the query, projecting each release down to the sections that matched.
 *
 * A type filter shows only that type's changes, and a text search shows only
 * the matching bullets — unless the text matched the package or version, in
 * which case the whole release is relevant and is kept intact.
 */
export function filterReleases(
  releases: PlatformRelease[],
  query: ReleaseQuery
): PlatformRelease[] {
  const needle = query.q.toLowerCase();
  const results: PlatformRelease[] = [];

  for (const release of releases) {
    if (query.packageName && release.packageName !== query.packageName) {
      continue;
    }

    let sections = release.sections;

    if (query.type) {
      sections = sections.filter((section) => section.type === query.type);
      if (sections.length === 0) continue;
    }

    if (needle) {
      const identityMatch =
        release.packageName.toLowerCase().includes(needle) ||
        release.tag.toLowerCase().includes(needle);

      if (!identityMatch) {
        sections = sections
          .filter((section) => sectionMatches(section, needle))
          .map((section) => narrowSections(section, needle));

        if (sections.length === 0) continue;
      }
    }

    results.push(
      sections === release.sections
        ? release
        : {
            ...release,
            sections,
            totalChanges: sections.reduce(
              (total, section) => total + section.changes.length,
              0
            ),
          }
    );
  }

  return results;
}

export function sortReleases(
  releases: PlatformRelease[],
  sort: ReleaseSort
): PlatformRelease[] {
  const sorted = [...releases];

  switch (sort) {
    case 'oldest':
      sorted.sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
      break;
    case 'changes':
      sorted.sort(
        (a, b) =>
          b.totalChanges - a.totalChanges ||
          b.publishedAt.localeCompare(a.publishedAt)
      );
      break;
    case 'package':
      sorted.sort(
        (a, b) =>
          a.packageName.localeCompare(b.packageName) ||
          b.publishedAt.localeCompare(a.publishedAt)
      );
      break;
    default:
      sorted.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  }

  return sorted;
}

export interface Facet {
  value: string;
  count: number;
}

/**
 * Facets are counted over the whole feed, not the filtered result.
 *
 * Recounting against the current filter makes options vanish as you use them,
 * which reads as the control breaking rather than narrowing.
 */
export function packageFacets(releases: PlatformRelease[]): Facet[] {
  const counts = new Map<string, number>();

  for (const release of releases) {
    counts.set(release.packageName, (counts.get(release.packageName) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

export function typeFacets(releases: PlatformRelease[]): Facet[] {
  const counts = new Map<ChangeType, number>();

  for (const release of releases) {
    for (const section of release.sections) {
      counts.set(
        section.type,
        (counts.get(section.type) ?? 0) + section.changes.length
      );
    }
  }

  return changeTypes
    .filter((type) => counts.has(type))
    .map((type) => ({ value: type, count: counts.get(type) ?? 0 }));
}

export interface ReleasePage {
  results: PlatformRelease[];
  total: number;
  page: number;
  pageCount: number;
}

export function paginate(
  releases: PlatformRelease[],
  page: number
): ReleasePage {
  const pageCount = Math.max(1, Math.ceil(releases.length / PAGE_SIZE));
  // A `?page=` beyond the end clamps instead of rendering an empty list that
  // looks like "no results" when there plainly are some.
  const current = Math.min(Math.max(1, page), pageCount);
  const start = (current - 1) * PAGE_SIZE;

  return {
    results: releases.slice(start, start + PAGE_SIZE),
    total: releases.length,
    page: current,
    pageCount,
  };
}

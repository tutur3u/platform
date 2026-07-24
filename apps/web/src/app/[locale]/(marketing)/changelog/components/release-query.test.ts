import { describe, expect, it } from 'vitest';
import {
  classifyHeading,
  type PlatformRelease,
  parseReleaseNotes,
  parseTag,
  toPlatformRelease,
} from './github-releases';
import {
  buildSearch,
  emptyQuery,
  filterReleases,
  packageFacets,
  paginate,
  parseQuery,
  sortReleases,
  typeFacets,
} from './release-query';

/**
 * These run against note bodies copied verbatim from the repository's own
 * releases, so the parser is pinned to the shape Release Please actually
 * emits rather than to an idealised version of it.
 */
const utilsBody = `## [0.17.0](https://github.com/tutur3u/platform/compare/utils-v0.16.0...utils-v0.17.0) (2026-07-21)


### Features

* **infrastructure:** manage internal accounts ([02fd9f3](https://github.com/tutur3u/platform/commit/02fd9f3d1b4edb23c881e2dbb04bf244b36e6ed0))


### Bug Fixes

* **chat:** harden personal Zalo integration ([f1d12c6](https://github.com/tutur3u/platform/commit/f1d12c60fe12ab3b01a1be3f0381573d44a32226))
* resolve code quality findings ([63f10b5](https://github.com/tutur3u/platform/commit/63f10b5ec22a4194f48f448ee2b1b088b5da8f08))`;

const perfBody = `## [0.4.2](https://github.com/tutur3u/platform/compare/users-core-v0.4.1...users-core-v0.4.2) (2026-07-21)


### Performance Improvements

* **contacts:** accelerate virtual user listing ([8d0b86c](https://github.com/tutur3u/platform/commit/8d0b86c46f7045b2e7475d2e6211dc0cc2ebb6ab))`;

function release(overrides: Partial<PlatformRelease> = {}): PlatformRelease {
  return {
    id: 1,
    tag: 'utils-v0.17.0',
    packageName: 'utils',
    version: '0.17.0',
    publishedAt: '2026-07-21T12:10:55Z',
    url: 'https://example.invalid',
    prerelease: false,
    sections: [],
    totalChanges: 0,
    scopes: [],
    ...overrides,
  };
}

describe('release note parsing', () => {
  it('splits real notes into typed sections', () => {
    const sections = parseReleaseNotes(utilsBody);

    expect(sections.map((section) => section.type)).toEqual([
      'features',
      'fixes',
    ]);
    expect(sections[0]?.changes).toHaveLength(1);
    expect(sections[1]?.changes).toHaveLength(2);
  });

  it('does not treat the version header as a change section', () => {
    // `## [0.17.0](...)` is a heading too; counting it would open an empty
    // group and inflate every release by one section.
    expect(parseReleaseNotes(utilsBody)).toHaveLength(2);
  });

  it('reads scope, description and commit off a bullet', () => {
    const [features] = parseReleaseNotes(utilsBody);
    const change = features?.changes[0];

    expect(change?.scope).toBe('infrastructure');
    expect(change?.description).toBe('manage internal accounts');
    // Release Please renders the abbreviated sha as the link text and the
    // full one in the href, so `sha` is already display-length.
    expect(change?.sha).toBe('02fd9f3');
    expect(change?.url).toContain(
      '/commit/02fd9f3d1b4edb23c881e2dbb04bf244b36e6ed0'
    );
  });

  it('keeps bullets that carry no scope', () => {
    const fixes = parseReleaseNotes(utilsBody)[1];
    const unscoped = fixes?.changes[1];

    expect(unscoped?.scope).toBeNull();
    expect(unscoped?.description).toBe('resolve code quality findings');
  });

  it('keeps a bullet with no commit link rather than dropping the change', () => {
    const sections = parseReleaseNotes(
      '### Features\n\n* something shipped without a link'
    );

    expect(sections[0]?.changes).toEqual([
      {
        description: 'something shipped without a link',
        scope: null,
        sha: null,
        url: null,
      },
    ]);
  });

  it('classifies the headings this repository emits', () => {
    expect(classifyHeading('Features')).toBe('features');
    expect(classifyHeading('Bug Fixes')).toBe('fixes');
    expect(classifyHeading('Performance Improvements')).toBe('performance');
    expect(classifyHeading('⚠ BREAKING CHANGES')).toBe('breaking');
    expect(classifyHeading('Miscellaneous Chores')).toBe('other');
  });

  it('handles an empty or missing body', () => {
    expect(parseReleaseNotes(null)).toEqual([]);
    expect(parseReleaseNotes('')).toEqual([]);
  });
});

describe('tag parsing', () => {
  it('splits package and version', () => {
    expect(parseTag('utils-v0.17.0')).toEqual({
      packageName: 'utils',
      version: '0.17.0',
    });
    expect(parseTag('users-ui-v0.4.1')).toEqual({
      packageName: 'users-ui',
      version: '0.4.1',
    });
  });

  it('falls back to the repository name for a root tag', () => {
    expect(parseTag('v1.4.0')).toEqual({
      packageName: 'platform',
      version: '1.4.0',
    });
  });
});

describe('release projection', () => {
  it('counts changes and collects scopes', () => {
    const projected = toPlatformRelease({
      id: 7,
      tag_name: 'utils-v0.17.0',
      published_at: '2026-07-21T12:10:55Z',
      created_at: '2026-07-21T12:00:00Z',
      html_url: 'https://example.invalid',
      body: utilsBody,
      draft: false,
      prerelease: false,
    });

    expect(projected?.totalChanges).toBe(3);
    expect(projected?.scopes).toEqual(['chat', 'infrastructure']);
  });

  it('drops drafts', () => {
    expect(
      toPlatformRelease({
        id: 8,
        tag_name: 'utils-v0.18.0',
        published_at: null,
        created_at: '2026-07-21T12:00:00Z',
        html_url: 'https://example.invalid',
        body: utilsBody,
        draft: true,
        prerelease: false,
      })
    ).toBeNull();
  });
});

describe('query parsing', () => {
  it('falls back to defaults for unrecognised values', () => {
    expect(
      parseQuery({ sort: 'sideways', type: 'nonsense', page: 'x' })
    ).toEqual(emptyQuery);
  });

  it('reads a full query', () => {
    expect(
      parseQuery({
        q: ' tasks ',
        pkg: 'utils',
        type: 'fixes',
        sort: 'oldest',
        page: '3',
      })
    ).toEqual({
      q: 'tasks',
      packageName: 'utils',
      type: 'fixes',
      sort: 'oldest',
      page: 3,
    });
  });

  it('takes the first value when a param repeats', () => {
    expect(parseQuery({ pkg: ['utils', 'ui'] }).packageName).toBe('utils');
  });

  it('omits defaults when serialising', () => {
    expect(buildSearch(emptyQuery)).toBe('');
    expect(buildSearch({ ...emptyQuery, type: 'fixes', page: 2 })).toBe(
      '?type=fixes&page=2'
    );
  });
});

describe('filtering', () => {
  const feed = [
    release({
      id: 1,
      packageName: 'utils',
      sections: parseReleaseNotes(utilsBody),
      totalChanges: 3,
    }),
    release({
      id: 2,
      tag: 'users-core-v0.4.2',
      packageName: 'users-core',
      publishedAt: '2026-07-20T00:00:00Z',
      sections: parseReleaseNotes(perfBody),
      totalChanges: 1,
    }),
  ];

  it('filters by package', () => {
    const result = filterReleases(feed, {
      ...emptyQuery,
      packageName: 'users-core',
    });

    expect(result.map((item) => item.id)).toEqual([2]);
  });

  it('projects a type filter down to matching sections only', () => {
    const [first] = filterReleases(feed, { ...emptyQuery, type: 'fixes' });

    expect(first?.sections.map((section) => section.type)).toEqual(['fixes']);
    // The count follows the projection, so the card cannot claim three
    // changes while showing two.
    expect(first?.totalChanges).toBe(2);
  });

  it('narrows to matching bullets on a text search', () => {
    const [first] = filterReleases(feed, { ...emptyQuery, q: 'Zalo' });

    expect(first?.totalChanges).toBe(1);
    expect(first?.sections[0]?.changes[0]?.description).toContain('Zalo');
  });

  it('keeps a release whole when the text matches its package', () => {
    const [first] = filterReleases(feed, { ...emptyQuery, q: 'utils' });

    expect(first?.totalChanges).toBe(3);
  });

  it('returns nothing when a filter matches nothing', () => {
    expect(
      filterReleases(feed, { ...emptyQuery, q: 'definitely-not-present' })
    ).toEqual([]);
  });
});

describe('sorting and paging', () => {
  const feed = [
    release({ id: 1, publishedAt: '2026-01-01T00:00:00Z', totalChanges: 1 }),
    release({
      id: 2,
      packageName: 'apps',
      publishedAt: '2026-03-01T00:00:00Z',
      totalChanges: 9,
    }),
    release({
      id: 3,
      packageName: 'zoo',
      publishedAt: '2026-02-01T00:00:00Z',
      totalChanges: 4,
    }),
  ];

  it('sorts newest, oldest, by change count and by package', () => {
    expect(sortReleases(feed, 'newest').map((r) => r.id)).toEqual([2, 3, 1]);
    expect(sortReleases(feed, 'oldest').map((r) => r.id)).toEqual([1, 3, 2]);
    expect(sortReleases(feed, 'changes').map((r) => r.id)).toEqual([2, 3, 1]);
    expect(sortReleases(feed, 'package').map((r) => r.packageName)).toEqual([
      'apps',
      'utils',
      'zoo',
    ]);
  });

  it('does not mutate the input', () => {
    const order = feed.map((item) => item.id);
    sortReleases(feed, 'oldest');
    expect(feed.map((item) => item.id)).toEqual(order);
  });

  it('clamps a page beyond the end instead of rendering an empty list', () => {
    const page = paginate(feed, 99);

    expect(page.page).toBe(1);
    expect(page.results).toHaveLength(3);
    expect(page.pageCount).toBe(1);
  });
});

describe('facets', () => {
  const feed = [
    release({ id: 1, sections: parseReleaseNotes(utilsBody) }),
    release({
      id: 2,
      packageName: 'users-core',
      sections: parseReleaseNotes(perfBody),
    }),
    release({ id: 3, packageName: 'users-core', sections: [] }),
  ];

  it('counts releases per package, busiest first', () => {
    expect(packageFacets(feed)).toEqual([
      { value: 'users-core', count: 2 },
      { value: 'utils', count: 1 },
    ]);
  });

  it('counts individual changes per type', () => {
    expect(typeFacets(feed)).toEqual([
      { value: 'features', count: 1 },
      { value: 'fixes', count: 2 },
      { value: 'performance', count: 1 },
    ]);
  });
});

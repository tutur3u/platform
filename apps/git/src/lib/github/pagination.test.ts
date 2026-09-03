import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GitRepository } from './types';

const mocks = vi.hoisted(() => ({
  cacheTag: vi.fn(),
  getInstallationToken: vi.fn(),
  requireRegisteredRepository: vi.fn(),
}));

vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: mocks.cacheTag,
}));

vi.mock('server-only', () => ({}));

vi.mock('./credentials', () => ({
  getInstallationToken: mocks.getInstallationToken,
}));

vi.mock('./registry', () => ({
  requireRegisteredRepository: mocks.requireRegisteredRepository,
}));

import { githubRequest, githubRequestWithMetadata } from './api';
import {
  getRepositoryActionRunArtifacts,
  getRepositoryActionRunJobs,
  getRepositoryIssueComments,
  getRepositoryPullFiles,
  getRepositoryPullReviews,
} from './queries';

const repository: GitRepository = {
  archived: false,
  defaultBranch: 'main',
  description: null,
  enabled: true,
  githubRepositoryId: 536_896_722,
  homepageUrl: null,
  id: 'bootstrap-tutur3u-platform',
  name: 'platform',
  owner: 'tutur3u',
  visibility: 'public',
};

function jsonResponse(
  body: unknown,
  options: { link?: string; status?: number } = {}
) {
  return new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json',
      ...(options.link ? { link: options.link } : {}),
    },
    status: options.status ?? 200,
  });
}

describe('GitHub pagination metadata', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    mocks.getInstallationToken.mockResolvedValue(null);
    mocks.requireRegisteredRepository.mockResolvedValue(repository);
  });

  it('reports continuation only from a standard next Link relation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse([{ id: 1 }], {
          link: '<https://api.github.com/resource?page=2>; rel="next", <https://api.github.com/resource?page=4>; rel="last"',
        })
      )
    );

    await expect(
      githubRequestWithMetadata<{ id: number }[]>({
        path: '/resource',
        repository,
      })
    ).resolves.toEqual({ body: [{ id: 1 }], hasNextPage: true });
  });

  it('keeps existing scalar callers on the decoded-body contract', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          { id: 1 },
          {
            link: '<https://api.github.com/resource?page=2>; rel="next"',
          }
        )
      )
    );

    await expect(
      githubRequest<{ id: number }>({ path: '/resource', repository })
    ).resolves.toEqual({ id: 1 });
  });

  it.each([null, 'not a link', '<https://example.test?page=1>; rel="last"'])(
    'treats a missing or malformed Link header as complete: %s',
    async (link) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(jsonResponse([], link ? { link } : {}))
      );

      await expect(
        githubRequestWithMetadata<unknown[]>({
          path: '/resource',
          repository,
        })
      ).resolves.toMatchObject({ hasNextPage: false });
    }
  );

  it('preserves GitHub rate-limit classification', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'API rate limit exceeded' }), {
          headers: {
            'content-type': 'application/json',
            'x-ratelimit-remaining': '0',
          },
          status: 403,
        })
      )
    );

    await expect(
      githubRequestWithMetadata({ path: '/resource', repository })
    ).rejects.toMatchObject({ code: 'github_rate_limited', status: 503 });
  });

  it('pages issue comments independently and tags the selected page', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse([], {
        link: '<https://api.github.com/repos/tutur3u/platform/issues/17/comments?page=4>; rel="next"',
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      getRepositoryIssueComments('tutur3u', 'platform', 17, 3)
    ).resolves.toEqual({ items: [], nextPage: 4 });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      '/issues/17/comments?page=3&per_page=50'
    );
    expect(mocks.cacheTag).toHaveBeenCalledWith(
      'git:tutur3u/platform',
      'git:issue:17:comments:3'
    );
  });

  it('keeps pull files and reviews on independent page contracts', async () => {
    const files = Array.from({ length: 100 }, (_, index) => ({
      additions: 1,
      changes: 1,
      deletions: 0,
      filename: `file-${index}.ts`,
      status: 'modified',
    }));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(files, {
          link: '<https://api.github.com/repos/tutur3u/platform/pulls/9/files?page=2>; rel="next"',
        })
      )
      .mockResolvedValueOnce(jsonResponse([]));
    vi.stubGlobal('fetch', fetchMock);

    const [filePage, reviewPage] = await Promise.all([
      getRepositoryPullFiles('tutur3u', 'platform', 9, 1),
      getRepositoryPullReviews('tutur3u', 'platform', 9, 7),
    ]);

    expect(filePage).toMatchObject({ nextPage: 2 });
    expect(filePage.items).toHaveLength(100);
    expect(reviewPage).toEqual({ items: [], nextPage: null });
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual(
      expect.arrayContaining([
        expect.stringContaining('/pulls/9/files?page=1&per_page=100'),
        expect.stringContaining('/pulls/9/reviews?page=7&per_page=50'),
      ])
    );
  });

  it('keeps workflow jobs and artifacts on independent page contracts', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          { jobs: [] },
          {
            link: '<https://api.github.com/repos/tutur3u/platform/actions/runs/42/jobs?page=3>; rel="next"',
          }
        )
      )
      .mockResolvedValueOnce(jsonResponse({ artifacts: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      Promise.all([
        getRepositoryActionRunJobs('tutur3u', 'platform', 42, 2),
        getRepositoryActionRunArtifacts('tutur3u', 'platform', 42, 5),
      ])
    ).resolves.toEqual([
      { items: [], nextPage: 3 },
      { items: [], nextPage: null },
    ]);
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual(
      expect.arrayContaining([
        expect.stringContaining('/actions/runs/42/jobs?page=2&per_page=50'),
        expect.stringContaining(
          '/actions/runs/42/artifacts?page=5&per_page=50'
        ),
      ])
    );
  });
});

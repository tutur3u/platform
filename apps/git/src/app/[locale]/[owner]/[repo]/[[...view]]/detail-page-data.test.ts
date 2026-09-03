import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DetailPaginationLabels } from '../../../../../components/repository/repository-detail-pagination';
import { GitHubMirrorError } from '../../../../../lib/github/errors';
import { loadDetailCollection } from './detail-page-data';

const labels: DetailPaginationLabels = {
  collectionFailed: 'Collection failed',
  nextPage: 'Next',
  page: (page) => `Page ${page}`,
  partialResults: 'Partial',
  previousPage: 'Previous',
};

function load(request: Promise<{ items: number[]; nextPage: number | null }>) {
  return loadDetailCollection({
    labels,
    owner: 'tutur3u',
    page: 1000,
    pageParameter: 'commentsPage',
    query: {},
    repository: 'platform',
    request,
    view: ['issues', '1'],
  });
}

describe('detail collection loading', () => {
  beforeEach(() => vi.clearAllMocks());

  it('suppresses continuation links beyond the supported page bound', async () => {
    await expect(
      load(Promise.resolve({ items: [1], nextPage: 1001 }))
    ).resolves.toMatchObject({
      nextHref: undefined,
      nextPage: 1001,
      page: 1000,
    });
  });

  it.each([
    'github_access_denied',
    'github_rate_limited',
    'github_request_failed',
  ])('rethrows repository-level failure %s', async (code) => {
    const error = new GitHubMirrorError('Unavailable', 502, code);
    await expect(load(Promise.reject(error))).rejects.toBe(error);
  });

  it('keeps collection-local failures isolated', async () => {
    await expect(
      load(Promise.reject(new GitHubMirrorError('Missing', 404, 'not_found')))
    ).resolves.toMatchObject({ failed: true, items: [] });
  });

  it('offers a previous-page recovery path for an empty out-of-range page', async () => {
    const result = await load(Promise.resolve({ items: [], nextPage: null }));
    expect(result.previousHref).toContain('commentsPage=999');
  });
});

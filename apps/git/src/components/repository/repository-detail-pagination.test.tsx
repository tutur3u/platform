// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildDetailPaginationHref,
  type DetailPageParameter,
  type DetailPaginationLabels,
  normalizeDetailPage,
  RepositoryDetailPagination,
} from './repository-detail-pagination';

vi.mock('./repository-markdown', () => ({
  RepositoryMarkdown: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock('./repository-source', () => ({
  RepositorySource: () => null,
}));

import { PullDetail } from './repository-detail';

const labels: DetailPaginationLabels = {
  collectionFailed: 'Collection failed',
  nextPage: 'Next page',
  page: (page) => `Page ${page}`,
  partialResults: 'Partial results',
  previousPage: 'Previous page',
};

afterEach(cleanup);

describe('repository detail pagination', () => {
  it.each([
    [undefined, 1],
    ['', 1],
    ['not-a-page', 1],
    ['-4', 1],
    ['0', 1],
    ['3.5', 1],
    ['24', 24],
    ['5000', 1000],
  ])('normalizes %s to bounded page %s', (value, expected) => {
    expect(normalizeDetailPage(value)).toBe(expected);
  });

  it.each<DetailPageParameter>([
    'commentsPage',
    'filesPage',
    'reviewsPage',
    'jobsPage',
    'artifactsPage',
  ])('updates only %s while preserving the view and other pages', (key) => {
    const href = buildDetailPaginationHref({
      owner: 'tutur3u',
      page: 9,
      pageParameter: key,
      repository: 'platform',
      searchParams: {
        artifactsPage: '5',
        commentsPage: '1',
        filesPage: '2',
        jobsPage: '4',
        q: 'keep me',
        reviewsPage: '3',
      },
      view: ['pull', '17'],
    });
    const url = new URL(href, 'https://git.tuturuuu.com');

    expect(url.pathname).toBe('/tutur3u/platform/pull/17');
    expect(url.searchParams.get(key)).toBe('9');
    expect(url.searchParams.get('q')).toBe('keep me');
    for (const otherKey of [
      'commentsPage',
      'filesPage',
      'reviewsPage',
      'jobsPage',
      'artifactsPage',
    ] as const) {
      if (otherKey !== key) {
        expect(url.searchParams.get(otherKey)).toBe(
          {
            artifactsPage: '5',
            commentsPage: '1',
            filesPage: '2',
            jobsPage: '4',
            reviewsPage: '3',
          }[otherKey]
        );
      }
    }
  });

  it('renders selected-page, partial, previous, and next state explicitly', () => {
    render(
      <RepositoryDetailPagination
        failed={false}
        labels={labels}
        nextHref="/tutur3u/platform/issues/1?commentsPage=3"
        nextPage={3}
        page={2}
        previousHref="/tutur3u/platform/issues/1?commentsPage=1"
      />
    );

    expect(screen.getByText('Page 2')).toBeInTheDocument();
    expect(screen.getByText('Partial results')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Previous page/u })
    ).toHaveAttribute('href', '/tutur3u/platform/issues/1?commentsPage=1');
    expect(screen.getByRole('link', { name: /Next page/u })).toHaveAttribute(
      'href',
      '/tutur3u/platform/issues/1?commentsPage=3'
    );
  });

  it('renders localized collection failure copy without continuation links', () => {
    render(
      <RepositoryDetailPagination
        failed
        labels={labels}
        nextPage={null}
        page={1}
      />
    );

    expect(screen.getByText('Collection failed')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('does not present the first 100 files of a 150-file pull as complete', () => {
    const files = Array.from({ length: 100 }, (_, index) => ({
      additions: 1,
      changes: 1,
      deletions: 0,
      filename: `file-${index}.ts`,
      status: 'modified',
    }));

    render(
      <PullDetail
        data={{
          files: {
            failed: false,
            items: files,
            labels,
            nextHref: '/tutur3u/platform/pull/17?filesPage=2',
            nextPage: 2,
            page: 1,
          },
          pull: {
            additions: 100,
            body: null,
            changed_files: 150,
            comments: 0,
            commits: 2,
            created_at: '2026-08-10T00:00:00Z',
            deletions: 0,
            draft: false,
            html_url: 'https://github.com/tutur3u/platform/pull/17',
            labels: [],
            merged_at: null,
            number: 17,
            state: 'open',
            title: 'Large pull request',
            updated_at: '2026-08-10T00:00:00Z',
            user: {
              avatar_url: 'https://avatars.example.test/user',
              html_url: 'https://github.com/example',
              login: 'example',
            },
          },
          reviews: {
            failed: false,
            items: [],
            labels,
            nextPage: null,
            page: 1,
          },
        }}
        reviewsTitle="Reviews"
      />
    );

    expect(screen.getByText(/150 files/u)).toBeInTheDocument();
    expect(screen.getByText('Partial results')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Next page/u })).toHaveAttribute(
      'href',
      '/tutur3u/platform/pull/17?filesPage=2'
    );
  });
});

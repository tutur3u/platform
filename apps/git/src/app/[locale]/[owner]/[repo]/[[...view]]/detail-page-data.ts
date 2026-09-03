import { getTranslations } from 'next-intl/server';
import {
  buildDetailPaginationHref,
  type DetailCollectionPage,
  type DetailPageParameter,
  type DetailPaginationLabels,
  type DetailSearchParams,
  MAX_DETAIL_PAGE,
} from '../../../../../components/repository/repository-detail-pagination';
import { GitHubMirrorError } from '../../../../../lib/github/errors';
import type { GitHubPage } from '../../../../../lib/github/types';

const REPOSITORY_FAILURE_CODES = new Set([
  'github_access_denied',
  'github_rate_limited',
  'github_request_failed',
]);

export async function getDetailPaginationLabels(
  locale: string
): Promise<DetailPaginationLabels & { reviews: string }> {
  const t = await getTranslations({ locale, namespace: 'git' });
  return {
    collectionFailed: t('collection_failed'),
    nextPage: t('next_page'),
    page: (page) => t('page_number', { page }),
    partialResults: t('partial_results'),
    previousPage: t('previous_page'),
    reviews: t('reviews'),
  };
}

export async function loadDetailCollection<T>({
  labels,
  owner,
  page,
  pageParameter,
  query,
  repository,
  request,
  view,
}: {
  labels: DetailPaginationLabels;
  owner: string;
  page: number;
  pageParameter: DetailPageParameter;
  query: DetailSearchParams;
  repository: string;
  request: Promise<GitHubPage<T>>;
  view: string[];
}): Promise<DetailCollectionPage<T>> {
  try {
    const result = await request;
    return {
      failed: false,
      items: result.items,
      labels,
      nextHref:
        result.nextPage === null || result.nextPage > MAX_DETAIL_PAGE
          ? undefined
          : buildDetailPaginationHref({
              owner,
              page: result.nextPage,
              pageParameter,
              repository,
              searchParams: query,
              view,
            }),
      nextPage: result.nextPage,
      page,
      previousHref:
        page <= 1
          ? undefined
          : buildDetailPaginationHref({
              owner,
              page: page - 1,
              pageParameter,
              repository,
              searchParams: query,
              view,
            }),
    };
  } catch (error) {
    if (!(error instanceof GitHubMirrorError)) throw error;
    if (REPOSITORY_FAILURE_CODES.has(error.code)) throw error;
    return {
      failed: true,
      items: [],
      labels,
      nextPage: null,
      page,
    };
  }
}

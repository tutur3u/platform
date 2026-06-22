import { queryOptions, useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import {
  createBackendApiClient,
  InternalApiError,
} from '@tuturuuu/internal-api';
import { ChangelogPage } from '../../components/changelog/changelog-page';
import type { ChangelogListResponse } from '../../components/changelog/types';
import { withTanstackBackendRuntime } from '../../lib/cloudflare/backend';
import { PUBLIC_CHANGELOG_CACHE_HEADERS } from '../../lib/platform/cache';
import { createPageHead } from '../../lib/platform/head';
import { resolveMessagesLocale } from '../../lib/platform/messages';

const CHANGELOG_PAGE_SIZE = 1000;

const emptyChangelogListResponse: ChangelogListResponse = {
  data: [],
  pagination: {
    page: 1,
    pageSize: CHANGELOG_PAGE_SIZE,
    total: 0,
    totalPages: 0,
  },
};

const listPublicChangelogs = createServerFn({ method: 'GET' }).handler(
  async (): Promise<ChangelogListResponse> => {
    try {
      const backendRuntime = await withTanstackBackendRuntime();

      return await createBackendApiClient(backendRuntime).json(
        '/api/v1/infrastructure/changelog',
        {
          cache: 'no-store',
          query: {
            page: 1,
            pageSize: CHANGELOG_PAGE_SIZE,
            published: true,
          },
        }
      );
    } catch (error) {
      if (error instanceof InternalApiError) {
        return emptyChangelogListResponse;
      }

      throw error;
    }
  }
);

const changelogListQuery = queryOptions({
  queryFn: () => listPublicChangelogs(),
  queryKey: ['changelog', 'public', 'list'],
  retry: false,
});

export const Route = createFileRoute('/$locale/changelog')({
  component: ChangelogRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description:
        'Stay up to date with the latest features, improvements, and updates to the Tuturuuu platform.',
      locale,
      title: 'Changelog | Tuturuuu',
    });
  },
  headers: () => PUBLIC_CHANGELOG_CACHE_HEADERS,
  loader: async ({ context }) =>
    context.queryClient.ensureQueryData(changelogListQuery),
});

function ChangelogRoutePage() {
  const { locale } = Route.useParams();
  const initialChangelogs = Route.useLoaderData() as ChangelogListResponse;
  const changelogsQuery = useQuery({
    ...changelogListQuery,
    initialData: initialChangelogs,
  });

  return (
    <ChangelogPage
      changelogs={changelogsQuery.data.data}
      locale={resolveMessagesLocale(locale)}
    />
  );
}

import { queryOptions, useQuery } from '@tanstack/react-query';
import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import {
  createBackendApiClient,
  InternalApiError,
} from '@tuturuuu/internal-api';
import { ChangelogEntryPage } from '../../components/changelog/changelog-entry-page';
import { getAdjacentChangelogs } from '../../components/changelog/changelog-utils';
import type {
  ChangelogEntry,
  ChangelogEntryPageData,
  ChangelogListResponse,
} from '../../components/changelog/types';
import { withTanstackBackendRuntime } from '../../lib/cloudflare/backend';
import { PUBLIC_CHANGELOG_CACHE_HEADERS } from '../../lib/platform/cache';
import { createPageHead } from '../../lib/platform/head';
import { resolveMessagesLocale } from '../../lib/platform/messages';

const CHANGELOG_PAGE_SIZE = 1000;

const getPublicChangelogEntry = createServerFn({ method: 'GET' })
  .validator((data: { slug: string }) => data)
  .handler(async ({ data }): Promise<ChangelogEntryPageData | null> => {
    try {
      const backendRuntime = await withTanstackBackendRuntime();
      const backend = createBackendApiClient(backendRuntime);
      const changelog = await backend.json<ChangelogEntry>(
        `/api/v1/infrastructure/changelog/slug/${encodeURIComponent(
          data.slug
        )}`,
        { cache: 'no-store' }
      );
      const changelogList = await listPublicChangelogsForAdjacent(backend);
      const adjacent = getAdjacentChangelogs(changelogList, changelog.slug);

      return {
        changelog,
        ...adjacent,
      };
    } catch (error) {
      if (error instanceof InternalApiError) {
        return null;
      }

      throw error;
    }
  });

function changelogEntryQuery(slug: string) {
  return queryOptions({
    queryFn: () => getPublicChangelogEntry({ data: { slug } }),
    queryKey: ['changelog', 'public', 'entry', slug],
    retry: false,
  });
}

export const Route = createFileRoute('/$locale/changelog/$slug')({
  component: ChangelogEntryRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description:
        'Read the latest product updates and improvements on Tuturuuu.',
      locale,
      title: 'Changelog | Tuturuuu',
    });
  },
  headers: () => PUBLIC_CHANGELOG_CACHE_HEADERS,
  loader: async ({ context, params }) => {
    const slug = typeof params.slug === 'string' ? params.slug : '';

    if (!slug) {
      throw notFound();
    }

    const data = await context.queryClient.ensureQueryData(
      changelogEntryQuery(slug)
    );

    if (!data) {
      throw notFound();
    }

    return data;
  },
});

function ChangelogEntryRoutePage() {
  const { locale, slug } = Route.useParams();
  const initialData = Route.useLoaderData() as ChangelogEntryPageData;
  const changelogQuery = useQuery({
    ...changelogEntryQuery(slug),
    initialData,
  });

  if (!changelogQuery.data) {
    throw notFound();
  }

  return (
    <ChangelogEntryPage
      {...changelogQuery.data}
      locale={resolveMessagesLocale(locale)}
    />
  );
}

async function listPublicChangelogsForAdjacent(
  backend: ReturnType<typeof createBackendApiClient>
) {
  try {
    const response = await backend.json<ChangelogListResponse>(
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

    return response.data;
  } catch (error) {
    if (error instanceof InternalApiError) {
      return [];
    }

    throw error;
  }
}

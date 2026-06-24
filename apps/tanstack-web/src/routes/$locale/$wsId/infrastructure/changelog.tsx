import { queryOptions, useQuery } from '@tanstack/react-query';
import { createFileRoute, notFound, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { Plus } from '@tuturuuu/icons';
import {
  type BackendInfrastructureChangelogEntriesResponse,
  getBackendInfrastructureChangelogEntries,
  withForwardedBackendApiAuth,
} from '@tuturuuu/internal-api/backend';
import { Button } from '@tuturuuu/ui/button';
import { CustomDataTable } from '@tuturuuu/ui/custom/tables/custom-data-table';
import { Separator } from '@tuturuuu/ui/separator';
import Link from 'next/link';
import { useTranslations } from 'use-intl';
import { changelogColumns } from '@/components/infrastructure/changelog/columns';
import { withTanstackBackendRuntime } from '@/lib/cloudflare/backend';
import { requireCurrentUser } from '@/lib/platform/auth-gate';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';
import { resolveWorkspace } from '@/lib/platform/workspace';
import { hasWorkspacePermission } from '@/lib/platform/workspace-permission';

type ChangelogPublishedSearch = '' | 'false' | 'true';

type InfrastructureChangelogSearch = {
  category: string;
  page: number;
  pageSize: number;
  published: ChangelogPublishedSearch;
  q: string;
};

type InfrastructureChangelogData = InfrastructureChangelogSearch & {
  changelogs: BackendInfrastructureChangelogEntriesResponse;
  workspaceId: string;
};

function parsePositiveInteger(value: unknown, fallback: number) {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value, 10)
        : Number.NaN;

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parsePublished(value: unknown): ChangelogPublishedSearch {
  return value === 'true' || value === 'false' ? value : '';
}

function validateChangelogSearch(
  search: Record<string, unknown>
): InfrastructureChangelogSearch {
  return {
    category: typeof search.category === 'string' ? search.category : '',
    page: parsePositiveInteger(search.page, 1),
    pageSize: parsePositiveInteger(search.pageSize, 10),
    published: parsePublished(search.published),
    q: typeof search.q === 'string' ? search.q : '',
  };
}

const loadInfrastructureChangelog = createServerFn({ method: 'GET' })
  .validator((data: InfrastructureChangelogSearch) => data)
  .handler(
    async ({
      data,
    }): Promise<BackendInfrastructureChangelogEntriesResponse> => {
      const backendRuntime = await withTanstackBackendRuntime();

      return getBackendInfrastructureChangelogEntries(
        {
          category: data.category,
          page: data.page,
          pageSize: data.pageSize,
          published: data.published,
          q: data.q,
        },
        withForwardedBackendApiAuth(getRequestHeaders(), backendRuntime)
      );
    }
  );

function infrastructureChangelogQuery(search: InfrastructureChangelogSearch) {
  return queryOptions({
    queryFn: () => loadInfrastructureChangelog({ data: search }),
    queryKey: [
      'infrastructure',
      'changelog',
      'list',
      search.category,
      search.page,
      search.pageSize,
      search.published,
      search.q,
    ],
    retry: false,
  });
}

function redirectToWorkspaceSettings(locale: string, wsId: string): never {
  throw redirect({
    href: `/${locale}/${wsId}/settings`,
    statusCode: 307,
  });
}

export const Route = createFileRoute('/$locale/$wsId/infrastructure/changelog')(
  {
    component: InfrastructureChangelogRoutePage,
    validateSearch: validateChangelogSearch,
    loaderDeps: ({ search }) => ({
      category: search.category,
      page: search.page,
      pageSize: search.pageSize,
      published: search.published,
      q: search.q,
    }),
    head: ({ params }) => {
      const locale = resolveMessagesLocale(params.locale);

      return createPageHead({
        description: 'Manage platform changelog entries.',
        locale,
        title: 'Changelog',
      });
    },
    loader: async ({
      context,
      deps,
      params,
    }): Promise<InfrastructureChangelogData> => {
      await requireCurrentUser({
        locale: params.locale,
        nextPath: `/${params.wsId}/infrastructure/changelog`,
      });

      const workspace = await resolveWorkspace({ data: { wsId: params.wsId } });
      if (!workspace.exists) {
        throw notFound();
      }

      const canManageChangelog = await hasWorkspacePermission({
        data: {
          permission: 'manage_changelog',
          wsId: workspace.workspaceId,
        },
      });

      if (!canManageChangelog) {
        redirectToWorkspaceSettings(params.locale, params.wsId);
      }

      const search = {
        category: deps.category,
        page: deps.page,
        pageSize: deps.pageSize,
        published: deps.published,
        q: deps.q,
      };
      const changelogs = await context.queryClient.ensureQueryData(
        infrastructureChangelogQuery(search)
      );

      return {
        ...search,
        changelogs,
        workspaceId: workspace.workspaceId,
      };
    },
  }
);

function InfrastructureChangelogRoutePage() {
  const data = Route.useLoaderData() as InfrastructureChangelogData | undefined;
  const { wsId } = Route.useParams();
  const t = useTranslations();

  if (!data) {
    throw notFound();
  }

  const changelogsQuery = useQuery({
    ...infrastructureChangelogQuery({
      category: data.category,
      page: data.page,
      pageSize: data.pageSize,
      published: data.published,
      q: data.q,
    }),
    initialData: data.changelogs,
  });
  const total = changelogsQuery.data.pagination.total;

  return (
    <>
      <div className="flex flex-col justify-between gap-4 rounded-lg border border-border bg-foreground/5 p-4 md:flex-row md:items-start">
        <div>
          <h1 className="font-bold text-2xl">
            {t('infrastructure-tabs.changelog')}
          </h1>
          <p className="text-foreground/80">
            Create and manage platform changelog entries.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-lg border border-border bg-background px-3 py-1.5">
            <span className="font-semibold text-muted-foreground text-sm">
              Total: {total}
            </span>
          </div>
          <Button asChild size="sm">
            <Link href={`/${wsId}/infrastructure/changelog/new`}>
              <Plus className="mr-2 h-4 w-4" />
              New Entry
            </Link>
          </Button>
        </div>
      </div>

      <Separator className="my-4" />

      <CustomDataTable
        columnGenerator={changelogColumns}
        namespace="changelog-data-table"
        data={changelogsQuery.data.data}
        count={total}
        pageIndex={Math.max(data.page - 1, 0)}
        pageSize={data.pageSize}
        extraData={{ wsId }}
        defaultVisibility={{
          creator_id: false,
          id: false,
        }}
      />
    </>
  );
}

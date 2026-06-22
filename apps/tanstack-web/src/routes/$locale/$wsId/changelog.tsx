import { queryOptions, useQuery } from '@tanstack/react-query';
import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { ArrowRight, ExternalLink, Megaphone } from '@tuturuuu/icons';
import {
  createBackendApiClient,
  InternalApiError,
} from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { Separator } from '@tuturuuu/ui/separator';
import { getChangelogCategoryConfig } from '../../../components/changelog/changelog-utils';
import type { ChangelogListResponse } from '../../../components/changelog/types';
import { withTanstackBackendRuntime } from '../../../lib/cloudflare/backend';
import { requireCurrentUser } from '../../../lib/platform/auth-gate';
import { createPageHead } from '../../../lib/platform/head';
import { withLocalePrefix } from '../../../lib/platform/locale';
import { resolveMessagesLocale } from '../../../lib/platform/messages';
import { resolveWorkspace } from '../../../lib/platform/workspace';

const DASHBOARD_CHANGELOG_PAGE_SIZE = 20;

type DashboardChangelogLoaderData = {
  changelogs: ChangelogListResponse;
  locale: ReturnType<typeof resolveMessagesLocale>;
};

const emptyDashboardChangelogResponse: ChangelogListResponse = {
  data: [],
  pagination: {
    page: 1,
    pageSize: DASHBOARD_CHANGELOG_PAGE_SIZE,
    total: 0,
    totalPages: 0,
  },
};

const listDashboardChangelogs = createServerFn({ method: 'GET' }).handler(
  async (): Promise<ChangelogListResponse> => {
    try {
      const backendRuntime = await withTanstackBackendRuntime();

      return await createBackendApiClient(backendRuntime).json(
        '/api/v1/infrastructure/changelog',
        {
          cache: 'no-store',
          query: {
            page: 1,
            pageSize: DASHBOARD_CHANGELOG_PAGE_SIZE,
            published: true,
          },
        }
      );
    } catch (error) {
      if (error instanceof InternalApiError) {
        return emptyDashboardChangelogResponse;
      }

      throw error;
    }
  }
);

const dashboardChangelogListQuery = queryOptions({
  queryFn: () => listDashboardChangelogs(),
  queryKey: ['changelog', 'dashboard', 'list'],
  retry: false,
});

export const Route = createFileRoute('/$locale/$wsId/changelog')({
  component: DashboardChangelogRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description: "See what's new in Tuturuuu.",
      locale,
      title: 'Changelog',
    });
  },
  loader: async ({
    context,
    params,
  }): Promise<DashboardChangelogLoaderData> => {
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/changelog`,
    });

    const workspace = await resolveWorkspace({
      data: { wsId: params.wsId },
    });

    if (!workspace.exists) {
      throw notFound();
    }

    const changelogs = await context.queryClient.ensureQueryData(
      dashboardChangelogListQuery
    );

    return {
      changelogs,
      locale: resolveMessagesLocale(params.locale),
    };
  },
});

function DashboardChangelogRoutePage() {
  const loaderData = Route.useLoaderData() as
    | DashboardChangelogLoaderData
    | undefined;
  const changelogsQuery = useQuery({
    ...dashboardChangelogListQuery,
    initialData: loaderData?.changelogs ?? emptyDashboardChangelogResponse,
  });

  if (!loaderData) {
    throw notFound();
  }

  const publicChangelogHref = withLocalePrefix('/changelog', loaderData.locale);

  return (
    <>
      <div className="flex flex-col justify-between gap-4 rounded-lg border border-border bg-foreground/5 p-4 md:flex-row md:items-start">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-dynamic-purple/10">
            <Megaphone className="h-5 w-5 text-dynamic-purple" />
          </div>
          <div>
            <h1 className="font-bold text-2xl">What's New</h1>
            <p className="text-foreground/80">
              Stay up to date with the latest updates to Tuturuuu.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <a href={publicChangelogHref} rel="noreferrer" target="_blank">
              <ExternalLink className="mr-2 h-4 w-4" />
              View Full Changelog
            </a>
          </Button>
        </div>
      </div>

      <Separator className="my-4" />

      {changelogsQuery.data.data.length === 0 ? (
        <Card className="p-8 text-center">
          <Megaphone className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
          <h2 className="mb-2 font-semibold text-lg">No updates yet</h2>
          <p className="text-muted-foreground">
            We're working on exciting new features. Check back soon!
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {changelogsQuery.data.data.map((entry) => {
            const config = getChangelogCategoryConfig(entry.category);
            const href = withLocalePrefix(
              `/changelog/${entry.slug}`,
              loaderData.locale
            );

            return (
              <a
                className="block"
                href={href}
                key={entry.id}
                rel="noreferrer"
                target="_blank"
              >
                <Card className="group p-4 transition-all hover:border-dynamic-purple/30 hover:shadow-md">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Badge
                          className={`gap-1 text-xs ${config.colorClass}`}
                          variant="outline"
                        >
                          {config.icon}
                          {config.label}
                        </Badge>
                        {entry.version ? (
                          <Badge
                            className="font-mono text-xs"
                            variant="secondary"
                          >
                            {entry.version}
                          </Badge>
                        ) : null}
                        {entry.published_at ? (
                          <span className="text-muted-foreground text-xs">
                            {formatDashboardChangelogDate(entry.published_at)}
                          </span>
                        ) : null}
                      </div>

                      <h3 className="font-medium group-hover:text-dynamic-purple">
                        {entry.title}
                      </h3>

                      {entry.summary ? (
                        <p className="mt-1 line-clamp-1 text-foreground/60 text-sm">
                          {entry.summary}
                        </p>
                      ) : null}
                    </div>

                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-dynamic-purple" />
                  </div>
                </Card>
              </a>
            );
          })}
        </div>
      )}
    </>
  );
}

function formatDashboardChangelogDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

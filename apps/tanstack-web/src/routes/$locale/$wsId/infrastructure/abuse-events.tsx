import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import {
  type BackendInfrastructureAbuseEvent,
  getBackendInfrastructureAbuseEvents,
  withForwardedBackendApiAuth,
} from '@tuturuuu/internal-api';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { CustomDataTable } from '@tuturuuu/ui/custom/tables/custom-data-table';
import { Separator } from '@tuturuuu/ui/separator';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { useTranslations } from 'use-intl';
import { getAbuseEventsColumns } from '@/components/infrastructure/abuse-events/columns';
import AbuseEventsFilters from '@/components/infrastructure/abuse-events/filters';
import { requireCurrentUser } from '@/lib/platform/auth-gate';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';
import { resolveWorkspace } from '@/lib/platform/workspace';
import { hasWorkspacePermission } from '@/lib/platform/workspace-permission';

type AbuseEventsSearch = {
  page: number;
  pageSize: number;
  q: string;
  success: string;
  type: string;
};

type AbuseEventsData = {
  count: number;
  data: BackendInfrastructureAbuseEvent[];
  page: number;
  pageSize: number;
  workspaceId: string;
};

function parsePositiveInteger(value: unknown, fallback: number, max?: number) {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value, 10)
        : Number.NaN;

  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return max ? Math.min(parsed, max) : parsed;
}

function validateAbuseEventsSearch(
  search: Record<string, unknown>
): AbuseEventsSearch {
  return {
    page: parsePositiveInteger(search.page, 1),
    pageSize: parsePositiveInteger(search.pageSize, 50, 100),
    q: typeof search.q === 'string' ? search.q : '',
    success: typeof search.success === 'string' ? search.success : '',
    type: typeof search.type === 'string' ? search.type : '',
  };
}

const loadAbuseEvents = createServerFn({ method: 'GET' })
  .validator(
    (data: {
      page: number;
      pageSize: number;
      q?: string;
      success?: string;
      type?: string;
    }) => data
  )
  .handler(
    async ({
      data,
    }): Promise<{
      count: number;
      data: BackendInfrastructureAbuseEvent[];
    }> => {
      const response = await getBackendInfrastructureAbuseEvents(
        {
          page: data.page,
          pageSize: data.pageSize,
          q: data.q,
          success: data.success,
          type: data.type,
        },
        withForwardedBackendApiAuth(getRequestHeaders())
      );

      return {
        count: response.count ?? 0,
        data: response.data ?? [],
      };
    }
  );

export const Route = createFileRoute(
  '/$locale/$wsId/infrastructure/abuse-events'
)({
  component: AbuseEventsRoutePage,
  validateSearch: validateAbuseEventsSearch,
  loaderDeps: ({ search }) => ({
    page: search.page,
    pageSize: search.pageSize,
    q: search.q,
    success: search.success,
    type: search.type,
  }),
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description: 'View abuse events for security monitoring.',
      locale,
      title: 'Abuse Events',
    });
  },
  loader: async ({ params, deps }): Promise<AbuseEventsData> => {
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/infrastructure/abuse-events`,
    });

    const workspace = await resolveWorkspace({ data: { wsId: params.wsId } });
    if (!workspace.exists) {
      throw notFound();
    }

    const [canViewRootInfrastructure, canViewWorkspaceInfrastructure] =
      await Promise.all([
        hasWorkspacePermission({
          data: {
            permission: 'view_infrastructure',
            wsId: ROOT_WORKSPACE_ID,
          },
        }),
        hasWorkspacePermission({
          data: {
            permission: 'view_infrastructure',
            wsId: workspace.workspaceId,
          },
        }),
      ]);
    if (!canViewRootInfrastructure || !canViewWorkspaceInfrastructure) {
      throw notFound();
    }

    const result = await loadAbuseEvents({
      data: {
        page: deps.page,
        pageSize: deps.pageSize,
        q: deps.q,
        success: deps.success,
        type: deps.type,
      },
    });

    return {
      count: result.count,
      data: result.data,
      page: deps.page,
      pageSize: deps.pageSize,
      workspaceId: workspace.workspaceId,
    };
  },
});

function AbuseEventsRoutePage() {
  const data = Route.useLoaderData() as AbuseEventsData | undefined;
  const t = useTranslations();

  if (!data) {
    throw notFound();
  }

  return (
    <>
      <FeatureSummary
        pluralTitle={t('abuse-events.plural')}
        singularTitle={t('abuse-events.singular')}
        description={t('abuse-events.description')}
      />
      <Separator className="my-4" />
      <CustomDataTable
        data={data.data}
        namespace="abuse-events-data-table"
        columnGenerator={getAbuseEventsColumns}
        count={data.count}
        pageIndex={Math.max(data.page - 1, 0)}
        pageSize={data.pageSize}
        defaultVisibility={{
          email_hash: false,
          id: false,
          metadata: false,
          user_agent: false,
        }}
        filters={<AbuseEventsFilters />}
      />
    </>
  );
}

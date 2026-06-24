import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import {
  getWorkspaceRealtimeAnalytics,
  getWorkspaceRealtimeAnalyticsSummary,
  type RealtimeAnalyticsMetric,
  type RealtimeAnalyticsResponse,
  type RealtimeAnalyticsSummaryResponse,
  type RealtimeAnalyticsViewMode,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { listWorkspaces } from '@tuturuuu/internal-api/workspaces';
import type { InternalApiWorkspaceSummary } from '@tuturuuu/types';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { useTranslations } from 'use-intl';
import { RealtimeAnalyticsClient } from '@/components/infrastructure/realtime/realtime-analytics-client';
import { requireCurrentUser } from '@/lib/platform/auth-gate';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';
import { resolveWorkspace } from '@/lib/platform/workspace';
import { hasWorkspacePermission } from '@/lib/platform/workspace-permission';

type RealtimeRouteData = {
  workspaceId: string;
};

type RealtimeAnalyticsInput = {
  channelId?: string;
  endDate: string;
  metric: RealtimeAnalyticsMetric;
  startDate: string;
  viewMode: RealtimeAnalyticsViewMode;
  workspaceId?: string;
  wsId: string;
};

type RealtimeSummaryInput = Omit<RealtimeAnalyticsInput, 'metric' | 'viewMode'>;

const loadRealtimeAnalytics = createServerFn({ method: 'GET' })
  .validator((data: RealtimeAnalyticsInput) => data)
  .handler(async ({ data }): Promise<RealtimeAnalyticsResponse> => {
    return getWorkspaceRealtimeAnalytics(
      data.wsId,
      {
        channelId: data.channelId,
        endDate: data.endDate,
        metric: data.metric,
        startDate: data.startDate,
        viewMode: data.viewMode,
        workspaceId: data.workspaceId,
      },
      withForwardedInternalApiAuth(getRequestHeaders())
    );
  });

const loadRealtimeSummary = createServerFn({ method: 'GET' })
  .validator((data: RealtimeSummaryInput) => data)
  .handler(async ({ data }): Promise<RealtimeAnalyticsSummaryResponse> => {
    return getWorkspaceRealtimeAnalyticsSummary(
      data.wsId,
      {
        channelId: data.channelId,
        endDate: data.endDate,
        startDate: data.startDate,
        workspaceId: data.workspaceId,
      },
      withForwardedInternalApiAuth(getRequestHeaders())
    );
  });

const loadRealtimeWorkspaces = createServerFn({ method: 'GET' }).handler(
  async (): Promise<InternalApiWorkspaceSummary[]> => {
    return listWorkspaces(withForwardedInternalApiAuth(getRequestHeaders()));
  }
);

export const Route = createFileRoute('/$locale/$wsId/infrastructure/realtime')({
  component: RealtimeRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description:
        'Monitor realtime connections and activity across workspaces and channels.',
      locale,
      title: 'Realtime Analytics',
    });
  },
  loader: async ({ params }): Promise<RealtimeRouteData> => {
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/infrastructure/realtime`,
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

    return {
      workspaceId: workspace.workspaceId,
    };
  },
});

function RealtimeRoutePage() {
  const data = Route.useLoaderData() as RealtimeRouteData | undefined;
  const t = useTranslations('realtime-analytics');

  if (!data) {
    throw notFound();
  }

  return (
    <div className="container mx-auto space-y-6 py-6">
      <div className="space-y-2">
        <h1 className="font-bold text-3xl tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>

      <RealtimeAnalyticsClient
        loadAnalytics={(input) => loadRealtimeAnalytics({ data: input })}
        loadSummary={(input) => loadRealtimeSummary({ data: input })}
        loadWorkspaces={() => loadRealtimeWorkspaces()}
        wsId={data.workspaceId}
      />
    </div>
  );
}

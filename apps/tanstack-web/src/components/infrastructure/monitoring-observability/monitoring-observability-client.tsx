'use client';

import {
  Activity,
  BarChart3,
  Box,
  DatabaseZap,
  Gauge,
  Logs,
} from '@tuturuuu/icons';
import type {
  GetObservabilityParams,
  ObservabilityLogLevel,
  ObservabilitySource,
} from '@tuturuuu/internal-api/infrastructure/monitoring';
import { useMemo, useState } from 'react';
import { useTranslations } from 'use-intl';
import { DeploymentsPanel } from './deployments-panel';
import { LogsPanel, type ObservabilityLogsFilters } from './logs-panel';
import { ErrorState, LoadingSkeleton, ModeHeader } from './primitives';
import { ProjectControls } from './project-controls';
import { ProjectScope } from './project-scope';
import { ProjectsPanel } from './projects-panel';
import {
  useBlueGreenWatcherSnapshot,
  useCreateInfrastructureProject,
  useInfrastructureProjects,
  useObservabilityAnalytics,
  useObservabilityDeployments,
  useObservabilityLogs,
  useObservabilityOverview,
  useObservabilityResources,
  useQueueInfrastructureProjectDeploy,
  useSyncInfrastructureProject,
  useUpdateInfrastructureProject,
} from './query-hooks';
import { ResourcesPanel } from './resources-panel';
import {
  AnalyticsPanel,
  ObservabilityMetricSummary,
  OverviewPanel,
  SignalsPanel,
} from './summary-panels';
import type { MonitoringObservabilityMode } from './types';

const modeIcons = {
  analytics: BarChart3,
  deployments: Box,
  logs: Logs,
  observability: DatabaseZap,
  overview: Activity,
  projects: Box,
  resources: Gauge,
} satisfies Record<MonitoringObservabilityMode, typeof Activity>;

function getProjectServiceNeedle(projectId: string) {
  return `project-${projectId.replace(/[^a-zA-Z0-9-]/gu, '-').toLowerCase()}`;
}

export function MonitoringObservabilityClient({
  mode,
}: {
  mode: MonitoringObservabilityMode;
}) {
  const t = useTranslations('blue-green-monitoring.observability');
  const [timeframeHours, setTimeframeHours] = useState(24);
  const [projectId, setProjectId] = useState('platform');
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState<ObservabilityLogLevel | 'all'>('all');
  const [source, setSource] = useState<ObservabilitySource | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [routeFilter, setRouteFilter] = useState('all');
  const [requestIdFilter, setRequestIdFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [deploymentStampFilter, setDeploymentStampFilter] = useState('');
  const [logsPaused, setLogsPaused] = useState(false);
  const Icon = modeIcons[mode];
  const pageSize = 100;
  const filters: GetObservabilityParams = useMemo(
    () => ({
      deploymentStamp: deploymentStampFilter || undefined,
      level,
      pageSize,
      projectId,
      q: query || undefined,
      requestId: requestIdFilter || undefined,
      route: routeFilter === 'all' ? undefined : routeFilter,
      source,
      status: statusFilter === 'all' ? undefined : statusFilter,
      timeframeHours,
      user: userFilter || undefined,
    }),
    [
      deploymentStampFilter,
      level,
      projectId,
      query,
      requestIdFilter,
      routeFilter,
      source,
      statusFilter,
      timeframeHours,
      userFilter,
    ]
  );

  const projectsQuery = useInfrastructureProjects();
  const watcherQuery = useBlueGreenWatcherSnapshot(
    mode === 'projects' || mode === 'overview' || mode === 'deployments'
  );
  const overviewQuery = useObservabilityOverview({
    projectId,
    timeframeHours,
  });
  const analyticsQuery = useObservabilityAnalytics({
    enabled:
      mode === 'analytics' || mode === 'observability' || mode === 'overview',
    projectId,
    timeframeHours,
  });
  const logsQuery = useObservabilityLogs({
    enabled: mode === 'logs',
    filters,
    paused: logsPaused,
  });
  const deploymentsQuery = useObservabilityDeployments({
    enabled: mode === 'deployments',
    filters,
  });
  const resourcesQuery = useObservabilityResources({
    enabled: mode === 'resources',
    projectId,
    timeframeHours,
  });
  const createProjectMutation = useCreateInfrastructureProject();
  const updateProjectMutation = useUpdateInfrastructureProject();
  const syncProjectMutation = useSyncInfrastructureProject();
  const deployProjectMutation = useQueueInfrastructureProjectDeploy();
  const projects = projectsQuery.data?.projects ?? [];
  const selectedProject =
    projects.find((project) => project.id === projectId) ?? projects[0] ?? null;
  const resources = resourcesQuery.data?.dockerResources;
  const scopedContainers = useMemo(() => {
    const containers = resources?.allContainers ?? [];
    if (projectId === 'platform') {
      return containers.filter(
        (container) =>
          !String(container.serviceName ?? container.name).startsWith(
            'project-'
          )
      );
    }

    const needle = getProjectServiceNeedle(projectId);
    return containers.filter((container) =>
      [container.serviceName, container.name]
        .filter(Boolean)
        .some((value) => String(value).includes(needle))
    );
  }, [projectId, resources?.allContainers]);
  const logs = logsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const deployments =
    deploymentsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const logFacets = logsQuery.data?.pages[0]?.facets;
  const logsTotal = logsQuery.data?.pages[0]?.total ?? 0;
  const deploymentsTotal = deploymentsQuery.data?.pages[0]?.total ?? 0;
  const logPanelFilters: ObservabilityLogsFilters = {
    deploymentStamp: deploymentStampFilter,
    level,
    query,
    requestId: requestIdFilter,
    route: routeFilter,
    source,
    status: statusFilter,
    user: userFilter,
  };

  const refresh = () => {
    void projectsQuery.refetch();
    void watcherQuery.refetch();
    void overviewQuery.refetch();
    void analyticsQuery.refetch();
    void logsQuery.refetch();
    void deploymentsQuery.refetch();
    void resourcesQuery.refetch();
  };

  const updateLogFilters = (next: Partial<ObservabilityLogsFilters>) => {
    if (next.query != null) setQuery(next.query);
    if (next.level != null) setLevel(next.level as typeof level);
    if (next.source != null) setSource(next.source as typeof source);
    if (next.status != null) setStatusFilter(next.status);
    if (next.route != null) setRouteFilter(next.route);
    if (next.requestId != null) setRequestIdFilter(next.requestId);
    if (next.user != null) setUserFilter(next.user);
    if (next.deploymentStamp != null) {
      setDeploymentStampFilter(next.deploymentStamp);
    }
  };

  if (overviewQuery.isError) {
    return (
      <ErrorState
        message={overviewQuery.error.message}
        onRetry={() => void overviewQuery.refetch()}
        t={t}
      />
    );
  }

  return (
    <div className="space-y-4">
      <ModeHeader
        Icon={Icon}
        mode={mode}
        onRefresh={refresh}
        projectControls={
          <ProjectControls
            level={level}
            onLevelChange={setLevel}
            onProjectChange={setProjectId}
            onQueryChange={setQuery}
            onSourceChange={setSource}
            onTimeframeChange={setTimeframeHours}
            projectId={projectId}
            projects={projects}
            query={query}
            source={source}
            t={t}
            timeframeHours={timeframeHours}
          />
        }
        t={t}
      />
      {overviewQuery.isPending ? (
        <section className="grid overflow-hidden rounded-lg border border-border md:grid-cols-4">
          <LoadingSkeleton rows={1} />
          <LoadingSkeleton rows={1} />
          <LoadingSkeleton rows={1} />
          <LoadingSkeleton rows={1} />
        </section>
      ) : (
        <ObservabilityMetricSummary overview={overviewQuery.data} t={t} />
      )}
      {selectedProject ? (
        <ProjectScope
          project={selectedProject}
          t={t}
          watcherHealth={watcherQuery.data?.watcher.health}
          watcherLastCheckAt={watcherQuery.data?.watcher.lastCheckAt}
        />
      ) : null}
      {mode === 'overview' ? (
        <OverviewPanel
          analytics={analyticsQuery.data}
          overview={overviewQuery.data}
          t={t}
        />
      ) : null}
      {mode === 'analytics' ? (
        <AnalyticsPanel
          analytics={analyticsQuery.data}
          overview={overviewQuery.data}
          t={t}
        />
      ) : null}
      {mode === 'observability' ? (
        <SignalsPanel
          analytics={analyticsQuery.data}
          overview={overviewQuery.data}
          t={t}
        />
      ) : null}
      {mode === 'logs' ? (
        <LogsPanel
          emptyLabel={t('empty.logs')}
          endLabel={t('infinite.end')}
          facets={logFacets}
          filters={logPanelFilters}
          groups={logs}
          hasMore={logsQuery.hasNextPage}
          isFetchingMore={logsQuery.isFetchingNextPage}
          isLoading={logsQuery.isLoading}
          isPaused={logsPaused}
          loaded={logs.length}
          loadingLabel={t('infinite.loading')}
          moreLabel={t('load_older')}
          onFilterChange={updateLogFilters}
          onLoadMore={() => void logsQuery.fetchNextPage()}
          onRefresh={() => void logsQuery.refetch()}
          onTogglePaused={() => setLogsPaused((current) => !current)}
          t={t}
          total={logsTotal}
        />
      ) : null}
      {mode === 'deployments' ? (
        <DeploymentsPanel
          deployments={deployments}
          emptyLabel={t('empty.deployments')}
          hasMore={deploymentsQuery.hasNextPage}
          isFetchingMore={deploymentsQuery.isFetchingNextPage}
          isLoading={deploymentsQuery.isLoading}
          loaded={deployments.length}
          loadingLabel={t('infinite.loading')}
          moreLabel={t('load_older')}
          onLoadMore={() => void deploymentsQuery.fetchNextPage()}
          snapshot={watcherQuery.data ?? null}
          t={t}
          total={deploymentsTotal}
        />
      ) : null}
      {mode === 'projects' ? (
        <ProjectsPanel
          activeProjectId={projectId}
          createError={createProjectMutation.error?.message}
          isCreating={createProjectMutation.isPending}
          isLoading={projectsQuery.isLoading}
          isMutating={
            updateProjectMutation.isPending ||
            syncProjectMutation.isPending ||
            deployProjectMutation.isPending
          }
          onCreateProject={(payload) =>
            createProjectMutation.mutate(payload, {
              onSuccess: (response) => setProjectId(response.project.id),
            })
          }
          onDeployProject={(project) => deployProjectMutation.mutate(project)}
          onSelectProject={setProjectId}
          onSyncProject={(project) => syncProjectMutation.mutate(project)}
          onUpdateProject={(project, payload) =>
            updateProjectMutation.mutate({ payload, project })
          }
          projects={projects}
          t={t}
        />
      ) : null}
      {mode === 'resources' ? (
        <ResourcesPanel
          data={resourcesQuery.data}
          isLoading={resourcesQuery.isLoading}
          onTimeframeHoursChange={setTimeframeHours}
          scopedContainers={scopedContainers}
          t={t}
          timeframeHours={timeframeHours}
        />
      ) : null}
    </div>
  );
}

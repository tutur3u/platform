'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2 } from '@tuturuuu/icons';
import { MyTasksFilters } from '@tuturuuu/tasks-ui/tu-do/my-tasks/my-tasks-filters';
import { MyTasksHeader } from '@tuturuuu/tasks-ui/tu-do/my-tasks/my-tasks-header';
import TaskList from '@tuturuuu/tasks-ui/tu-do/my-tasks/task-list';
import { useMyTasksState } from '@tuturuuu/tasks-ui/tu-do/my-tasks/use-my-tasks-state';
import type {
  JsonRenderComponentContext,
  JsonRenderMyTasksProps,
  JsonRenderTimeTrackingStatsProps,
  JsonRenderTimeTrackingStatsResponse,
  JsonRenderWorkspaceSummary,
} from '@tuturuuu/types';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { useWorkspaceUser } from '@tuturuuu/ui/hooks/use-workspace-user';
import { Progress } from '@tuturuuu/ui/progress';
import { useParams } from 'next/navigation';
import { formatDurationLabel, resolveStatsRange } from '../shared';

const timeTrackingLabels = {
  en: {
    statsTitle: 'Time Tracking Stats',
    noStatsAvailable: 'No stats available yet.',
    overviewTitle: 'Overview',
    totalTime: 'Total time',
    sessions: 'Sessions',
    avgSession: 'Average session',
    bestTimeOfDay: 'Best time of day',
    notAvailable: 'N/A',
    topCategories: 'Top categories',
    noCategoryData: 'No category data available.',
    dailyBreakdown: 'Daily breakdown',
    noDailyData: 'No daily data available.',
  },
  vi: {
    statsTitle: 'Thống kê theo dõi thời gian',
    noStatsAvailable: 'Chưa có dữ liệu thống kê.',
    overviewTitle: 'Tổng quan',
    totalTime: 'Tổng thời gian',
    sessions: 'Số phiên',
    avgSession: 'Phiên trung bình',
    bestTimeOfDay: 'Khung giờ hiệu quả nhất',
    notAvailable: 'Không có',
    topCategories: 'Danh mục hàng đầu',
    noCategoryData: 'Chưa có dữ liệu theo danh mục.',
    dailyBreakdown: 'Phân tích theo ngày',
    noDailyData: 'Chưa có dữ liệu theo ngày.',
  },
} as const;

const resolveLocale = (
  locale: string | undefined
): keyof typeof timeTrackingLabels => {
  if (!locale) return 'en';
  return locale.toLowerCase().startsWith('vi') ? 'vi' : 'en';
};

export function useWorkspace(wsId: string): {
  data: JsonRenderWorkspaceSummary | null;
  isLoading: boolean;
} {
  const { data, isLoading } = useQuery<JsonRenderWorkspaceSummary | null>({
    queryKey: ['workspace', wsId],
    queryFn: async () => {
      const res = await fetch(`/api/workspaces/${wsId}`, {
        cache: 'no-store',
      });
      if (!res.ok) return null;
      return (await res.json()) as JsonRenderWorkspaceSummary;
    },
    enabled: !!wsId,
    staleTime: 5 * 60 * 1000,
  });

  return {
    data: data ?? null,
    isLoading,
  };
}

export const dashboardTaskComponents = {
  MyTasks: ({ props }: JsonRenderComponentContext<JsonRenderMyTasksProps>) => {
    const params = useParams();
    const wsId = params.wsId as string;
    const { data: user, isLoading: userLoading } = useWorkspaceUser();

    const { data: workspace, isLoading: workspaceLoading } = useWorkspace(wsId);

    const state = useMyTasksState({
      wsId,
      userId: user?.id || '',
      isPersonal: workspace?.personal || false,
    });

    if (userLoading || workspaceLoading)
      return (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      );

    if (!user || !workspace) return null;

    return (
      <div className="flex flex-col gap-6">
        {props.showSummary && (
          <MyTasksHeader
            overdueCount={state.filteredTasks.overdueTasks?.length ?? 0}
            todayCount={state.filteredTasks.todayTasks?.length ?? 0}
            upcomingCount={state.filteredTasks.upcomingTasks?.length ?? 0}
          />
        )}

        {props.showFilters && (
          <MyTasksFilters
            workspacesData={state.workspacesData || []}
            allBoardsData={state.allBoardsData}
            taskFilters={state.taskFilters}
            setTaskFilters={state.setTaskFilters}
            availableLabels={state.availableLabels}
            availableProjects={state.availableProjects}
            workspaceLabels={state.workspaceLabels}
            workspaceProjects={state.workspaceProjects}
            onFilterChange={state.handleFilterChange}
            onLabelFilterChange={state.handleLabelFilterChange}
            onProjectFilterChange={state.handleProjectFilterChange}
            onCreateNewBoard={() => state.setNewBoardDialogOpen(true)}
          />
        )}

        <TaskList
          wsId={wsId}
          userId={user.id}
          isPersonal={workspace.personal}
          commandBarLoading={state.commandBarLoading}
          queryLoading={state.queryLoading}
          overdueTasks={state.filteredTasks.overdueTasks}
          todayTasks={state.filteredTasks.todayTasks}
          upcomingTasks={state.filteredTasks.upcomingTasks}
          completedTasks={state.completedTasks}
          totalActiveTasks={
            (state.filteredTasks.overdueTasks?.length || 0) +
            (state.filteredTasks.todayTasks?.length || 0) +
            (state.filteredTasks.upcomingTasks?.length || 0)
          }
          totalCompletedTasks={state.totalCompletedTasks}
          hasMoreCompleted={state.hasMoreCompleted}
          isFetchingMoreCompleted={state.isFetchingMoreCompleted}
          onFetchMoreCompleted={state.fetchMoreCompleted}
          collapsedSections={state.collapsedSections}
          toggleSection={state.toggleSection}
          handleUpdate={state.handleUpdate}
          availableLabels={state.availableLabels}
          onCreateNewLabel={() => state.setNewLabelDialogOpen(true)}
        />
      </div>
    );
  },
  TimeTrackingStats: ({
    props,
  }: JsonRenderComponentContext<JsonRenderTimeTrackingStatsProps>) => {
    const params = useParams();
    const wsId = params.wsId as string;
    const labels =
      timeTrackingLabels[
        resolveLocale(
          typeof params.locale === 'string' ? params.locale : undefined
        )
      ];
    const maxItems = props.maxItems || 5;
    const showBreakdown = props.showBreakdown !== false;
    const showDailyBreakdown = props.showDailyBreakdown !== false;

    const { data: user, isLoading: userLoading } = useWorkspaceUser();

    const { data: workspace, isLoading: workspaceLoading } = useWorkspace(wsId);

    const range = resolveStatsRange(props.period, props.dateFrom, props.dateTo);

    const { data: stats, isLoading: statsLoading } =
      useQuery<JsonRenderTimeTrackingStatsResponse | null>({
        queryKey: [
          'workspace',
          wsId,
          'time-tracking',
          'stats',
          'period',
          user?.id,
          range.from.toISOString(),
          range.to.toISOString(),
        ],
        queryFn: async () => {
          if (!user?.id) return null;

          const timezone =
            Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

          const query = new URLSearchParams({
            dateFrom: range.from.toISOString(),
            dateTo: range.to.toISOString(),
            timezone,
            userId: user.id,
          });

          const res = await fetch(
            `/api/v1/workspaces/${encodeURIComponent(wsId)}/time-tracking/stats/period?${query.toString()}`,
            { cache: 'no-store' }
          );

          if (!res.ok) return null;
          return (await res.json()) as JsonRenderTimeTrackingStatsResponse;
        },
        enabled: !!wsId && !!user?.id && !!workspace,
      });

    if (userLoading || workspaceLoading || statsLoading) {
      return (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (!user || !workspace || !stats) {
      return (
        <Card className="my-2 border border-border/60 bg-card/60">
          <CardHeader>
            <CardTitle className="text-lg">{labels.statsTitle}</CardTitle>
            <CardDescription>{labels.noStatsAvailable}</CardDescription>
          </CardHeader>
        </Card>
      );
    }

    const totalDuration = Number(stats.totalDuration) || 0;
    const sessionCount = Number(stats.sessionCount) || 0;
    const averageDuration =
      sessionCount > 0 ? Math.round(totalDuration / sessionCount) : 0;

    const topBreakdown = Array.isArray(stats.breakdown)
      ? stats.breakdown.slice(0, maxItems)
      : [];

    const topDaily = Array.isArray(stats.dailyBreakdown)
      ? stats.dailyBreakdown.slice(0, maxItems)
      : [];

    const bestTimeOfDayLabel =
      typeof stats.bestTimeOfDay === 'string' && stats.bestTimeOfDay !== 'none'
        ? stats.bestTimeOfDay
        : 'N/A';

    return (
      <div className="flex flex-col gap-4">
        <Card className="my-2 border border-border/60 bg-card/60">
          <CardHeader>
            <CardTitle className="text-lg">{labels.overviewTitle}</CardTitle>
            <CardDescription>{range.label}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-lg border bg-surface p-4">
                <p className="text-muted-foreground text-sm">
                  {labels.totalTime}
                </p>
                <p className="font-bold text-xl">
                  {formatDurationLabel(totalDuration)}
                </p>
              </div>
              <div className="rounded-lg border bg-surface p-4">
                <p className="text-muted-foreground text-sm">
                  {labels.sessions}
                </p>
                <p className="font-bold text-xl">{sessionCount}</p>
              </div>
              <div className="rounded-lg border bg-surface p-4">
                <p className="text-muted-foreground text-sm">
                  {labels.avgSession}
                </p>
                <p className="font-bold text-xl">
                  {formatDurationLabel(averageDuration)}
                </p>
              </div>
              <div className="rounded-lg border bg-surface p-4">
                <p className="text-muted-foreground text-sm">
                  {labels.bestTimeOfDay}
                </p>
                <p className="font-bold text-xl capitalize">
                  {bestTimeOfDayLabel !== 'N/A'
                    ? bestTimeOfDayLabel
                    : labels.notAvailable}
                </p>
              </div>
            </div>

            {showBreakdown && (
              <div className="space-y-2">
                <p className="font-medium text-sm">{labels.topCategories}</p>
                {topBreakdown.length === 0 && (
                  <p className="text-muted-foreground text-sm">
                    {labels.noCategoryData}
                  </p>
                )}
                {topBreakdown.map((item, index: number) => {
                  const share =
                    totalDuration > 0
                      ? (item.duration / totalDuration) * 100
                      : 0;
                  return (
                    <div
                      key={`${item.name}-${index}`}
                      className="space-y-1 rounded-md border p-2"
                    >
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate font-medium">
                          {item.name}
                        </span>
                        <span className="text-muted-foreground">
                          {formatDurationLabel(item.duration || 0)}
                        </span>
                      </div>
                      <Progress value={share} className="h-2" />
                    </div>
                  );
                })}
              </div>
            )}

            {showDailyBreakdown && (
              <div className="space-y-2">
                <p className="font-medium text-sm">{labels.dailyBreakdown}</p>
                {topDaily.length === 0 && (
                  <p className="text-muted-foreground text-sm">
                    {labels.noDailyData}
                  </p>
                )}
                {topDaily.map((item, index: number) => (
                  <div
                    key={`${item.date}-${index}`}
                    className="flex items-center justify-between rounded-md border p-2 text-sm"
                  >
                    <span className="font-medium">{item.date}</span>
                    <span className="text-muted-foreground">
                      {formatDurationLabel(item.totalDuration || 0)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  },
};

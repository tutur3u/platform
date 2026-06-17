'use client';

import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
} from '@tuturuuu/icons';
import {
  InternalApiError,
  listWorkspaceGroupReportDashboard,
  type WorkspaceGroupReportDashboardReport,
  type WorkspaceGroupReportDashboardResponse,
} from '@tuturuuu/internal-api';
import type { WorkspaceUserReport } from '@tuturuuu/types';
import type { WorkspaceConfig } from '@tuturuuu/types/primitives/WorkspaceConfig';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Combobox, type ComboboxOption } from '@tuturuuu/ui/custom/combobox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { useLocalStorage } from '@tuturuuu/ui/hooks/use-local-storage';
import { useWorkspaceConfigs } from '@tuturuuu/ui/hooks/use-workspace-config';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { parseAsString, useQueryStates } from 'nuqs';
import { useEffect, useMemo, useState } from 'react';
import { availableConfigs } from '@/constants/configs/reports';
import {
  getReportSelectionRecovery,
  getReportsDashboardErrorKind,
  type ReportSelectionRecovery,
} from '@/features/reports/group-report-dashboard';
import EditableReportPreview from '../../../reports/[reportId]/editable-report-preview';
import {
  type ReportStatusCounts,
  ReportStatusIndicator,
} from '../../../reports/components/report-status-indicator';
import {
  getWorkspaceUserArchiveState,
  sortWorkspaceUsersByArchive,
} from '../../../reports/user-archive';
import { BulkReportExporter } from './components/bulk-report-exporter';

// Feature flag for experimental factor functionality
const ENABLE_FACTOR_CALCULATION = false;

type ReportWithNames = WorkspaceGroupReportDashboardReport;

interface Props {
  wsId: string;
  groupId: string;
  groupNameFallback: string;
  canCheckUserAttendance: boolean;
  canApproveReports: boolean;
  canCreateReports: boolean;
  canUpdateReports: boolean;
  canDeleteReports: boolean;
}

export default function GroupReportsClient({
  wsId,
  groupId,
  groupNameFallback,
  canCheckUserAttendance,
  canApproveReports,
  canCreateReports,
  canUpdateReports,
  canDeleteReports,
}: Props) {
  const t = useTranslations();
  const locale = useLocale();
  const { dateTime } = useFormatter();
  const { resolvedTheme } = useTheme();

  const [bulkExportOpen, setBulkExportOpen] = useState(false);
  const [bulkExportTheme, setBulkExportTheme] = useState<'light' | 'dark'>(
    resolvedTheme === 'dark' ? 'dark' : 'light'
  );
  const [bulkReportsToExport, setBulkReportsToExport] = useState<
    WorkspaceUserReport[]
  >([]);
  const [isPreparingBulkExport, setIsPreparingBulkExport] = useState(false);

  const resolveCurrentReportPreviewTheme = (): 'light' | 'dark' => {
    const fallbackTheme = resolvedTheme === 'dark' ? 'dark' : 'light';
    const rawTheme = window.localStorage.getItem('reportPreviewTheme');

    if (!rawTheme) return fallbackTheme;

    try {
      const parsedTheme = JSON.parse(rawTheme);
      if (parsedTheme === 'dark' || parsedTheme === 'light') {
        return parsedTheme;
      }
      if (parsedTheme === 'auto') {
        return fallbackTheme;
      }
    } catch {
      return fallbackTheme;
    }

    return fallbackTheme;
  };

  const [scoreCalculationMethod] = useLocalStorage<'AVERAGE' | 'LATEST'>(
    'scoreCalculationMethod',
    'LATEST'
  );

  const [queryParams, setQueryParams] = useQueryStates(
    {
      userId: parseAsString,
      reportId: parseAsString,
    },
    {
      history: 'replace',
    }
  );

  const userId = queryParams.userId;
  const reportId = queryParams.reportId;

  const dashboardQuery = useQuery({
    queryKey: [
      'ws',
      wsId,
      'group',
      groupId,
      'reports-dashboard',
      userId,
      reportId,
    ],
    queryFn: (): Promise<WorkspaceGroupReportDashboardResponse> =>
      listWorkspaceGroupReportDashboard({
        groupId,
        reportId,
        userId,
        workspaceId: wsId,
      }),
    enabled: Boolean(wsId && groupId),
  });

  const managerUserIds = useMemo(() => {
    return new Set((dashboardQuery.data?.managers ?? []).map((m) => m.id));
  }, [dashboardQuery.data?.managers]);

  const userStatusMap = useMemo(() => {
    const map = new Map<string, ReportStatusCounts>();
    for (const row of dashboardQuery.data?.userStatusSummary ?? []) {
      map.set(row.user_id, {
        pending_count: row.pending_count,
        approved_count: row.approved_count,
        rejected_count: row.rejected_count,
      });
    }
    return map;
  }, [dashboardQuery.data?.userStatusSummary]);

  const filteredUsers = useMemo(() => {
    if (!dashboardQuery.data?.users) return [];
    return sortWorkspaceUsersByArchive(
      dashboardQuery.data.users.filter((u) => !managerUserIds.has(u.id))
    );
  }, [dashboardQuery.data?.users, managerUserIds]);

  const userOptions: ComboboxOption[] = useMemo(
    () =>
      filteredUsers.map((u) => {
        const archiveState = getWorkspaceUserArchiveState(u);
        const badgeLabel =
          archiveState === 'active'
            ? t('ws-users.status_active')
            : archiveState === 'temporary-archived'
              ? t('ws-users.status_archived_until')
              : t('ws-users.status_archived');

        return {
          value: u.id,
          label: u.full_name || 'No name',
          description:
            archiveState === 'temporary-archived' && u.archived_until
              ? dateTime(new Date(u.archived_until), {
                  dateStyle: 'medium',
                })
              : undefined,
          badge: (
            <Badge
              variant="outline"
              className={cn(
                'h-5 shrink-0 rounded-full px-1.5 text-[10px] leading-none',
                archiveState === 'active' &&
                  'border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green',
                archiveState === 'temporary-archived' &&
                  'border-dynamic-yellow/30 bg-dynamic-yellow/10 text-dynamic-yellow',
                archiveState === 'archived' &&
                  'border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red'
              )}
            >
              {badgeLabel}
            </Badge>
          ),
          icon: <ReportStatusIndicator counts={userStatusMap.get(u.id)} />,
          muted: archiveState !== 'active',
        };
      }) ?? [],
    [dateTime, filteredUsers, t, userStatusMap]
  );

  const selectedUserOption = useMemo(
    () => userOptions.find((option) => option.value === userId),
    [userId, userOptions]
  );
  const currentUserIndex = useMemo(() => {
    if (!userId) return -1;
    return filteredUsers.findIndex((u) => u.id === userId);
  }, [userId, filteredUsers]);

  const totalUsers = filteredUsers.length;

  const goToUser = (index: number) => {
    const user = filteredUsers[index];
    if (user?.id) {
      setQueryParams({ userId: user.id, reportId: null });
    }
  };

  const reportsOptions = useMemo(
    () =>
      dashboardQuery.data?.reports.map((r) => ({
        value: r.id,
        label: r.title || 'No title',
        status: r.report_approval_status,
      })) ?? [],
    [dashboardQuery.data?.reports]
  );

  // Auto-select first user when users load and none is selected
  useEffect(() => {
    if (!userId && filteredUsers.length > 0) {
      const firstUser = filteredUsers[0];
      if (firstUser?.id) {
        setQueryParams({ userId: firstUser.id, reportId: null });
      }
    }
  }, [userId, filteredUsers, setQueryParams]);

  // Auto-select first report when reports load and none is selected
  // If no reports exist, default to "new"
  useEffect(() => {
    if (userId && !reportId && dashboardQuery.data?.reports) {
      if (dashboardQuery.data.reports.length > 0) {
        const firstReport = dashboardQuery.data.reports[0];
        if (firstReport?.id) {
          setQueryParams({ reportId: firstReport.id });
        }
      } else if (canCreateReports) {
        setQueryParams({ reportId: 'new' });
      }
    }
  }, [
    userId,
    reportId,
    dashboardQuery.data?.reports,
    setQueryParams,
    canCreateReports,
  ]);

  const reportDetail = dashboardQuery.data?.reportDetail;
  const reportSelectionRecovery: ReportSelectionRecovery = useMemo(() => {
    if (!userId) return { action: 'none' };

    return getReportSelectionRecovery({
      canCreateReports,
      reportDetail,
      reportId,
      reports: dashboardQuery.data?.reports,
    });
  }, [
    canCreateReports,
    dashboardQuery.data?.reports,
    reportDetail,
    reportId,
    userId,
  ]);

  useEffect(() => {
    if (!dashboardQuery.isSuccess) return;

    if (reportSelectionRecovery.action === 'set-report') {
      setQueryParams({ reportId: reportSelectionRecovery.reportId });
      return;
    }

    if (reportSelectionRecovery.action === 'clear-report') {
      setQueryParams({ reportId: null });
    }
  }, [dashboardQuery.isSuccess, reportSelectionRecovery, setQueryParams]);

  // Local state to allow overriding displayed group manager for export/preview only
  const [selectedManagerName, setSelectedManagerName] = useState<
    string | undefined
  >(undefined);

  // Initialize/reset selected manager based on available managers and current report
  useEffect(() => {
    const names = (dashboardQuery.data?.managers ?? [])
      .map((m) => m.full_name)
      .filter((n): n is string => Boolean(n));
    if (!names.length) {
      setSelectedManagerName(undefined);
      return;
    }
    // Prefer existing report creator_name if present; otherwise default to first
    const existing = reportDetail?.creator_name;
    if (existing && names.includes(existing)) setSelectedManagerName(existing);
    else if (reportId === 'new') setSelectedManagerName(names[0]);
    else if (selectedManagerName === undefined)
      setSelectedManagerName(names[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    dashboardQuery.data?.managers,
    reportDetail?.creator_name,
    reportId,
    selectedManagerName,
  ]);

  // Extract config IDs from availableConfigs for batch fetching (filter out any without id)
  const configIds = useMemo(
    () =>
      availableConfigs
        .map((config) => config.id)
        .filter((id): id is string => Boolean(id)),
    []
  );

  // Use batch query to fetch workspace configs
  const configsQuery = useWorkspaceConfigs(wsId, configIds);

  // Transform the fetched config data into WorkspaceConfig[] format
  const configsData: WorkspaceConfig[] = useMemo(() => {
    const fetchedConfigs = configsQuery.data;
    if (!fetchedConfigs) return [];

    // Merge fetched values with availableConfigs defaults
    return availableConfigs
      .filter((config): config is typeof config & { id: string } =>
        Boolean(config.id)
      )
      .map((baseConfig) => {
        const fetchedValue = fetchedConfigs[baseConfig.id];
        return {
          ...baseConfig,
          value: fetchedValue ?? baseConfig.defaultValue,
        } as WorkspaceConfig;
      });
  }, [configsQuery.data]);

  const isLoading = dashboardQuery.isLoading || configsQuery.isLoading;
  const dashboardRequestError =
    dashboardQuery.error instanceof InternalApiError
      ? dashboardQuery.error
      : null;
  const reportLoadErrorCode =
    dashboardRequestError?.code ??
    (dashboardQuery.isError
      ? 'REPORTS_REQUEST_FAILED'
      : configsQuery.isError
        ? 'REPORTS_CONFIG_FETCH_FAILED'
        : null);
  const reportLoadErrorStatus = dashboardRequestError?.status ?? null;
  const reportLoadErrorKind = getReportsDashboardErrorKind({
    code: reportLoadErrorCode,
    status: reportLoadErrorStatus,
  });
  const reportLoadErrorDescription =
    reportLoadErrorKind === 'permission'
      ? t('ws-reports.dashboard_error_permission_description')
      : reportLoadErrorKind === 'rate-limit'
        ? t('ws-reports.dashboard_error_rate_limit_description')
        : reportLoadErrorKind === 'not-found'
          ? t('ws-reports.dashboard_error_not_found_description')
          : t('ws-reports.dashboard_error_description');

  const selectedReport: ReportWithNames | Partial<ReportWithNames> | undefined =
    useMemo(() => {
      if (reportId === 'new' && userId) {
        // Calculate scores and average from healthcare vitals
        const vitals = dashboardQuery.data?.userGroupMetrics ?? [];

        const scores = vitals
          .filter(
            (vital) =>
              vital.is_weighted &&
              vital.value !== null &&
              vital.value !== undefined
          )
          .map((vital) => {
            const baseValue = vital.value ?? 0;
            // Apply factor only if feature flag is enabled
            return ENABLE_FACTOR_CALCULATION
              ? baseValue * (vital.factor ?? 1)
              : baseValue;
          });

        const representativeScore =
          scores.length > 0
            ? scoreCalculationMethod === 'LATEST'
              ? (scores[scores.length - 1] ?? null)
              : scores.reduce((sum, score) => sum + score, 0) / scores.length
            : null;

        const selectedUserData = dashboardQuery.data?.users.find(
          (u) => u.id === userId
        );
        const userFullName = selectedUserData?.full_name ?? undefined;

        return {
          user_id: userId,
          group_id: groupId,
          group_name: dashboardQuery.data?.group?.name ?? groupNameFallback,
          user_name: userFullName,
          user_archived: selectedUserData?.archived ?? undefined,
          user_archived_until: selectedUserData?.archived_until ?? undefined,
          user_note: selectedUserData?.note ?? undefined,
          // creator_name will be overridden below via selectedManagerName when passed to preview
          created_at: new Date().toISOString(),
          scores: scores.length > 0 ? scores : [],
          score: representativeScore,
        } as Partial<ReportWithNames>;
      }
      // Only use cached detail data when a valid reportId is present
      if (reportId && reportDetail) return reportDetail;
      return undefined;
    }, [
      reportId,
      userId,
      groupId,
      groupNameFallback,
      reportDetail,
      dashboardQuery.data?.userGroupMetrics,
      dashboardQuery.data?.group?.name,
      dashboardQuery.data?.users,
      scoreCalculationMethod,
    ]);

  // Compute effective creator (group manager) name for preview/export only
  const selectedReportCreatorName = (
    selectedReport as Partial<ReportWithNames> | undefined
  )?.creator_name;
  const effectiveCreatorName = selectedManagerName ?? selectedReportCreatorName;

  const managerOptions: ComboboxOption[] = useMemo(
    () =>
      (dashboardQuery.data?.managers ?? [])
        .map((m) => ({
          value: m.full_name || '',
          label: m.full_name || 'No name',
        }))
        .filter((o) => Boolean(o.value)),
    [dashboardQuery.data?.managers]
  );

  const handleBulkExport = async (filter: 'ALL' | 'APPROVED') => {
    const titleFilter = selectedReport?.title;

    if (!titleFilter) {
      toast.error(t('ws-reports.export_title_missing'));
      return;
    }

    setBulkExportTheme(resolveCurrentReportPreviewTheme());
    setIsPreparingBulkExport(true);
    try {
      const searchParams = new URLSearchParams({
        title: titleFilter,
        status: filter,
      });

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/users/reports/groups/${groupId}/bulk-export?${searchParams.toString()}`,
        { cache: 'no-store' }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch reports for bulk export');
      }

      const mappedReports = await response.json();

      if (!mappedReports || mappedReports.length === 0) {
        toast.error(t('ws-reports.no_reports_found'));
        return;
      }

      setBulkReportsToExport(mappedReports);
      setBulkExportOpen(true);
    } catch (error) {
      console.error('Failed to fetch reports for bulk export:', error);
      toast.error(t('ws-reports.failed_fetch_reports'));
    } finally {
      setIsPreparingBulkExport(false);
    }
  };

  const hasReportLoadError = dashboardQuery.isError || configsQuery.isError;
  const hasNoReportsForSelectedUser = Boolean(
    userId &&
      dashboardQuery.data &&
      dashboardQuery.data.reports.length === 0 &&
      reportId !== 'new'
  );
  const emptyReportTitle = hasNoReportsForSelectedUser
    ? t('ws-reports.no_reports_found')
    : t('ws-reports.no_report_selected');
  const emptyReportDescription = hasNoReportsForSelectedUser
    ? canCreateReports
      ? t('ws-reports.no_reports_for_user_create_description')
      : t('ws-reports.no_reports_for_user_description')
    : reportId && reportId !== 'new'
      ? t('ws-reports.selected_report_missing_description')
      : t('ws-reports.select_report_description');

  const reportContent = hasReportLoadError ? (
    <div className="flex min-h-100 w-full items-center justify-center rounded-lg border border-dashed py-20">
      <div className="flex flex-col items-center gap-2 text-center">
        <AlertCircle className="h-8 w-8 text-dynamic-red" />
        <p className="font-medium text-sm">
          {t('ws-reports.dashboard_error_title')}
        </p>
        <p className="max-w-md text-muted-foreground text-sm">
          {reportLoadErrorDescription}
        </p>
        {reportLoadErrorCode && (
          <Badge variant="outline" className="font-mono text-xs">
            {reportLoadErrorStatus
              ? t('ws-reports.troubleshooting_code_with_status', {
                  code: reportLoadErrorCode,
                  status: reportLoadErrorStatus,
                })
              : t('ws-reports.troubleshooting_code', {
                  code: reportLoadErrorCode,
                })}
          </Badge>
        )}
      </div>
    </div>
  ) : groupId && userId ? (
    isLoading ? (
      <div className="w-full space-y-4 rounded-lg border p-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-1/3" />
          <Skeleton className="h-8 w-24" />
        </div>
        <Skeleton className="h-4 w-1/4" />
        <div className="space-y-3 pt-2">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={`report-skel-${i}`} className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
      </div>
    ) : selectedReport && configsData.length > 0 ? (
      <>
        {reportDetail?.report_approval_status === 'REJECTED' && (
          <div className="mb-4 flex items-start gap-2 rounded-md border border-dynamic-red/20 bg-dynamic-red/5 p-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-dynamic-red" />
            <div>
              <p className="font-medium text-dynamic-red text-sm">
                {t('ws-reports.rejected')}
              </p>
              {reportDetail.rejection_reason && (
                <p className="mt-0.5 text-dynamic-red/80 text-sm">
                  {reportDetail.rejection_reason}
                </p>
              )}
            </div>
          </div>
        )}
        <EditableReportPreview
          key={reportId === 'new' ? `new-${userId}-${groupId}` : reportId}
          wsId={wsId}
          report={{
            ...selectedReport,
            user_name: selectedReport?.user_name ?? undefined,
            group_name:
              selectedReport.group_name ??
              dashboardQuery.data?.group?.name ??
              groupNameFallback,
            creator_name: effectiveCreatorName ?? undefined,
          }}
          configs={configsData}
          isNew={reportId === 'new'}
          canApproveReports={canApproveReports}
          canCreateReports={canCreateReports}
          canUpdateReports={canUpdateReports}
          canDeleteReports={canDeleteReports}
          groupId={groupId}
          userGroupMetrics={dashboardQuery.data?.userGroupMetrics ?? []}
          userGroupMetricsLoading={dashboardQuery.isLoading}
          factorEnabled={ENABLE_FACTOR_CALCULATION}
          managerOptions={managerOptions}
          selectedManagerName={effectiveCreatorName ?? undefined}
          onChangeManagerAction={(name) => setSelectedManagerName(name)}
          canCheckUserAttendance={canCheckUserAttendance}
          feedbackUser={
            userId
              ? ({
                  id: userId,
                  full_name: dashboardQuery.data?.users.find(
                    (u) => u.id === userId
                  )?.full_name,
                } as WorkspaceUser)
              : null
          }
          feedbackGroupName={
            dashboardQuery.data?.group?.name ?? groupNameFallback
          }
          canEditFeedback={canUpdateReports}
          canDeleteFeedback={canDeleteReports}
        />
      </>
    ) : (
      <div className="flex min-h-100 w-full items-center justify-center rounded-lg border border-dashed py-20">
        <div className="flex flex-col items-center gap-2 text-center">
          <AlertCircle className="h-8 w-8 text-dynamic-yellow" />
          <p className="font-medium text-sm">{emptyReportTitle}</p>
          <p className="max-w-md text-muted-foreground text-sm">
            {emptyReportDescription}
          </p>
        </div>
      </div>
    )
  ) : null;

  return (
    <div className="flex min-h-full w-full flex-col">
      <BulkReportExporter
        open={bulkExportOpen}
        onOpenChange={setBulkExportOpen}
        reports={bulkReportsToExport}
        configs={configsData}
        lang={locale}
        theme={bulkExportTheme}
      />
      <div className="mb-4 flex flex-row items-center justify-between gap-2">
        <div className="flex flex-1 flex-col gap-2 md:flex-row md:items-center">
          <div className="flex w-full items-center gap-1 sm:w-80 md:w-96">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              disabled={dashboardQuery.isLoading || currentUserIndex <= 0}
              onClick={() => goToUser(currentUserIndex - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Combobox
              t={t}
              key="user-combobox"
              options={userOptions}
              selected={userId ?? ''}
              label={
                currentUserIndex >= 0 &&
                totalUsers > 0 &&
                selectedUserOption ? (
                  <div className="flex min-w-0 items-center gap-2 text-left">
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="truncate">
                        {selectedUserOption.label}
                      </span>
                      <span className="shrink-0">
                        {selectedUserOption.badge}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 font-medium text-[11px] text-muted-foreground leading-none">
                      {currentUserIndex + 1}/{totalUsers}
                    </span>
                  </div>
                ) : undefined
              }
              placeholder={t('user-data-table.user')}
              disabled={dashboardQuery.isLoading}
              onChange={(val) => {
                const nextUserId =
                  typeof val === 'string'
                    ? val
                    : Array.isArray(val)
                      ? val[0]
                      : '';
                setQueryParams({
                  userId: nextUserId || null,
                  reportId: null,
                });
              }}
              className="min-w-0 flex-1"
            />
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              disabled={
                dashboardQuery.isLoading ||
                currentUserIndex < 0 ||
                currentUserIndex >= totalUsers - 1
              }
              onClick={() => goToUser(currentUserIndex + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {Boolean(userId) && (
            <div className="flex items-center gap-2">
              <div className="min-w-56">
                <Select
                  value={reportId ?? ''}
                  onValueChange={(val) =>
                    setQueryParams({ reportId: val || null })
                  }
                  disabled={dashboardQuery.isLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('ws-reports.select_report')} />
                  </SelectTrigger>
                  <SelectContent>
                    {canCreateReports && (
                      <SelectItem value="new">
                        + {t('ws-reports.new_report')}
                      </SelectItem>
                    )}
                    {reportsOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <span className="flex items-center gap-2">
                          {opt.status === 'APPROVED' && (
                            <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-dynamic-green" />
                          )}
                          {opt.status === 'REJECTED' && (
                            <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-dynamic-red" />
                          )}
                          {opt.status === 'PENDING' && (
                            <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-dynamic-yellow" />
                          )}
                          {opt.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-row items-center gap-2">
          {userId && canCreateReports ? (
            <Button
              type="button"
              onClick={() => setQueryParams({ reportId: 'new' })}
              disabled={!canCreateReports}
            >
              {t('common.new')}
            </Button>
          ) : null}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                disabled={isPreparingBulkExport}
                className="gap-2"
              >
                {isPreparingBulkExport ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {t('ws-reports.export')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleBulkExport('ALL')}>
                {t('ws-reports.export_all_images')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleBulkExport('APPROVED')}>
                {t('ws-reports.export_approved_images')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {reportContent}
    </div>
  );
}

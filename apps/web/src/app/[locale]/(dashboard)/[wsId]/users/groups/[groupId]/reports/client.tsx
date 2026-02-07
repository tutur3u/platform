'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Loader2 } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { WorkspaceUserReport } from '@tuturuuu/types';
import type { WorkspaceConfig } from '@tuturuuu/types/primitives/WorkspaceConfig';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Button } from '@tuturuuu/ui/button';
import { Combobox, type ComboboxOption } from '@tuturuuu/ui/custom/combobox';
import { useLocalStorage } from '@tuturuuu/ui/hooks/use-local-storage';
import { useWorkspaceConfigs } from '@tuturuuu/ui/hooks/use-workspace-config';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';
import { parseAsString, useQueryStates } from 'nuqs';
import { useEffect, useMemo, useState } from 'react';
import { availableConfigs } from '@/constants/configs/reports';
import EditableReportPreview from '../../../reports/[reportId]/editable-report-preview';

// Feature flag for experimental factor functionality
const ENABLE_FACTOR_CALCULATION = false;

type ReportWithNames = WorkspaceUserReport & {
  group_name: string;
  creator_name?: string | null;
  user_name?: string | null;
};

interface Props {
  wsId: string;
  groupId: string;
  groupNameFallback: string;
  canCheckUserAttendance: boolean;
  canCreateReports: boolean;
  canUpdateReports: boolean;
  canDeleteReports: boolean;
}

export default function GroupReportsClient({
  wsId,
  groupId,
  groupNameFallback,
  canCheckUserAttendance,
  canCreateReports,
  canUpdateReports,
  canDeleteReports,
}: Props) {
  const t = useTranslations();

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

  const supabase = createClient();

  const usersQuery = useQuery({
    queryKey: ['ws', wsId, 'group', groupId, 'users'],
    queryFn: async (): Promise<WorkspaceUser[]> => {
      const { data, error } = await supabase
        .rpc('get_workspace_users', {
          _ws_id: wsId,
          included_groups: [groupId],
          excluded_groups: [],
          search_query: '',
        })
        .select('id, full_name')
        .order('full_name', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as WorkspaceUser[];
    },
  });

  const userOptions: ComboboxOption[] = useMemo(
    () =>
      usersQuery.data?.map((u) => ({
        value: u.id,
        label: u.full_name || 'No name',
      })) ?? [],
    [usersQuery.data]
  );

  const reportsQuery = useQuery({
    queryKey: ['ws', wsId, 'group', groupId, 'user', userId, 'reports'],
    enabled: Boolean(userId),
    queryFn: async (): Promise<WorkspaceUserReport[]> => {
      const { data, error } = await supabase
        .from('external_user_monthly_reports')
        .select(
          '*, user:workspace_users!user_id!inner(full_name, ws_id), creator:workspace_users!creator_id(full_name)',
          {
            count: 'exact',
          }
        )
        .eq('user_id', userId!)
        .eq('group_id', groupId)
        .eq('workspace_users.ws_id', wsId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const mapped = (data ?? []).map((raw) => ({
        user_name: raw.user?.full_name,
        creator_name: raw.creator?.full_name,
        ...raw,
      }));
      return mapped as WorkspaceUserReport[];
    },
  });

  const reportsOptions = useMemo(
    () =>
      reportsQuery.data?.map((r) => ({
        value: r.id,
        label: r.title || 'No title',
        status: (r as any).report_approval_status as
          | 'PENDING'
          | 'APPROVED'
          | 'REJECTED'
          | null
          | undefined,
      })) ?? [],
    [reportsQuery.data]
  );

  // Auto-select first user when users load and none is selected
  useEffect(() => {
    if (!userId && usersQuery.data && usersQuery.data.length > 0) {
      const firstUser = usersQuery.data[0];
      if (firstUser?.id) {
        setQueryParams({ userId: firstUser.id, reportId: null });
      }
    }
  }, [userId, usersQuery.data, setQueryParams]);

  // Auto-select first report when reports load and none is selected
  // If no reports exist, default to "new"
  useEffect(() => {
    if (userId && !reportId && reportsQuery.data) {
      if (reportsQuery.data.length > 0) {
        const firstReport = reportsQuery.data[0];
        if (firstReport?.id) {
          setQueryParams({ reportId: firstReport.id });
        }
      } else if (canCreateReports) {
        setQueryParams({ reportId: 'new' });
      }
    }
  }, [userId, reportId, reportsQuery.data, setQueryParams, canCreateReports]);

  const reportDetailQuery = useQuery<ReportWithNames | null>({
    queryKey: [
      'ws',
      wsId,
      'group',
      groupId,
      'user',
      userId,
      'report',
      reportId,
    ],
    enabled: Boolean(reportId && reportId !== 'new'),
    queryFn: async (): Promise<ReportWithNames | null> => {
      const { data, error } = await supabase
        .from('external_user_monthly_reports')
        .select(
          '*, user:workspace_users!user_id!inner(full_name, ws_id), creator:workspace_users!creator_id(full_name), ...workspace_user_groups(group_name:name)',
          {
            count: 'exact',
          }
        )
        .eq('id', reportId!)
        .eq('user_id', userId!)
        .eq('group_id', groupId)
        .eq('user.ws_id', wsId)
        .order('created_at', { ascending: false })
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const mapped = {
        user_name: Array.isArray(data.user)
          ? data.user?.[0]?.full_name
          : (data.user?.full_name ?? undefined),
        creator_name: Array.isArray(data.creator)
          ? data.creator?.[0]?.full_name
          : (data.creator?.full_name ?? undefined),
        ...data,
      } as any;
      const { user: _user, creator: _creator, ...rest } = mapped;
      return rest as ReportWithNames;
    },
  });

  const reportDetail = reportDetailQuery.data as
    | ReportWithNames
    | null
    | undefined;

  const groupQuery = useQuery({
    queryKey: ['ws', wsId, 'group', groupId, 'meta'],
    queryFn: async (): Promise<{ id: string; name: string | null }> => {
      const { data, error } = await supabase
        .from('workspace_user_groups')
        .select('id, name')
        .eq('ws_id', wsId)
        .eq('id', groupId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? { id: groupId, name: groupNameFallback }) as {
        id: string;
        name: string | null;
      };
    },
  });

  // Query to fetch all group managers (teachers)
  const groupManagersQuery = useQuery({
    queryKey: ['ws', wsId, 'group', groupId, 'managers'],
    queryFn: async (): Promise<
      Array<{ id: string; full_name: string | null }>
    > => {
      const { data, error } = await supabase
        .from('workspace_user_groups_users')
        .select('user:workspace_users!inner(id, full_name, ws_id)')
        .eq('group_id', groupId)
        .eq('role', 'TEACHER')
        .eq('user.ws_id', wsId);
      if (error) throw error;
      const rows = (data ?? []) as Array<{ user: any }>;
      const managers: Array<{ id: string; full_name: string | null }> = [];
      for (const row of rows) {
        const u = row?.user;
        if (Array.isArray(u)) {
          const first = u[0];
          if (first)
            managers.push({ id: first.id, full_name: first.full_name ?? null });
        } else if (u) {
          managers.push({ id: u.id, full_name: u.full_name ?? null });
        }
      }
      return managers;
    },
  });

  // Local state to allow overriding displayed group manager for export/preview only
  const [selectedManagerName, setSelectedManagerName] = useState<
    string | undefined
  >(undefined);

  // Initialize/reset selected manager based on available managers and current report
  useEffect(() => {
    const names = (groupManagersQuery.data ?? [])
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
    groupManagersQuery.data,
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

  const isLoading =
    usersQuery.isLoading ||
    (Boolean(userId) && reportsQuery.isLoading) ||
    (Boolean(reportId && reportId !== 'new') && reportDetailQuery.isLoading) ||
    configsQuery.isLoading;

  // Query to fetch healthcare vitals scores for the selected user
  const healthcareVitalsQuery = useQuery({
    queryKey: [
      'ws',
      wsId,
      'group',
      groupId,
      'user',
      userId,
      'healthcare-vitals',
    ],
    enabled: Boolean(userId),
    queryFn: async (): Promise<
      Array<{
        id: string;
        name: string;
        unit: string;
        factor: number;
        value: number | null;
      }>
    > => {
      const { data, error } = await supabase
        .from('user_indicators')
        .select(`
          value,
          healthcare_vitals!inner(
            id,
            name,
            unit,
            factor,
            group_id,
            created_at
          )
        `)
        .eq('user_id', userId!)
        .eq('healthcare_vitals.group_id', groupId);

      if (error) {
        throw error;
      }

      // Sort by healthcare_vitals.created_at ASC to ensure
      // scores[scores.length - 1] corresponds to the latest column
      const result = (data ?? [])
        .sort(
          (a, b) =>
            new Date(a.healthcare_vitals.created_at ?? 0).getTime() -
            new Date(b.healthcare_vitals.created_at ?? 0).getTime()
        )
        .map((item) => ({
          id: item.healthcare_vitals.id,
          name: item.healthcare_vitals.name,
          unit: item.healthcare_vitals.unit,
          factor: item.healthcare_vitals.factor,
          value: item.value,
        }));
      return result;
    },
  });

  const selectedReport: ReportWithNames | Partial<ReportWithNames> | undefined =
    useMemo(() => {
      if (reportId === 'new' && userId) {
        // Calculate scores and average from healthcare vitals
        const vitals = healthcareVitalsQuery.data ?? [];

        const scores = vitals
          .filter((vital) => vital.value !== null && vital.value !== undefined)
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

        const userFullName =
          usersQuery.data?.find((u) => u.id === userId)?.full_name ?? undefined;

        return {
          user_id: userId,
          group_id: groupId,
          group_name: groupQuery.data?.name ?? groupNameFallback,
          user_name: userFullName,
          // creator_name will be overridden below via selectedManagerName when passed to preview
          created_at: new Date().toISOString(),
          scores: scores.length > 0 ? scores : [],
          score: representativeScore,
        } as Partial<ReportWithNames>;
      }
      // Only use cached detail data when a valid reportId is present
      if (reportId && reportDetailQuery.data) return reportDetailQuery.data;
      return undefined;
    }, [
      reportId,
      userId,
      groupId,
      groupQuery.data,
      groupNameFallback,
      reportDetailQuery.data,
      healthcareVitalsQuery.data,
      usersQuery.data,
      scoreCalculationMethod,
    ]);

  // Compute effective creator (group manager) name for preview/export only
  const selectedReportCreatorName = (
    selectedReport as Partial<ReportWithNames> | undefined
  )?.creator_name;
  const effectiveCreatorName = selectedManagerName ?? selectedReportCreatorName;

  const managerOptions: ComboboxOption[] = useMemo(
    () =>
      (groupManagersQuery.data ?? [])
        .map((m) => ({
          value: m.full_name || '',
          label: m.full_name || 'No name',
        }))
        .filter((o) => Boolean(o.value)),
    [groupManagersQuery.data]
  );

  return (
    <div className="flex min-h-full w-full flex-col">
      <div className="mb-4 flex flex-row items-center justify-between gap-2">
        <div className="flex flex-1 flex-col gap-2 md:flex-row md:items-center">
          <Combobox
            t={t}
            key="user-combobox"
            options={userOptions}
            selected={userId ?? ''}
            placeholder={t('user-data-table.user')}
            disabled={usersQuery.isLoading}
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
            className="w-full max-w-sm"
          />

          {Boolean(userId) && (
            <div className="flex items-center gap-2">
              <div className="min-w-56">
                <Select
                  value={reportId ?? ''}
                  onValueChange={(val) =>
                    setQueryParams({ reportId: val || null })
                  }
                  disabled={reportsQuery.isLoading}
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
        </div>
      </div>

      {Boolean(groupId && userId) &&
        (isLoading ? (
          <div className="flex min-h-100 w-full items-center justify-center rounded-lg border border-dashed py-20">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-dynamic-blue" />
              <p className="text-muted-foreground text-sm">
                {t('common.loading')}
              </p>
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
                // normalize potential nulls to undefined to match prop type
                user_name: selectedReport?.user_name ?? undefined,
                group_name:
                  selectedReport.group_name ??
                  groupQuery.data?.name ??
                  groupNameFallback,
                // Frontend-only override of the displayed group manager name
                creator_name: effectiveCreatorName ?? undefined,
              }}
              configs={configsData}
              isNew={reportId === 'new'}
              canUpdateReports={canUpdateReports}
              canDeleteReports={canDeleteReports}
              groupId={groupId}
              healthcareVitals={healthcareVitalsQuery.data ?? []}
              healthcareVitalsLoading={healthcareVitalsQuery.isLoading}
              factorEnabled={ENABLE_FACTOR_CALCULATION}
              managerOptions={managerOptions}
              selectedManagerName={effectiveCreatorName ?? undefined}
              onChangeManagerAction={(name) => setSelectedManagerName(name)}
              canCheckUserAttendance={canCheckUserAttendance}
              feedbackUser={
                userId
                  ? ({
                      id: userId,
                      full_name: usersQuery.data?.find((u) => u.id === userId)
                        ?.full_name,
                    } as WorkspaceUser)
                  : null
              }
              feedbackGroupName={groupQuery.data?.name ?? groupNameFallback}
              canEditFeedback={canUpdateReports}
              canDeleteFeedback={canDeleteReports}
            />
          </>
        ) : null)}
    </div>
  );
}

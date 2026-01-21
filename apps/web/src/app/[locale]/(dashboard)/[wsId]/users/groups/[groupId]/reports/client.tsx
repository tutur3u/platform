'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { WorkspaceUserReport } from '@tuturuuu/types';
import type { WorkspaceConfig } from '@tuturuuu/types/primitives/WorkspaceConfig';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Button } from '@tuturuuu/ui/button';
import { Combobox, type ComboboxOption} from '@tuturuuu/ui/custom/combobox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
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
  initialUserId?: string;
  initialReportId?: string;
  groupNameFallback: string;
  canCheckUserAttendance: boolean;
  canCreateReports: boolean;
  canUpdateReports: boolean;
  canDeleteReports: boolean;
}

export default function GroupReportsClient({
  wsId,
  groupId,
  initialUserId,
  initialReportId,
  groupNameFallback,
  canCheckUserAttendance,
  canCreateReports,
  canUpdateReports,
  canDeleteReports,
}: Props) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const userId = searchParams.get('userId') ?? initialUserId ?? undefined;
  const reportId =
    searchParams.get('reportId') ??
    (userId === initialUserId ? initialReportId : undefined);

  const updateSearchParams = (next: { userId?: string; reportId?: string }) => {
    const sp = new URLSearchParams(searchParams.toString());
    if (next.userId !== undefined) {
      if (next.userId) sp.set('userId', next.userId);
      else sp.delete('userId');
    }
    if (next.reportId !== undefined) {
      if (next.reportId) sp.set('reportId', next.reportId);
      else sp.delete('reportId');
    }
    router.replace(`${pathname}?${sp.toString()}`);
  };

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
      })) ?? [],
    [reportsQuery.data]
  );

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

  const configsQuery = useQuery({
    queryKey: ['ws', wsId, 'report-configs'],
    queryFn: async (): Promise<WorkspaceConfig[]> => {
      const { data, error } = await supabase
        .from('workspace_configs')
        .select('*')
        .eq('ws_id', wsId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const base = availableConfigs.map(({ defaultValue, ...rest }) => ({
        ...rest,
        value: defaultValue,
      }));
      const merged = [...base];
      (data ?? []).forEach((config) => {
        const idx = merged.findIndex((c) => c.id === config.id);
        if (idx !== -1) merged[idx] = { ...merged[idx], ...config };
        else merged.push(config);
      });
      return merged as WorkspaceConfig[];
    },
  });

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
            group_id
          )
        `)
        .eq('user_id', userId!)
        .eq('healthcare_vitals.group_id', groupId);

      if (error) {
        throw error;
      }

      const result = (data ?? []).map((item) => ({
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

        const averageScore =
          scores.length > 0
            ? scores.reduce((sum, score) => sum + score, 0) / scores.length
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
          score: averageScore,
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
      usersQuery.data?.find,
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
        <div className="grid flex-wrap items-start gap-2 md:flex">
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
              updateSearchParams({
                userId: nextUserId || undefined,
                reportId: undefined,
              });
            }}
          />

          {Boolean(userId) && (
            <div className="flex items-center gap-2">
              <div className="min-w-56">
                <Select
                  value={reportId ?? ''}
                  onValueChange={(val) =>
                    updateSearchParams({ reportId: val || undefined })
                  }
                  disabled={reportsQuery.isLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('user-data-table.report')} />
                  </SelectTrigger>
                  <SelectContent>
                    {reportsOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>
        {userId && canCreateReports ? (
          <div className="flex flex-row items-center gap-2">
            <Button
              type="button"
              onClick={() => updateSearchParams({ reportId: 'new' })}
              disabled={!canCreateReports}
            >
              {t('common.new')}
            </Button>
          </div>
        ) : null}
      </div>

      {Boolean(groupId && userId) && selectedReport && configsQuery.data && (
        <EditableReportPreview
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
          configs={configsQuery.data}
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
        />
      )}
    </div>
  );
}

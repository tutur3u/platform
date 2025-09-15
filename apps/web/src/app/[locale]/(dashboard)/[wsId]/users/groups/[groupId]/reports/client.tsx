'use client';

import { createClient } from '@tuturuuu/supabase/next/client';
import type { WorkspaceUserReport } from '@tuturuuu/types/db';
import type { WorkspaceConfig } from '@tuturuuu/types/primitives/WorkspaceConfig';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Combobox, type ComboboxOptions } from '@tuturuuu/ui/custom/combobox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@tuturuuu/ui/select';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import EditableReportPreview from '../../../reports/[reportId]/editable-report-preview';
import { availableConfigs } from '@/constants/configs/reports';

interface Props {
  wsId: string;
  groupId: string;
  initialUserId?: string;
  initialReportId?: string;
  groupNameFallback: string;
}

export default function GroupReportsClient({ wsId, groupId, initialUserId, initialReportId, groupNameFallback }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const userId = searchParams.get('userId') ?? initialUserId ?? undefined;
  const reportId = searchParams.get('reportId') ?? (userId === initialUserId ? initialReportId : undefined);

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

  const userOptions: ComboboxOptions[] = useMemo(
    () => usersQuery.data?.map((u) => ({ value: u.id, label: u.full_name || 'No name' })) ?? [],
    [usersQuery.data]
  );

  const reportsQuery = useQuery({
    queryKey: ['ws', wsId, 'group', groupId, 'user', userId, 'reports'],
    enabled: Boolean(userId),
    queryFn: async (): Promise<WorkspaceUserReport[]> => {
      const { data, error } = await supabase
        .from('external_user_monthly_reports')
        .select('*, user:workspace_users!user_id!inner(full_name, ws_id), creator:workspace_users!creator_id(full_name)', {
          count: 'exact',
        })
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
    () => reportsQuery.data?.map((r) => ({ value: r.id, label: r.title || 'No title' })) ?? [],
    [reportsQuery.data]
  );

  const reportDetailQuery = useQuery({
    queryKey: ['ws', wsId, 'group', groupId, 'user', userId, 'report', reportId],
    enabled: Boolean(reportId && reportId !== 'new'),
    queryFn: async (): Promise<(WorkspaceUserReport & { group_name: string }) | null> => {
      const { data, error } = await supabase
        .from('external_user_monthly_reports')
        .select('*, user:workspace_users!user_id!inner(full_name, ws_id), creator:workspace_users!creator_id(full_name), ...workspace_user_groups(group_name:name)', {
          count: 'exact',
        })
        .eq('id', reportId!)
        .eq('user_id', userId!)
        .eq('group_id', groupId)
        .eq('user.ws_id', wsId)
        .order('created_at', { ascending: false })
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const mapped = {
        user_name: Array.isArray(data.user) ? data.user?.[0]?.full_name : data.user?.full_name ?? undefined,
        creator_name: Array.isArray(data.creator) ? data.creator?.[0]?.full_name : data.creator?.full_name ?? undefined,
        ...data,
      } as any;
      const { user: _user, creator: _creator, ...rest } = mapped;
      return rest as WorkspaceUserReport & { group_name: string };
    },
  });

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
      return (data ?? { id: groupId, name: groupNameFallback }) as { id: string; name: string | null };
    },
  });

  const configsQuery = useQuery({
    queryKey: ['ws', wsId, 'report-configs'],
    queryFn: async (): Promise<WorkspaceConfig[]> => {
      const { data, error } = await supabase
        .from('workspace_configs')
        .select('*')
        .eq('ws_id', wsId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const base = availableConfigs.map(({ defaultValue, ...rest }) => ({ ...rest, value: defaultValue }));
      const merged = [...base];
      (data ?? []).forEach((config) => {
        const idx = merged.findIndex((c) => c.id === config.id);
        if (idx !== -1) merged[idx] = { ...merged[idx], ...config };
        else merged.push(config);
      });
      return merged as WorkspaceConfig[];
    },
  });

  const selectedReport = useMemo(() => {
    if (reportId === 'new' && userId) {
      return {
        user_id: userId,
        group_id: groupId,
        group_name: groupQuery.data?.name ?? groupNameFallback,
        created_at: new Date().toISOString(),
      } as Partial<WorkspaceUserReport & { group_name: string }>;
    }
    // Only use cached detail data when a valid reportId is present
    if (reportId && reportDetailQuery.data) return reportDetailQuery.data;
    return undefined;
  }, [reportId, userId, groupId, groupQuery.data, groupNameFallback, reportDetailQuery.data]);

  return (
    <div className="flex min-h-full w-full flex-col">
        <div className="flex flex-row gap-2 items-center justify-between mb-4">
      <div className="grid flex-wrap items-start gap-2 md:flex">
        <Combobox
          t={t}
          key="user-combobox"
          options={userOptions}
          selected={userId ?? ''}
          placeholder={t('user-data-table.user')}
          disabled={usersQuery.isLoading}
          onChange={(val) => {
            const nextUserId = typeof val === 'string' ? val : Array.isArray(val) ? val[0] : '';
            updateSearchParams({ userId: nextUserId || undefined, reportId: undefined });
          }}
        />

        {Boolean(userId) && (
          <div className="flex items-center gap-2">
            <div className="min-w-56">
              <Select
                value={reportId ?? ''}
                onValueChange={(val) => updateSearchParams({ reportId: val || undefined })}
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
      {userId ? (
      <div className="flex flex-row gap-2 items-center">
      <Button
              type="button"
              onClick={() => updateSearchParams({ reportId: 'new' })}
            >
              {t('common.new')}
            </Button>
      </div>
      ) : null}
      </div>

      {Boolean(groupId && userId) && selectedReport && configsQuery.data && (
        <EditableReportPreview
          wsId={wsId}
          report={{ ...selectedReport, group_name: (selectedReport).group_name ?? groupQuery.data?.name ?? groupNameFallback }}
          configs={configsQuery.data}
          isNew={reportId === 'new'}
          groupId={groupId}
        />
      )}
    </div>
  );
}



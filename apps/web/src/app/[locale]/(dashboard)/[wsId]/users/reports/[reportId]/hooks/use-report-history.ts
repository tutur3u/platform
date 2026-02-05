'use client';

import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { ReportLogEntry } from '@tuturuuu/types';
import { formatDistanceToNow } from 'date-fns';
import { enUS, vi } from 'date-fns/locale';
import { useLocale } from 'next-intl';
import { useMemo, useState } from 'react';
import type { SelectedLog } from '../components/report-history';

export type ReportHistoryEntry = ReportLogEntry & {
  creator_name?: string | null;
};

interface ReportLogWithCreator extends ReportLogEntry {
  creator: {
    full_name: string | null;
    display_name: string | null;
  } | null;
}

export function useReportHistory({
  wsId,
  reportId,
  reportApprovalStatus,
  isNew,
}: {
  wsId: string;
  reportId?: string;
  reportApprovalStatus?: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
  isNew: boolean;
}) {
  const locale = useLocale();
  const supabase = createClient();

  const isRejected = reportApprovalStatus === 'REJECTED';

  const [selectedLog, setSelectedLog] = useState<SelectedLog | null>(null);

  const logsQuery: UseQueryResult<ReportHistoryEntry[]> = useQuery({
    queryKey: ['ws', wsId, 'report', reportId, 'logs'],
    enabled: Boolean(reportId) && !isNew,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ReportHistoryEntry[]> => {
      const { data, error } = await supabase
        .from('external_user_monthly_report_logs')
        .select(
          '*, creator:workspace_users!creator_id(full_name, display_name)'
        )
        .eq('report_id', reportId as string)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((raw: ReportLogWithCreator) => ({
        ...raw,
        creator_name: raw.creator?.display_name
          ? raw.creator.display_name
          : raw.creator?.full_name,
      }));
    },
  });

  const latestApprovedLog = useMemo(() => {
    if (!isRejected || !logsQuery.data) return null;
    return (
      logsQuery.data.find((log) => log.report_approval_status === 'APPROVED') ||
      null
    );
  }, [isRejected, logsQuery.data]);

  const isLoadingRejectedBase = isRejected && logsQuery.isLoading;

  const formatRelativeTime = (dateIso?: string) => {
    if (!dateIso) return '';
    try {
      return formatDistanceToNow(new Date(dateIso), {
        addSuffix: true,
        locale: locale === 'vi' ? vi : enUS,
      });
    } catch (error) {
      console.error('Error formatting date:', error);
      return '';
    }
  };

  return {
    logsQuery,
    selectedLog,
    setSelectedLog,
    formatRelativeTime,
    latestApprovedLog,
    isLoadingRejectedBase,
    isRejected,
  };
}

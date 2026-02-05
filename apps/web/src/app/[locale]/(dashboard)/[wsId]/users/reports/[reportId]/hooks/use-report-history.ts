'use client';

import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { ReportLogEntry } from '@tuturuuu/types';
import { formatDistanceToNow } from 'date-fns';
import { enUS, vi } from 'date-fns/locale';
import { useLocale } from 'next-intl';
import { useState } from 'react';
import { useLatestApprovedLog } from '../../../approvals/hooks/use-approvals';

export type ReportHistoryEntry = ReportLogEntry & {
  creator_name?: string | null;
};

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
  const { data: latestApprovedLog, isLoading: isLoadingApprovedLog } =
    useLatestApprovedLog(isRejected ? reportId || null : null);

  const isLoadingRejectedBase = isRejected && isLoadingApprovedLog;

  const [selectedLog, setSelectedLog] = useState<{
    id: string;
    title?: string | null;
    content?: string | null;
    feedback?: string | null;
    score?: number | null;
    scores?: number[] | null;
  } | null>(null);

  const logsQuery: UseQueryResult<ReportHistoryEntry[]> = useQuery({
    queryKey: ['ws', wsId, 'report', reportId, 'logs'],
    enabled: Boolean(reportId) && !isNew,
    queryFn: async (): Promise<ReportHistoryEntry[]> => {
      const { data, error } = await supabase
        .from('external_user_monthly_report_logs')
        .select(
          '*, creator:workspace_users!creator_id(full_name, display_name)'
        )
        .eq('report_id', reportId as string)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((raw: any) => ({
        ...raw,
        creator_name: raw.creator?.display_name
          ? raw.creator.display_name
          : raw.creator?.full_name,
      }));
    },
  });

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

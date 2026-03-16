'use client';

import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import type { ReportLogEntry } from '@tuturuuu/types';
import { formatDistanceToNow } from 'date-fns';
import { enUS, vi } from 'date-fns/locale';
import { useLocale } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import type { SelectedLog } from '../components/report-history';

export type ReportHistoryEntry = ReportLogEntry & {
  creator_name?: string | null;
};

export interface UseReportHistoryReturn {
  logsQuery: UseQueryResult<ReportHistoryEntry[]>;
  selectedLog: SelectedLog | null;
  setSelectedLog: (log: SelectedLog | null) => void;
  formatRelativeTime: (dateIso?: string) => string;
  latestApprovedLog: ReportHistoryEntry | null;
  isLoadingRejectedBase: boolean;
  isRejected: boolean;
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
}): UseReportHistoryReturn {
  const locale = useLocale();

  const isRejected = reportApprovalStatus === 'REJECTED';

  const [selectedLog, setSelectedLog] = useState<SelectedLog | null>(null);

  // Reset selected log when report changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: reportId is used as a trigger to reset selected log
  useEffect(() => {
    setSelectedLog(null);
  }, [reportId]);

  const logsQuery: UseQueryResult<ReportHistoryEntry[]> = useQuery({
    queryKey: ['ws', wsId, 'report', reportId, 'logs'],
    enabled: Boolean(reportId) && !isNew,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ReportHistoryEntry[]> => {
      const res = await fetch(
        `/api/v1/workspaces/${wsId}/users/reports/${reportId}/logs`,
        { cache: 'no-store' }
      );
      if (!res.ok) throw new Error('Failed to fetch report logs');
      return await res.json();
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

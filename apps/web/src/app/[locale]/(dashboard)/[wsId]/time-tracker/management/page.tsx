import { createClient } from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { isValidTuturuuuEmail } from '@tuturuuu/utils/email/client';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import {
  getGroupedSessionsPaginated,
  getTimeTrackingStats,
} from '@/lib/time-tracking-helper';
import TimeTrackerManagementClient from './client';

interface Props {
  params: Promise<{ wsId: string }>;
  searchParams: Promise<{
    period?: string;
    page?: string;
    limit?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
  }>;
}

export const metadata: Metadata = {
  title: 'Time Tracker Management',
  description:
    'Comprehensive time tracking analytics and session management dashboard',
};

export default async function TimeTrackerManagementPage({
  params,
  searchParams,
}: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const searchParamsResolved = await searchParams;
        const supabase = await createClient();

        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) notFound();

        const isRootUser = isValidTuturuuuEmail(user.email || '');
        if (!isRootUser) notFound();

        const isRootWorkspace = wsId === ROOT_WORKSPACE_ID;
        if (!isRootWorkspace) notFound();

        // Parse search parameters
        const period =
          (searchParamsResolved?.period as 'day' | 'week' | 'month') || 'day';
        const page = parseInt(searchParamsResolved?.page || '1', 10);
        const limit = parseInt(searchParamsResolved?.limit || '20', 10);
        const search = searchParamsResolved?.search || '';
        const startDate = searchParamsResolved?.startDate || '';
        const endDate = searchParamsResolved?.endDate || '';

        // Get paginated sessions and stats
        const [groupedSessionsResult, stats] = await Promise.all([
          getGroupedSessionsPaginated(wsId, period, {
            page,
            limit,
            search,
            startDate: startDate || undefined,
            endDate: endDate || undefined,
          }),
          getTimeTrackingStats(wsId),
        ]);

        return (
          <TimeTrackerManagementClient
            wsId={wsId}
            groupedSessions={groupedSessionsResult.data}
            pagination={groupedSessionsResult.pagination}
            stats={stats}
            currentPeriod={period}
            currentStartDate={startDate}
            currentEndDate={endDate}
          />
        );
      }}
    </WorkspaceWrapper>
  );
}

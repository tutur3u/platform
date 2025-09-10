import { createClient } from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
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
  const { wsId } = await params;
  const searchParamsResolved = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const isRootUser = user.email?.endsWith('@tuturuuu.com');
  if (!isRootUser) notFound();

  const isRootWorkspace = wsId === ROOT_WORKSPACE_ID;
  if (!isRootWorkspace) notFound();

  const { data: workspaceMember } = await supabase
    .from('workspace_members')
    .select('*')
    .eq('ws_id', wsId)
    .eq('user_id', user.id)
    .single();
  if (!workspaceMember) notFound();

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
      groupedSessions={groupedSessionsResult.data}
      pagination={groupedSessionsResult.pagination}
      stats={stats}
      currentPeriod={period}
      currentStartDate={startDate}
      currentEndDate={endDate}
    />
  );
}

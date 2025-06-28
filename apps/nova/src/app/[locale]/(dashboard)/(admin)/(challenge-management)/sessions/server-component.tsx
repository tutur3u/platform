import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { NovaChallenge } from '@tuturuuu/types/db';
import { SessionFilters } from './filters';
import { SessionOverview } from './overview';
import { SessionTable } from './session-table';

type SessionWithDetails = {
  id: string;
  user_id: string;
  challenge_id: string;
  status: string;
  start_time: string;
  end_time: string | null;
  created_at: string;
  challenge: NovaChallenge;
  user: {
    id: string;
    display_name: string;
    avatar_url: string;
    email: string | null;
  };
};

export default async function SessionsList({
  searchParams: futureParams,
}: {
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    sortField?: string;
    sortDirection?: string;
    search?: string;
    challengeId?: string;
    status?: string;
  }>;
}) {
  const sbAdmin = await createAdminClient();
  const searchParams = await futureParams;

  // Parse query parameters with defaults
  const currentPage = parseInt(searchParams.page || '1');
  const pageSize = parseInt(searchParams.pageSize || '10');
  const sortField = searchParams.sortField || 'created_at';
  const sortDirection = (searchParams.sortDirection || 'desc') as
    | 'asc'
    | 'desc';
  const searchQuery = searchParams.search || '';
  const selectedChallenge = searchParams.challengeId || '';
  const selectedStatus = searchParams.status || '';

  // Calculate pagination
  const from = (currentPage - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data: statsData, error: statsError } = await sbAdmin
    .rpc('get_session_statistics')
    .single();

  if (statsError) {
    console.error('Error fetching statistics:', statsError);
    throw new Error('Failed to fetch session statistics');
  }

  const stats = {
    totalCount: statsData?.total_count || 0,
    activeCount: statsData?.active_count || 0,
    completedCount: statsData?.completed_count || 0,
    latestSessionDate: statsData?.latest_session_date || '',
    uniqueUsersCount: statsData?.unique_users_count || 0,
  };

  // Fetch challenges for filtering
  const { data: challenges = [] } = await sbAdmin
    .from('nova_challenges')
    .select('id, title')
    .order('title');

  // Begin sessions query
  let query = sbAdmin.from('nova_sessions').select(
    `
      *,
      challenge:nova_challenges (
        id,
        title
      ),
      user:users (
        id,
        display_name,
        avatar_url
      )
    `,
    { count: 'exact' }
  );

  // Apply search if provided (search user display_name)
  if (searchQuery) {
    query = query.or(`status.ilike.%${searchQuery}%`);
  }

  // Apply challenge filter if provided
  if (selectedChallenge) {
    query = query.eq('challenge_id', selectedChallenge);
  }

  // Apply status filter if provided
  if (selectedStatus) {
    query = query.eq('status', selectedStatus);
  }

  // Apply sorting and pagination
  const validSortFields = [
    'id',
    'created_at',
    'user_id',
    'challenge_id',
    'status',
    'start_time',
    'end_time',
  ];
  const actualSortField = validSortFields.includes(sortField)
    ? sortField
    : 'created_at';

  // Fetch sessions with pagination
  const {
    data: sessionsData = [],
    count: totalCount = 0,
    error: sessionsError,
  } = await query
    .order(actualSortField, { ascending: sortDirection === 'asc' })
    .range(from, to);

  if (sessionsError) {
    console.error('Error fetching sessions:', sessionsError);
    throw new Error('Failed to fetch sessions');
  }

  // Calculate total pages
  const totalPages = Math.ceil((totalCount || 0) / pageSize);

  // Fetch user emails from user_private_details
  const userIds = sessionsData?.map((s) => s.user?.id).filter(Boolean) || [];
  const { data: userPrivateDetails = [] } = await sbAdmin
    .from('user_private_details')
    .select('user_id, email')
    .in('user_id', userIds.filter((id) => id !== null) as string[]);

  // Create email lookup map
  const emailMap = new Map();
  userPrivateDetails?.forEach((detail) => {
    emailMap.set(detail.user_id, detail.email);
  });

  // Enhance sessions with email information
  const sessions: SessionWithDetails[] = (sessionsData?.map((session) => ({
    ...session,
    user: {
      ...session.user,
      id: session.user?.id || '',
      display_name: session.user?.display_name || '',
      avatar_url: session.user?.avatar_url || '',
      email: session.user?.id ? emailMap.get(session.user.id) || null : null,
    },
  })) || []) as unknown as SessionWithDetails[];

  return (
    <div className="w-full space-y-2">
      <SessionOverview stats={stats} />

      <SessionFilters
        searchQuery={searchQuery}
        selectedChallenge={selectedChallenge}
        selectedStatus={selectedStatus}
        challenges={challenges || []}
        serverSide={true}
      />

      <SessionTable
        sessions={sessions}
        loading={false}
        searchQuery={searchQuery}
        viewMode="table"
        currentPage={currentPage}
        totalPages={totalPages}
        sortField={sortField}
        sortDirection={sortDirection as 'asc' | 'desc'}
        serverSide={true}
        showEmail={true}
      />
    </div>
  );
}

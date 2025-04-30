import { SubmissionFilters } from './filters';
import { SubmissionOverview } from './overview';
import { SubmissionTable } from './submission-table';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NovaChallenge, NovaProblem, NovaSubmission } from '@tuturuuu/types/db';

type SubmissionWithDetails = NovaSubmission & {
  problem: NovaProblem & {
    challenge: NovaChallenge;
  };
  user: {
    id: string;
    display_name: string;
    avatar_url: string;
    email: string | null;
  };
  total_score: number;
};

export default async function SubmissionsList({
  searchParams: futureParams,
}: {
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    sortField?: string;
    sortDirection?: string;
    search?: string;
    challengeId?: string;
    problemId?: string;
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
  const selectedProblem = searchParams.problemId || '';

  // Calculate pagination
  const from = (currentPage - 1) * pageSize;
  const to = from + pageSize - 1;

  // Fetch statistics for the overview using the RPC function
  const { data: statsData, error: statsError } = await sbAdmin.rpc(
    'get_submission_statistics'
  );

  if (statsError) {
    console.error('Error fetching statistics:', statsError);
    throw new Error('Failed to fetch submission statistics');
  }

  const stats = {
    totalCount: statsData?.[0]?.total_count || 0,
    latestSubmissionDate: statsData?.[0]?.latest_submission_date || '',
    uniqueUsersCount: statsData?.[0]?.unique_users_count || 0,
  };

  // Fetch challenges for filtering
  const { data: challenges = [] } = await sbAdmin
    .from('nova_challenges')
    .select('id, title')
    .order('title');

  // Fetch problems for filtering
  const { data: problems = [] } = await sbAdmin
    .from('nova_problems')
    .select('id, title, challenge_id')
    .order('title');

  // Filter problems based on selected challenge
  const filteredProblems =
    selectedChallenge && problems
      ? problems.filter((p) => p.challenge_id === selectedChallenge)
      : problems || [];

  // Begin submissions query
  let query = sbAdmin.from('nova_submissions_with_scores').select(
    `
      *,
      problem:nova_problems (
        id,
        title,
        challenge:nova_challenges (
          id,
          title
        )
      ),
      user:users (
        id,
        display_name,
        avatar_url
      )
    `,
    { count: 'exact' }
  );

  // Apply search if provided
  if (searchQuery) {
    query = query.or(
      `prompt.ilike.%${searchQuery}%,feedback.ilike.%${searchQuery}%`
    );
  }

  // Apply challenge filter if provided
  if (selectedChallenge) {
    const { data: matchingProblemIds } = await sbAdmin
      .from('nova_problems')
      .select('id')
      .eq('challenge_id', selectedChallenge);

    if (matchingProblemIds && matchingProblemIds.length > 0) {
      const problemIds = matchingProblemIds.map((p) => p.id);
      query = query.in('problem_id', problemIds);
    }
  }

  // Apply problem filter if provided
  if (selectedProblem) {
    query = query.eq('problem_id', selectedProblem);
  }

  // Apply sorting and pagination
  const validSortFields = [
    'id',
    'created_at',
    'score',
    'user_id',
    'problem_id',
  ];
  let actualSortField = validSortFields.includes(sortField)
    ? sortField
    : 'created_at';

  if (actualSortField === 'score') {
    actualSortField = 'total_score';
  }

  // Fetch submissions with pagination
  const {
    data: submissionsData = [],
    count: totalCount = 0,
    error: submissionsError,
  } = await query
    .order(actualSortField, { ascending: sortDirection === 'asc' })
    .range(from, to);

  if (submissionsError) {
    console.error('Error fetching submissions:', submissionsError);
    throw new Error('Failed to fetch submissions');
  }

  // Calculate total pages
  const totalPages = Math.ceil((totalCount || 0) / pageSize);

  // Fetch user emails from user_private_details
  const userIds = submissionsData?.map((s) => s.user?.id).filter(Boolean) || [];
  const { data: userPrivateDetails = [] } = await sbAdmin
    .from('user_private_details')
    .select('user_id, email')
    .in('user_id', userIds.filter((id) => id !== null) as string[]);

  // Create email lookup map
  const emailMap = new Map();
  userPrivateDetails?.forEach((detail) => {
    emailMap.set(detail.user_id, detail.email);
  });

  // Enhance submissions with email information
  const submissions: SubmissionWithDetails[] = (submissionsData?.map((sub) => ({
    ...sub,
    user: {
      ...sub.user,
      id: sub.user?.id || '',
      display_name: sub.user?.display_name || '',
      avatar_url: sub.user?.avatar_url || '',
      email: sub.user?.id ? emailMap.get(sub.user.id) || null : null,
    },
  })) || []) as unknown as SubmissionWithDetails[];

  return (
    <div className="w-full space-y-2">
      <SubmissionOverview stats={stats} />

      <SubmissionFilters
        searchQuery={searchQuery}
        selectedChallenge={selectedChallenge}
        selectedProblem={selectedProblem}
        challenges={challenges || []}
        filteredProblems={filteredProblems || []}
        serverSide={true}
      />

      <SubmissionTable
        submissions={submissions}
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

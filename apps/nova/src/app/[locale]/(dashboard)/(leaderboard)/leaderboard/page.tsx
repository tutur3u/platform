import LeaderboardClient from './client';
import { BasicInformation } from './components/basic-information-component';
import { LeaderboardEntry } from './components/leaderboard';
import LeaderboardFallback from './fallback';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { generateFunName } from '@tuturuuu/utils/name-helper';
import { getLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

export const revalidate = 60;

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    locale?: string;
    challenge?: string;
  }>;
}) {
  return (
    <div className="container mx-auto px-4 py-8">
      <Suspense fallback={<LeaderboardFallback />}>
        <LeaderboardContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function LeaderboardContent({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    locale?: string;
    challenge?: string;
  }>;
}) {
  const locale = await getLocale();
  const { page = '1', challenge = 'all' } = await searchParams;
  const pageNumber = parseInt(page, 10);

  const { data, topThree, basicInfo, challenges, hasMore, totalPages } =
    await fetchLeaderboard(locale, pageNumber, challenge);

  return (
    <LeaderboardClient
      locale={locale}
      data={data}
      topThree={topThree}
      basicInfo={basicInfo}
      challenges={challenges}
      hasMore={hasMore}
      initialPage={pageNumber}
      totalPages={totalPages}
      calculationDate={new Date()}
    />
  );
}

// The problem's score for each session is the maximum score of user's submissions for that problem in that session
// The challenge's score for each session is the sum of the problem's scores for that challenge in that session
// Then the official challenge score for each user is the maximum challenge score from any session
// The leaderboard score for each user is the sum of the official challenge scores for all challenges
async function fetchLeaderboard(
  locale: string,
  page: number = 1,
  challengeId: string = 'all'
) {
  const defaultData = {
    data: [],
    topThree: [],
    basicInfo: {
      currentRank: 0,
      topScore: 0,
      archiverName: '',
      totalParticipants: 0,
    },
    challenges: [],
    problems: [],
    hasMore: false,
    totalPages: 0,
  };

  const limit = 20;

  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id || !user?.email) {
    throw new Error('Auth error or missing user');
  }

  const sbAdmin = await createAdminClient();

  // Check user's role and permissions
  const { data: userRole, error: roleError } = await sbAdmin
    .from('nova_roles')
    .select('*')
    .eq('email', user.email)
    .single();

  if (roleError) {
    throw new Error('Error fetching user role:', roleError);
  }

  // Fetch all challenges with their whitelists in a single query
  const { data: challenges, error: challengesError } = await sbAdmin
    .from('nova_challenges')
    .select('*, nova_challenge_whitelisted_emails(*)')
    .order('title', { ascending: true });

  if (challengesError) {
    console.error('Error fetching challenges:', challengesError.message);
    return defaultData;
  }

  // Extract challenges and construct whitelist data
  const userWhitelistedChallengeIds = new Set(
    challenges.flatMap((challenge) =>
      challenge.nova_challenge_whitelisted_emails
        .filter((whitelist) => whitelist.email === user.email)
        .map((whitelist) => whitelist.challenge_id)
    )
  );

  const { data: managedChallenges, error: managerError } = await sbAdmin
    .from('nova_challenge_manager_emails')
    .select('challenge_id')
    .eq('email', user.email);

  if (managerError) {
    console.error('Error fetching managed challenges:', managerError);
  }

  // Build a Set of challenge IDs this admin can manage
  const managedChallengeIds = new Set(
    (managedChallenges || []).map((item) => item.challenge_id)
  );

  let filteredChallenges: {
    id: string;
    title: string;
  }[] = [];

  if (
    userRole?.allow_challenge_management &&
    userRole?.allow_manage_all_challenges
  ) {
    filteredChallenges = challenges;
  }
  // Normal admins - can see all user-visible challenges + challenges they can manage
  else if (userRole?.allow_challenge_management) {
    filteredChallenges = challenges.filter((challenge) => {
      // Public challenges (enabled and non-restricted)
      if (challenge.enabled && !challenge.whitelisted_only) {
        return true;
      }
      // Specifically assigned to manage
      if (managedChallengeIds.has(challenge.id)) {
        return true;
      }
      // Whitelisted restricted challenges
      if (userWhitelistedChallengeIds.has(challenge.id)) {
        return true;
      }

      return false;
    });
  }
  // Regular Users - can only see enabled non-restricted challenges
  else {
    filteredChallenges = challenges.filter(
      (challenge) =>
        challenge.enabled &&
        (!challenge.whitelisted_only ||
          userWhitelistedChallengeIds.has(challenge.id))
    );
  }

  let rankedData: LeaderboardEntry[] = [];

  if (challengeId === 'all') {
    // Fetch user data from the user leaderboard view
    const { data: leaderboardData, error: leaderboardError } = await sbAdmin
      .from('nova_user_leaderboard')
      .select('*')
      .order('score', { ascending: false });

    if (leaderboardError) {
      console.error('Error fetching leaderboard:', leaderboardError.message);
      return defaultData;
    }

    // Transform data to match expected format
    rankedData = leaderboardData.map((entry, index) => ({
      id: entry.user_id || '',
      rank: index + 1,
      name: entry.name || generateFunName({ id: entry.user_id || '', locale }),
      avatar: entry.avatar || '',
      score: entry.score || 0,
      challenge_scores:
        (entry.challenge_scores as Record<string, number>) || {},
    }));
  } else {
    const allowedChallengeId = filteredChallenges.find(
      (challenge) => challenge.id === challengeId
    )?.id;

    if (!allowedChallengeId) {
      const urlSearchParams = new URLSearchParams();
      urlSearchParams.delete('challenge');
      return redirect(`/leaderboard?${urlSearchParams.toString()}`);
    }

    // Fetch user data for a specific challenge
    const { data: challengeLeaderboardData, error: challengeLeaderboardError } =
      await sbAdmin
        .from('nova_user_challenge_leaderboard')
        .select('*')
        .eq('challenge_id', challengeId)
        .order('score', { ascending: false });

    if (challengeLeaderboardError) {
      console.error(
        'Error fetching challenge leaderboard:',
        challengeLeaderboardError.message
      );
      return defaultData;
    }

    // Transform data to match expected format
    rankedData = challengeLeaderboardData.map((entry, index) => {
      const problem_scores: Record<
        string,
        { id: string; title: string; score: number }[]
      > = {};
      problem_scores[challengeId] = (entry.problem_scores || []) as {
        id: string;
        title: string;
        score: number;
      }[];

      return {
        id: entry.user_id || '',
        rank: index + 1,
        name:
          entry.name || generateFunName({ id: entry.user_id || '', locale }),
        avatar: entry.avatar || '',
        score: entry.score || 0,
        problem_scores,
      };
    });
  }

  // Fetch whitelisted users
  const { data: whitelistedUsers, error: whitelistError } = await sbAdmin
    .from('platform_user_roles')
    .select('user_id, ...users!inner(id,display_name,avatar_url)')
    .eq('enabled', true);

  if (whitelistError) {
    console.error('Error fetching whitelisted users:', whitelistError.message);
    return defaultData;
  }

  if (whitelistedUsers?.length > 0) {
    const existingUserIds = rankedData.map((entry) => entry.id);

    // Filter out users who are already in the leaderboard
    whitelistedUsers
      .filter((user) => user.user_id && !existingUserIds.includes(user.user_id))
      .forEach((userData) => {
        rankedData.push({
          id: userData.user_id,
          name:
            userData?.display_name ||
            generateFunName({ id: userData.user_id, locale }),
          avatar: userData?.avatar_url || '',
          score: 0,
          rank: rankedData.length + 1,
          challenge_scores: {},
          problem_scores: {},
        });
      });
  }

  // Sort by score if we modified the data (e.g. added whitelisted users)
  rankedData.sort((a, b) => {
    if (b.score === a.score) {
      return a.name.localeCompare(b.name);
    }
    return (b.score || 0) - (a.score || 0);
  });

  // Update ranks after sorting
  rankedData.forEach((entry, index) => {
    entry.rank = index + 1;
  });

  const topThree = rankedData.slice(0, 3);

  const currentUser = rankedData.find((entry) => entry.id === user?.id);

  // Get basic info
  const basicInfo: BasicInformation = {
    currentRank: currentUser?.rank || 0,
    topScore: rankedData[0]?.score || 0,
    archiverName: rankedData[0]?.name || '',
    totalParticipants: rankedData.length,
  };

  // Paginate
  const paginatedData = rankedData.slice((page - 1) * limit, page * limit);
  const totalPages = Math.ceil(rankedData.length / limit);

  return {
    data: paginatedData,
    topThree,
    basicInfo,
    challenges: filteredChallenges,
    hasMore: rankedData.length > page * limit,
    totalPages,
  };
}

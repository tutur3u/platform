import LeaderboardPage from './client';
import type { LeaderboardEntry } from '@/components/leaderboard/leaderboard';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { generateFunName } from '@tuturuuu/utils/name-helper';

export default async function Page() {
  const sbAdmin = await createAdminClient();

  // Fetch sessions with challenge information
  const { data: leaderboardData, error } = await sbAdmin.from('nova_sessions')
    .select(`
        id,
        user_id,
        challenge_id,
        total_score,
        users!inner(
          display_name,
          avatar_url
        ),
        nova_challenges(
          id,
          title
        )
      `);

  if (error) throw error;

  // Fetch all challenges for filtering options
  const { data: challenges } = await sbAdmin
    .from('nova_challenges')
    .select('id, title')
    .order('title', { ascending: true });

  // Fetch whitelisted users that aren't already in leaderboard
  const { data: whitelistedData, error: whitelistError } = await sbAdmin
    .from('nova_roles')
    .select(
      `
      email
    `
    )
    .eq('enabled', true);

  if (whitelistError) throw whitelistError;

  const groupedData = leaderboardData.reduce(
    (acc, curr) => {
      const existingUser = acc.find((item) => item.user_id === curr.user_id);
      if (existingUser) {
        existingUser.total_score =
          (existingUser.total_score ?? 0) + (curr.total_score ?? 0);

        // Track scores by challenge
        const challengeId = curr.challenge_id;
        if (challengeId) {
          if (!existingUser.challenge_scores) {
            existingUser.challenge_scores = {};
          }

          existingUser.challenge_scores[challengeId] =
            (existingUser.challenge_scores[challengeId] ?? 0) +
            (curr.total_score ?? 0);
        }
      } else {
        // Initialize challenge scores
        const challenge_scores: Record<string, number> = {};
        if (curr.challenge_id) {
          challenge_scores[curr.challenge_id] = curr.total_score ?? 0;
        }

        acc.push({
          id: curr.id,
          user_id: curr.user_id,
          challenge_id: curr.challenge_id,
          total_score: curr.total_score ?? 0,
          users: curr.users,
          nova_challenges: curr.nova_challenges,
          challenge_scores,
        });
      }
      return acc;
    },
    [] as ((typeof leaderboardData)[0] & {
      challenge_scores?: Record<string, number>;
    })[]
  );

  // Get existing user IDs in the leaderboard
  const existingUserIds = groupedData.map((entry) => entry.user_id);

  // Add whitelisted users who haven't taken any challenges
  if (whitelistedData && whitelistedData.length > 0) {
    for (const whitelistedUser of whitelistedData) {
      if (!whitelistedUser.email) continue;

      // Get user data from the user_private_details table
      const { data: userData } = await sbAdmin
        .from('user_private_details')
        .select('user_id')
        .eq('email', whitelistedUser.email)
        .maybeSingle();

      if (userData?.user_id && !existingUserIds.includes(userData.user_id)) {
        // Get user profile
        const { data: userProfile } = await sbAdmin
          .from('users')
          .select('display_name, avatar_url')
          .eq('id', userData.user_id)
          .maybeSingle();

        if (userProfile) {
          groupedData.push({
            id: crypto.randomUUID(),
            user_id: userData.user_id,
            challenge_id: '',
            total_score: 0,
            users: {
              display_name: userProfile.display_name,
              avatar_url: userProfile.avatar_url,
            },
            nova_challenges: { id: '', title: '' },
            challenge_scores: {},
          });
        }
      }
    }
  }

  groupedData.sort((a, b) => (b.total_score ?? 0) - (a.total_score ?? 0));

  const formattedData: LeaderboardEntry[] = groupedData.map((entry, index) => ({
    id: entry.user_id,
    rank: index + 1,
    name: entry.users.display_name || generateFunName(entry.user_id),
    avatar: entry.users.avatar_url ?? '',
    score: entry.total_score ?? 0,
    challenge_scores: entry.challenge_scores ?? {},
  }));

  return <LeaderboardPage data={formattedData} challenges={challenges || []} />;
}

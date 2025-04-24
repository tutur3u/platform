import { DEV_MODE } from '@/constants/common';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { generateFunName } from '@tuturuuu/utils/name-helper';
import { type NextRequest, NextResponse } from 'next/server';

const DISABLE_ACCESS = !DEV_MODE;

export async function GET(req: NextRequest) {
  if (DISABLE_ACCESS) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 405 });
  }

  const searchParams = req.nextUrl.searchParams;

  const locale = searchParams.get('locale') || 'en';
  const page = parseInt(searchParams.get('page') || '1');
  const limit = 100;
  const offset = (page - 1) * limit;

  const sbAdmin = await createAdminClient();

  // Fetch user sessions data
  const { data: sessionsData, error: sessionError } = await sbAdmin.from(
    'nova_sessions'
  ).select(`
      id,
      user_id,
      challenge_id,
      users!inner(
        display_name,
        avatar_url
      ),
      nova_challenges(
        id,
        title
      )
    `);

  if (sessionError) {
    return NextResponse.json({ error: sessionError.message }, { status: 500 });
  }

  // Fetch all scores from submissions with more detail
  const { data: submissionsData, error: submissionsError } = await sbAdmin.from(
    'nova_submissions_with_scores'
  ).select(`
    user_id,
    problem_id,
    total_score,
    session_id
  `);

  if (submissionsError) {
    return NextResponse.json(
      { error: submissionsError.message },
      { status: 500 }
    );
  }

  // Fetch all problems to get challenge association
  const { data: problemsData, error: problemsError } = await sbAdmin
    .from('nova_problems')
    .select('id, challenge_id, title');

  if (problemsError) {
    return NextResponse.json({ error: problemsError.message }, { status: 500 });
  }

  // Create a map of problem_id to challenge_id for easy lookup
  const problemChallengeMap = new Map();
  problemsData?.forEach((problem) => {
    problemChallengeMap.set(problem.id, problem.challenge_id);
  });

  // Fetch all challenges for filtering options
  const { data: challenges } = await sbAdmin
    .from('nova_challenges')
    .select('id, title')
    .order('title', { ascending: true });

  // Fetch whitelisted users
  const { data: whitelistedData, error: whitelistError } = await sbAdmin
    .from('nova_roles')
    .select('email')
    .eq('enabled', true);

  if (whitelistError) {
    return NextResponse.json(
      { error: whitelistError.message },
      { status: 500 }
    );
  }

  // Group sessions by user
  const userSessions = sessionsData.reduce(
    (acc, session) => {
      if (!acc[session.user_id]) {
        acc[session.user_id] = {
          id: session.id,
          user_id: session.user_id,
          users: session.users,
          nova_challenges: session.nova_challenges,
          sessions: [],
        };
      }
      acc[session.user_id].sessions.push({
        id: session.id,
        challenge_id: session.challenge_id,
      });
      return acc;
    },
    {} as Record<string, any>
  );

  // Calculate scores from submissions and associate with sessions
  const groupedData = Object.values(userSessions).map((user) => {
    const userSubmissions = submissionsData.filter(
      (s) => s.user_id === user.user_id
    );

    // First, group submissions by problem_id to find the best submission for each problem
    const bestProblemSubmissions = new Map();

    userSubmissions.forEach((submission) => {
      const problemId = submission.problem_id;
      if (!problemId) return;

      const sessionId = submission.session_id;
      if (!sessionId) return;

      const correctScore = submission.total_score || 0;

      // Keep only the best submission for each problem
      if (
        !bestProblemSubmissions.has(problemId) ||
        bestProblemSubmissions.get(problemId).score < correctScore
      ) {
        // Get problem title from problemsData
        const problemTitle =
          problemsData.find((p) => p.id === problemId)?.title ||
          `Problem ${problemId.substring(0, 8)}`;

        bestProblemSubmissions.set(problemId, {
          problemId,
          challengeId: problemChallengeMap.get(problemId),
          score: correctScore,
          title: problemTitle,
          sessionId,
        });
      }
    });

    // Group problems by session and challenge for accurate scoring
    const sessionScores = new Map(); // Map<session_id, score>
    const challengeSessions = new Map(); // Map<challenge_id, Set<session_id>>

    // Calculate session scores (sum of problem scores in each session)
    bestProblemSubmissions.forEach((problem) => {
      const { sessionId, score, challengeId } = problem;

      if (sessionId && challengeId) {
        // Add to session score
        sessionScores.set(
          sessionId,
          (sessionScores.get(sessionId) || 0) + score
        );

        // Track which sessions belong to which challenge
        if (!challengeSessions.has(challengeId)) {
          challengeSessions.set(challengeId, new Set());
        }
        challengeSessions.get(challengeId).add(sessionId);
      }
    });

    // Find max session score for each challenge
    const challenge_scores: Record<string, number> = {};
    challengeSessions.forEach((sessions, challengeId) => {
      let maxSessionScore = 0;
      sessions.forEach((sessionId: string) => {
        const sessionScore = sessionScores.get(sessionId) || 0;
        maxSessionScore = Math.max(maxSessionScore, sessionScore);
      });
      challenge_scores[challengeId] = maxSessionScore;
    });

    // Track individual problem scores for each challenge
    const problem_scores: Record<
      string,
      Array<{ id: string; title: string; score: number }>
    > = {};

    // Group problem scores by challenge
    bestProblemSubmissions.forEach((problem) => {
      const { challengeId, score, problemId, title } = problem;
      if (challengeId) {
        // Add to problem scores by challenge
        if (!problem_scores[challengeId]) {
          problem_scores[challengeId] = [];
        }

        problem_scores[challengeId].push({
          id: problemId,
          title,
          score,
        });
      }
    });

    // Total score is the sum of challenge scores (max session score per challenge)
    const total_score = Object.values(challenge_scores).reduce(
      (sum, score) => sum + score,
      0
    );

    return {
      id: user.id,
      user_id: user.user_id,
      total_score,
      users: user.users,
      nova_challenges: user.nova_challenges,
      challenge_scores,
      problem_scores,
    };
  });

  const existingUserIds = groupedData.map((entry) => entry.user_id);

  // Add whitelisted users
  if (whitelistedData?.length > 0) {
    const whitelistedEmails = whitelistedData
      .filter((user) => user.email)
      .map((user) => user.email);

    if (whitelistedEmails.length > 0) {
      // Get all user IDs in one query
      const { data: userDataBatch } = await sbAdmin
        .from('user_private_details')
        .select('user_id, email')
        .in('email', whitelistedEmails);

      // Get all user profiles in one query
      const userIds =
        userDataBatch
          ?.filter(
            (data) => data.user_id && !existingUserIds.includes(data.user_id)
          )
          .map((data) => data.user_id) || [];

      if (userIds.length > 0) {
        const { data: userProfiles } = await sbAdmin
          .from('users')
          .select('id, display_name, avatar_url')
          .in('id', userIds);

        // Map user profiles by their user ID
        const userProfileMap = new Map();
        userProfiles?.forEach((profile) => {
          userProfileMap.set(profile.id, profile);
        });

        // Add whitelisted users to grouped data
        userDataBatch?.forEach((userData) => {
          if (userData.user_id && !existingUserIds.includes(userData.user_id)) {
            const userProfile = userProfileMap.get(userData.user_id);
            if (userProfile) {
              groupedData.push({
                id: crypto.randomUUID(),
                user_id: userData.user_id,
                total_score: 0,
                users: {
                  display_name: userProfile.display_name,
                  avatar_url: userProfile.avatar_url,
                },
                nova_challenges: { id: '', title: '' },
                challenge_scores: {},
                problem_scores: {},
              });
            }
          }
        });
      }
    }
  }

  // Sort by total score (highest first) and assign ranks
  const sortedData = groupedData
    .sort((a, b) => b.total_score - a.total_score)
    .map((entry, index) => ({
      id: entry.user_id,
      rank: index + 1,
      name:
        entry.users.display_name ||
        generateFunName({ id: entry.user_id, locale }),
      avatar: entry.users.avatar_url || '',
      score: entry.total_score,
      challenge_scores: entry.challenge_scores || {},
      problem_scores: entry.problem_scores || {},
    }));

  // Paginate the sorted data
  const paginatedData = sortedData.slice(offset, offset + limit);
  const hasMore = offset + limit < sortedData.length;

  return NextResponse.json({
    data: paginatedData,
    challenges: challenges || [],
    problems: problemsData,
    hasMore,
  });
}

import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { generateFunName } from '@tuturuuu/utils/name-helper';
import { type NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const page = parseInt(searchParams.get('page') || '1');
  const limit = 20;
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

  // Fetch all scores from submissions - joining with sessions to get challenge_id
  const { data: submissionsData, error: submissionsError } = await sbAdmin.from(
    'nova_submissions_with_scores'
  ).select(`
      id, 
      user_id, 
      total_score,
      session_id,
      nova_sessions(challenge_id)
    `);

  if (submissionsError) {
    return NextResponse.json(
      { error: submissionsError.message },
      { status: 500 }
    );
  }

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

    const total_score =
      userSubmissions.length > 0
        ? Math.max(...userSubmissions.map((s) => s.total_score || 0))
        : 0;

    // Calculate scores per challenge
    const challenge_scores: Record<string, number> = {};
    userSubmissions.forEach((submission) => {
      if (submission.nova_sessions && submission.nova_sessions.challenge_id) {
        const challengeId = submission.nova_sessions.challenge_id;
        challenge_scores[challengeId] =
          (challenge_scores[challengeId] || 0) + (submission.total_score || 0);
      }
    });

    return {
      id: user.id,
      user_id: user.user_id,
      total_score,
      users: user.users,
      nova_challenges: user.nova_challenges,
      challenge_scores,
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
              });
            }
          }
        });
      }
    }
  }

  // Sort and slice the data for pagination
  groupedData.sort((a, b) => (b.total_score ?? 0) - (a.total_score ?? 0));

  const totalCount = groupedData.length;
  const hasMore = offset + limit < totalCount;
  const paginatedData = groupedData.slice(offset, offset + limit);

  const formattedData = paginatedData.map((entry, index) => ({
    id: entry.user_id,
    rank: offset + index + 1,
    name: entry.users.display_name || generateFunName(entry.user_id),
    avatar: entry.users.avatar_url ?? '',
    score: entry.total_score ?? 0,
    challenge_scores: entry.challenge_scores ?? {},
  }));

  return NextResponse.json({
    data: formattedData,
    challenges: challenges || [],
    hasMore,
  });
}

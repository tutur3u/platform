import { createAdminClient } from '@tuturuuu/supabase/next/server';

export async function checkPermission({
  problemId,
  sessionId,
  userId,
}: {
  problemId: string;
  sessionId: string | null;
  userId: string;
}) {
  const sbAdmin = await createAdminClient({ noCookie: true });

  // Check if the user is an admin
  const { data: roleData, error: roleError } = await sbAdmin
    .from('platform_user_roles')
    .select('*')
    .eq('user_id', userId)
    .eq('allow_challenge_management', true)
    .single();

  if (roleError && roleError.code !== 'PGRST116') {
    console.error('Database Error when checking role:', roleError);
    return {
      canSubmit: false,
      remainingAttempts: 0,
      message: 'Error checking user permissions',
    };
  }

  const isAdmin = roleData?.allow_challenge_management;

  // Admin users can always submit without restrictions
  if (isAdmin) {
    return { canSubmit: true, remainingAttempts: -1, message: null };
  }

  // For non-admin users, validate session and submission count
  if (!sessionId) {
    return {
      canSubmit: false,
      remainingAttempts: 0,
      message: 'sessionId is required for non-admin users',
    };
  }

  // Check if the session is in progress
  const { data: sessionData, error: sessionError } = await sbAdmin
    .schema('private')
    .from('nova_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (sessionError) {
    console.error('Database Error when checking session:', sessionError);
    return {
      canSubmit: false,
      remainingAttempts: 0,
      message: 'Error fetching session data',
    };
  }

  const { data: challengeData, error: challengeError } = await sbAdmin
    .schema('private')
    .from('nova_challenges')
    .select('duration, close_at')
    .eq('id', sessionData.challenge_id)
    .single();

  if (challengeError || !challengeData) {
    console.error('Database Error when checking challenge:', challengeError);
    return {
      canSubmit: false,
      remainingAttempts: 0,
      message: 'Error fetching challenge data',
    };
  }

  const sessionEndTime = Math.min(
    challengeData.close_at
      ? new Date(challengeData.close_at).getTime()
      : Infinity,
    new Date(sessionData.start_time).getTime() + challengeData.duration * 1000
  );

  const currentTime = Date.now();

  if (currentTime > sessionEndTime) {
    return {
      canSubmit: false,
      remainingAttempts: 0,
      message: 'Session has ended',
    };
  }

  // Check submission count
  const { error: countError, count } = await sbAdmin
    .schema('private')
    .from('nova_submissions')
    .select('*', { count: 'exact', head: true })
    .eq('problem_id', problemId)
    .eq('session_id', sessionId)
    .eq('user_id', userId);

  if (countError) {
    console.error('Database Error when counting submissions:', countError);
    return {
      canSubmit: false,
      remainingAttempts: 0,
      message: 'Error checking submission count',
    };
  }

  const maxAttempts = 3;
  const submissionCount = count || 0;
  const remainingAttempts = maxAttempts - submissionCount;

  if (submissionCount >= maxAttempts) {
    return {
      canSubmit: false,
      remainingAttempts: 0,
      message: 'You have reached the maximum of 3 submissions.',
    };
  }

  return {
    canSubmit: true,
    remainingAttempts,
    message: null,
  };
}

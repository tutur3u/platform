import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';

export async function checkPermission({
  problemId,
  sessionId,
}: {
  problemId: string;
  sessionId: string | null;
}) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    return {
      canSubmit: false,
      remainingAttempts: 0,
      message: 'Unauthorized',
    };
  }

  // Check if the user is an admin
  const { data: roleData, error: roleError } = await supabase
    .from('platform_user_roles')
    .select('*')
    .eq('user_id', user.id)
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

  const isAdmin = roleData && roleData.allow_challenge_management;

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

  const sbAdmin = await createAdminClient();

  // Check if the session is in progress
  const { data: sessionData, error: sessionError } = await sbAdmin
    .from('nova_sessions')
    .select('*, ...nova_challenges!inner(duration, close_at)')
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

  const sessionEndTime = Math.min(
    sessionData.close_at ? new Date(sessionData.close_at).getTime() : Infinity,
    new Date(sessionData.start_time).getTime() + sessionData.duration * 1000
  );

  const currentTime = new Date().getTime();

  if (currentTime > sessionEndTime) {
    return {
      canSubmit: false,
      remainingAttempts: 0,
      message: 'Session has ended',
    };
  }

  // Check submission count
  const { error: countError, count } = await supabase
    .from('nova_submissions')
    .select('*', { count: 'exact', head: true })
    .eq('problem_id', problemId)
    .eq('session_id', sessionId)
    .eq('user_id', user.id);

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

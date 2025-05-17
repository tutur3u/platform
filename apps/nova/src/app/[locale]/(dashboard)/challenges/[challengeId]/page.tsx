import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { NovaSession } from '@tuturuuu/types/db';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{
    challengeId: string;
  }>;
}

export default async function Page({ params }: Props) {
  const { challengeId } = await params;

  const challenge = await getChallenge(challengeId);

  if (!challenge) redirect('/challenges');

  const cookieStore = await cookies();
  const token = cookieStore.get('token');

  if (
    challenge.password_hash &&
    (!token || challenge.password_hash != token.value)
  )
    redirect('/challenges');

  // Fetch session data
  const session = await getSession(challengeId);

  // If no session found, redirect to challenges page
  if (!session) redirect('/challenges');

  // If challenge is ended, redirect to report page
  if (session?.status === 'ENDED') {
    redirect(`/challenges/${challengeId}/results`);
  }

  const problemId = await getFirstProblemId(challengeId);

  if (!problemId) redirect('/challenges');

  redirect(`/challenges/${challengeId}/problems/${problemId}`);
}

async function getChallenge(challengeId: string) {
  const sbAdmin = await createAdminClient();

  try {
    // Fetch challenge details
    const { data: challenge, error: challengeError } = await sbAdmin
      .from('nova_challenges')
      .select('*')
      .eq('id', challengeId)
      .single();

    if (challengeError) {
      console.error('Error fetching challenge:', challengeError?.message);
      return null;
    }

    return challenge;
  } catch (error) {
    console.error('Unexpected error:', error);
    return null;
  }
}

async function getSession(challengeId: string): Promise<NovaSession | null> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    throw new Error('Unauthorized');
  }

  try {
    // Fetch sessions for this challenge
    const { data: session, error } = await supabase
      .from('nova_sessions')
      .select('*')
      .eq('challenge_id', challengeId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      throw new Error('Error fetching sessions');
    }

    return session;
  } catch (error) {
    console.error('Unexpected error:', error);
    return null;
  }
}

async function getFirstProblemId(challengeId: string) {
  const sbAdmin = await createAdminClient();

  try {
    const { data: problem, error: problemError } = await sbAdmin
      .from('nova_problems')
      .select('id')
      .eq('challenge_id', challengeId)
      .limit(1)
      .single();

    if (problemError) {
      console.error('Error fetching problem:', problemError?.message);
      return null;
    }

    return problem?.id;
  } catch (error) {
    console.error('Unexpected error:', error);
    return null;
  }
}

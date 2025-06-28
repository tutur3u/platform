import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type {
  NovaChallenge,
  NovaChallengeCriteria,
  NovaProblem,
  NovaProblemTestCase,
  NovaSession,
} from '@tuturuuu/types/db';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import ChallengeClient from './client';

type ExtendedNovaChallenge = NovaChallenge & {
  criteria: NovaChallengeCriteria[];
  problems: (NovaProblem & {
    test_cases: NovaProblemTestCase[];
  })[];
};

interface Props {
  params: Promise<{
    wsId: string;
    challengeId: string;
  }>;
}

export default async function Page({ params }: Props) {
  const { wsId, challengeId } = await params;

  try {
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

    // If challenge is ended, redirect to report page
    if (session?.status === 'ENDED') {
      redirect(`/${wsId}/challenges/${challengeId}/results`);
    }

    // If no session found, redirect to challenges page
    if (!session) {
      redirect('/challenges');
    }

    return (
      <ChallengeClient wsId={wsId} challenge={challenge} session={session} />
    );
  } catch (error) {
    console.error('Error loading challenge:', error);
    redirect('/challenges');
  }
}

async function getChallenge(
  challengeId: string
): Promise<ExtendedNovaChallenge | null> {
  const sbAdmin = await createAdminClient();

  try {
    // Fetch challenge details
    const { data: challenge, error: challengeError } = await sbAdmin
      .from('nova_challenges')
      .select('*, criteria:nova_challenge_criteria(*)')
      .eq('id', challengeId)
      .single();

    if (challengeError) {
      console.error('Error fetching challenge:', challengeError?.message);
      return null;
    }

    // Fetch problems linked to this challenge
    const { data: problems, error: problemError } = await sbAdmin
      .from('nova_problems')
      .select('*')
      .eq('challenge_id', challengeId);

    if (problemError) {
      console.error('Error fetching problems:', problemError.message);
      return null;
    }

    const problemIds = problems.map((problem) => problem.id);

    const { data: testCases, error: testCaseError } = await sbAdmin
      .from('nova_problem_test_cases')
      .select('*')
      .eq('hidden', false)
      .in('problem_id', problemIds);

    if (testCaseError) {
      console.error('Error fetching test cases:', testCaseError.message);
      return null;
    }

    // Map problems with test cases
    const formattedProblems = problems.map((problem) => {
      // Get test cases for this specific problem
      return {
        ...problem,
        test_cases: testCases?.filter((t) => t.problem_id === problem.id) || [],
      };
    });

    return {
      ...challenge,
      problems: formattedProblems,
    };
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

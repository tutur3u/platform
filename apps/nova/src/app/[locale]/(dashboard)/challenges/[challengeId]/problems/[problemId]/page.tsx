import ChallengeClient from './client';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  NovaChallenge,
  NovaChallengeCriteria,
  NovaProblem,
  NovaProblemTestCase,
  NovaSession,
  type NovaSubmissionWithScores,
} from '@tuturuuu/types/db';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

type ExtendedNovaChallenge = NovaChallenge & {
  criteria: NovaChallengeCriteria[];
  problems: {
    id: string;
    title: string;
  }[];
};

interface Props {
  params: Promise<{
    challengeId: string;
    problemId: string;
  }>;
}

export default async function Page({ params }: Props) {
  const { challengeId, problemId } = await params;

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
      redirect(`/challenges/${challengeId}/results`);
    }

    // If no session found, redirect to challenges page
    if (!session) {
      redirect('/challenges');
    }

    const currentProblemIndex = challenge.problems.findIndex(
      (p) => p.id === problemId
    );

    if (currentProblemIndex === -1) {
      redirect('/challenges');
    }

    const currentProblem = await getFullProblem(problemId);

    if (!currentProblem) {
      redirect('/challenges');
    }

    const submissions = await getSubmissions(problemId);

    return (
      <ChallengeClient
        challenge={challenge}
        currentProblemIndex={currentProblemIndex}
        problem={currentProblem}
        session={session}
        submissions={submissions}
      />
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
      .select('id, title')
      .eq('challenge_id', challengeId);

    if (problemError) {
      console.error('Error fetching problems:', problemError.message);
      return null;
    }

    const formattedProblems = problems.map((problem) => {
      // Get test cases for this specific problem
      return {
        ...problem,
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

async function getFullProblem(
  problemId: string
): Promise<(NovaProblem & { test_cases: NovaProblemTestCase[] }) | null> {
  const sbAdmin = await createAdminClient();

  const { data: problem, error } = await sbAdmin
    .from('nova_problems')
    .select('*, test_cases:nova_problem_test_cases(*)')
    .eq('id', problemId)
    .single();

  if (error) {
    console.error('Error fetching problem:', error);
    return null;
  }
  return problem;
}

async function getSession(challengeId: string): Promise<NovaSession | null> {
  const sbAdmin = await createAdminClient();
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
    const { data: session, error } = await sbAdmin
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

async function getSubmissions(
  problemId: string
): Promise<NovaSubmissionWithScores[]> {
  const sbAdmin = await createAdminClient();
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    throw new Error('Unauthorized');
  }

  const { data: submissions, error } = await sbAdmin
    .from('nova_submissions_with_scores')
    .select('*')
    .eq('problem_id', problemId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching submissions:', error);
    return [];
  }

  return submissions;
}

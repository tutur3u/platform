import ChallengeClient from './client';
import { createClient } from '@tuturuuu/supabase/next/server';
import {
  NovaChallenge,
  NovaProblem,
  NovaProblemTestCase,
} from '@tuturuuu/types/db';
import { redirect } from 'next/navigation';

type ExtendedNovaChallenge = NovaChallenge & {
  problems: (NovaProblem & {
    test_cases: NovaProblemTestCase[];
  })[];
};

interface Props {
  params: Promise<{
    challengeId: string;
  }>;
  searchParams: Promise<{
    token: string;
  }>;
}

export default async function Page({ params, searchParams }: Props) {
  const { challengeId } = await params;
  const { token } = await searchParams;

  // Redirect if no token is provided
  if (!token) {
    redirect('/challenges');
  }

  try {
    const challengeData = await getChallenge(challengeId);

    if (!challengeData) {
      redirect('/challenges');
    }

    if (challengeData.password_hash && challengeData.password_hash != token) {
      redirect('/challenges');
    }

    // Pass data to client component
    return <ChallengeClient challenge={challengeData} />;
  } catch (error) {
    console.error('Error loading challenge:', error);
    redirect('/challenges');
  }
}

// Fetch Challenge from Supabase
async function getChallenge(
  challengeId: string
): Promise<ExtendedNovaChallenge | null> {
  const supabase = await createClient();

  try {
    // Fetch challenge details
    const { data: challenge, error: challengeError } = await supabase
      .from('nova_challenges')
      .select('*')
      .eq('id', challengeId)
      .single();

    if (challengeError) {
      console.error('Error fetching challenge:', challengeError?.message);
      return null;
    }

    // Fetch problems linked to this challenge
    const { data: problems, error: problemError } = await supabase
      .from('nova_problems')
      .select('*')
      .eq('challenge_id', challengeId);

    if (problemError) {
      console.error('Error fetching problems:', problemError.message);
      return null;
    }

    const problemIds = problems.map((problem) => problem.id);

    const { data: testCases, error: testCaseError } = await supabase
      .from('nova_problem_test_cases')
      .select('*')
      .in('problem_id', problemIds);

    if (testCaseError) {
      console.error('Error fetching test cases:', testCaseError.message);
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

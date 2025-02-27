'use client';

import CustomizedHeader from './customizedHeader';
import ProblemComponent from './problem-component';
import PromptComponent from './prompt-component';
import TestCaseComponent from './test-case-component';
import { createClient } from '@tuturuuu/supabase/next/client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface Props {
  params: Promise<{
    challengeId: string;
  }>;
}

interface Timer {
  duration: number;
  created_at: string;
}

export default function Page({ params }: Props) {
  const [challenge, setChallenge] = useState<any | null>(null);
  const [fetchedTimer, setFetchedTimer] = useState<Timer | null | undefined>(
    null
  );
  const [currentProblemIndex, setCurrentProblemIndex] = useState(0);
  const [challengeId, setChallengeId] = useState('');

  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      const confirmationMessage =
        'You have unsaved changes, are you sure you want to leave?';
      event.returnValue = confirmationMessage;
      return confirmationMessage;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  useEffect(() => {
    const authCheck = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.id) {
        router.push('/login');
      }
    };

    authCheck();
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      const { challengeId } = await params;
      const challengeData = await getChallenge(challengeId);
      setChallenge(challengeData);
      setChallengeId(challengeId);
      const timerData = await fetchTimer(String(challengeData?.id));
      setFetchedTimer(timerData);
    };

    fetchData();
  }, [params]);

  const problems = challenge?.problems || [];

  const nextProblem = () => {
    setCurrentProblemIndex((prev) =>
      prev < problems.length - 1 ? prev + 1 : prev
    );
  };

  const prevProblem = () => {
    setCurrentProblemIndex((prev) => (prev > 0 ? prev - 1 : prev));
  };

  return (
    <div className="relative">
      <CustomizedHeader
        proNum={problems.length}
        currentProblem={currentProblemIndex + 1}
        challengeId={challengeId}
        duration={fetchedTimer?.duration || 0}
        createdAt={fetchedTimer?.created_at || ''}
        onNext={nextProblem}
        onPrev={prevProblem}
      />

      <div className="flex gap-4 p-6 pt-20">
        <div className="flex w-1/2 flex-col">
          {problems.length > 0 ? (
            <ProblemComponent problem={problems[currentProblemIndex]} />
          ) : (
            <p>No problems available.</p>
          )}
          <TestCaseComponent
            testcase={problems[currentProblemIndex]?.testcase[0]}
          />
        </div>

        <PromptComponent
          challengeId={challengeId}
          problem={problems[currentProblemIndex]}
        />
      </div>
    </div>
  );
}

async function fetchTimer(problemId: string): Promise<Timer | null> {
  try {
    console.log(problemId, 'id ');
    const response = await fetch(
      `/api/auth/workspace/${problemId}/nova/start-test`
    );

    if (!response.ok) {
      throw new Error('Failed to fetch timer');
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.log('Timer record error: ', error);
    return null;
  }
}

export interface Challenge {
  id: string;
  title: string;
  topic: string;
  description: string;
  problems: Problems[];
  duration: number;
}

export interface Problems {
  id: string;
  title: string | null;
  description: string | null;
  exampleInput: string | null;
  exampleOutput: string | null;
  constraints?: (string | null)[];
  testcase?: (string | null)[];
}

// Fetch Challenge from Supabase
async function getChallenge(challengeId: string): Promise<Challenge | null> {
  const supabase = createClient();

  try {
    // Fetch challenge details
    const { data: challenge, error: challengeError } = await supabase
      .from('nova_challenges')
      .select('*')
      .eq('id', challengeId)
      .single();

    if (challengeError || !challenge) {
      console.error('Error fetching challenge:', challengeError?.message);
      return null;
    }

    // Fetch problems linked to this challenge
    const { data: problems, error: problemError } = await supabase
      .from('nova_problems')
      .select('id, title, description, exampleInput, exampleOutput')
      .eq('challenge_id', challengeId);

    if (problemError) {
      console.error('Error fetching problems:', problemError.message);
      return null;
    }

    // Fetch constraints and test cases for all problems in one request
    const problemIds = problems.map((problem) => problem.id);

    const { data: constraints, error: constraintError } = await supabase
      .from('nova_problem_constraints')
      .select('problem_id, constraint_content')
      .in('problem_id', problemIds);
    console.log(constraints, 'chacha');
    if (constraintError) {
      console.error('Error fetching constraints:', constraintError.message);
    }

    const { data: testcases, error: testcaseError } = await supabase
      .from('nova_problem_testcases')
      .select('problem_id, testcase_content')
      .in('problem_id', problemIds);
    console.log('test case in fetch', testcases);
    if (testcaseError) {
      console.error('Error fetching test cases:', testcaseError.message);
    }

    // Map problems with constraints and test cases
    const formattedProblems = problems.map((problem) => ({
      id: problem.id,
      title: problem.title,
      description: problem.description,
      exampleInput: problem.exampleInput,
      exampleOutput: problem.exampleOutput,
      constraints:
        constraints
          ?.filter((c) => c.problem_id === problem.id)
          .map((c) => c.constraint_content) || [],
      testcase:
        testcases
          ?.filter((t) => t.problem_id === problem.id)
          .map((t) => t.testcase_content) || [],
    }));

    return {
      id: challenge.id,
      title: challenge.title || '',
      topic: challenge.topic || '',
      description: challenge.description || '',
      problems: formattedProblems,
      duration: 60, // Assuming a default duration, update based on your DB
    };
  } catch (error) {
    console.error('Unexpected error fetching challenge:', error);
    return null;
  }
}

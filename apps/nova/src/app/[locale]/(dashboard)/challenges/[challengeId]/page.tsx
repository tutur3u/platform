'use client';

import CustomizedHeader from './customizedHeader';
import ProblemComponent from './problem-component';
import PromptComponent from './prompt-component';
import TestCaseComponent from './test-case-component';
import { createClient } from '@tuturuuu/supabase/next/client';
import {
  NovaChallenge,
  NovaChallengeStatus,
  NovaProblem,
  NovaProblemConstraint,
  NovaProblemTestCase,
} from '@tuturuuu/types/db';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type ExtendedNovaChallenge = NovaChallenge & {
  problems: (NovaProblem & {
    constraints: NovaProblemConstraint[];
    testcases: NovaProblemTestCase[];
  })[];
};

interface Props {
  params: Promise<{
    challengeId: string;
  }>;
}

export default function Page({ params }: Props) {
  const [challenge, setChallenge] = useState<ExtendedNovaChallenge | null>(
    null
  );
  const [status, setStatus] = useState<NovaChallengeStatus | null>(null);
  const [currentProblemIndex, setCurrentProblemIndex] = useState(0);
  const [challengeId, setChallengeId] = useState('');

  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (status?.status === 'IN_PROGRESS') {
        const confirmationMessage =
          'You have an ongoing challenge, are you sure you want to leave?';
        event.returnValue = confirmationMessage;
        return confirmationMessage;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [status]);

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
      setChallenge(challengeData as ExtendedNovaChallenge);
      setChallengeId(challengeId);

      // Fetch challenge status
      const response = await fetch(`/api/v1/challenges/${challengeId}/status`);
      if (response.ok) {
        const statusData = await response.json();
        setStatus(statusData);

        // If challenge is ended, redirect to report page
        if (statusData?.status === 'ENDED') {
          router.push(`/challenges/${challengeId}/results`);
        }
      } else {
        router.push(`/challenges`);
      }
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

  const handleEndChallenge = async () => {
    if (confirm('Are you sure you want to end this challenge?')) {
      const problemSubmissions = await Promise.all(
        problems.map(async (problem) => {
          const response = await fetch(
            `/api/v1/problems/${problem.id}/submissions`
          );
          const data = await response.json();
          return data.sort((a: any, b: any) => b.score - a.score);
        })
      );

      const totalScore = problemSubmissions.reduce(
        (acc, curr) => acc + curr[0].score,
        0
      );

      const response = await fetch(`/api/v1/challenges/${challengeId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ENDED', totalScore, feedback: '' }),
      });

      if (response.ok) {
        router.push(`/challenges/${challengeId}/results`);
      }
    }
  };

  if (!status) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-xl font-semibold text-gray-700">Loading...</p>
      </div>
    );
  }

  return (
    <div className="relative">
      <CustomizedHeader
        proNum={problems.length}
        currentProblem={currentProblemIndex + 1}
        challengeId={challengeId}
        onNext={nextProblem}
        onPrev={prevProblem}
        onEnd={handleEndChallenge}
        startTime={status.start_time}
        endTime={status.end_time}
        duration={challenge?.duration || 0}
      />

      <div className="flex gap-4 p-6 pt-20">
        <div className="flex w-1/2 flex-col">
          {problems.length > 0 && problems[currentProblemIndex] ? (
            <ProblemComponent
              problem={{
                id: problems[currentProblemIndex].id,
                title: problems[currentProblemIndex].title ?? '',
                description: problems[currentProblemIndex].description ?? '',
                exampleInput: problems[currentProblemIndex].example_input ?? '',
                exampleOutput:
                  problems[currentProblemIndex].example_output ?? '',
                constraints:
                  problems[currentProblemIndex].constraints?.map(
                    (constraint) => constraint.constraint_content
                  ) ?? [],
              }}
            />
          ) : (
            <p>No problems available.</p>
          )}
          <TestCaseComponent
            testcases={problems[currentProblemIndex]?.testcases ?? []}
          />
        </div>

        <PromptComponent
          problem={{
            id: problems[currentProblemIndex]?.id || '',
            title: problems[currentProblemIndex]?.title || '',
            description: problems[currentProblemIndex]?.description || '',
            example_input: problems[currentProblemIndex]?.example_input || '',
            example_output: problems[currentProblemIndex]?.example_output || '',
            testcases:
              problems[currentProblemIndex]?.testcases?.map(
                (testCase) => testCase.testcase_content ?? ''
              ) ?? [],
          }}
        />
      </div>
    </div>
  );
}

// Fetch Challenge from Supabase
async function getChallenge(
  challengeId: string
): Promise<ExtendedNovaChallenge | null> {
  const supabase = createClient();

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
      .select('id, title, description, example_input, example_output')
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
    if (constraintError) {
      console.error('Error fetching constraints:', constraintError.message);
    }

    const { data: testcases, error: testcaseError } = await supabase
      .from('nova_problem_testcases')
      .select('problem_id, testcase_content')
      .in('problem_id', problemIds);
    if (testcaseError) {
      console.error('Error fetching test cases:', testcaseError.message);
    }

    // Map problems with constraints and test cases
    const formattedProblems = problems.map((problem) => ({
      id: problem.id,
      title: problem.title || '',
      description: problem.description || '',
      example_input: problem.example_input || '',
      example_output: problem.example_output || '',
      constraints:
        constraints
          ?.filter(
            (c) => c.problem_id === problem.id && c.constraint_content !== null
          )
          .map((c) => c.constraint_content!) || [],
      testcases:
        testcases
          ?.filter(
            (t) => t.problem_id === problem.id && t.testcase_content !== null
          )
          .map((t) => t.testcase_content!) || [],
    }));

    return {
      ...challenge,
      problems:
        formattedProblems as unknown as ExtendedNovaChallenge['problems'],
    };
  } catch (error) {
    console.error('Unexpected error fetching challenge:', error);
    return null;
  }
}

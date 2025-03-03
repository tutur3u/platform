'use client';

import CustomizedHeader from './customizedHeader';
import ProblemComponent from './problem-component';
import PromptComponent from './prompt-component';
import TestCaseComponent from './test-case-component';
import { createClient } from '@tuturuuu/supabase/next/client';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  NovaChallenge,
  NovaProblem,
  NovaProblemTestCase,
  NovaSession,
} from '@tuturuuu/types/db';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tuturuuu/ui/alert-dialog';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { redirect } from 'next/navigation';
import { useEffect, useState } from 'react';

type ExtendedNovaChallenge = NovaChallenge & {
  problems: (NovaProblem & {
    testcases: NovaProblemTestCase[];
  })[];
};

interface Props {
  params: Promise<{
    challengeId: string;
  }>;
}

export default async function Page({ params }: Props) {
  const adminSb = await createAdminClient();
  const [challenge, setChallenge] = useState<ExtendedNovaChallenge | null>(
    null
  );
  const [session, setSession] = useState<NovaSession | null>(null);
  const [currentProblemIndex, setCurrentProblemIndex] = useState(0);
  const [challengeId, setChallengeId] = useState('');
  const [showEndDialog, setShowEndDialog] = useState(false);

  const supabase = createClient();
  const router = useRouter();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    router.push('/login');
  }

  const { data: whitelisted, error } = await adminSb
    .from('nova_roles')
    .select('enable')
    .eq('email', user?.email as string)
    .maybeSingle();

  if (error || !whitelisted?.enable) redirect('/not-wishlist');
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
  }, [router, supabase]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (session?.status === 'IN_PROGRESS') {
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
  }, [session]);

  useEffect(() => {
    const fetchData = async () => {
      const { challengeId } = await params;
      const challengeData = await getChallenge(challengeId);
      setChallenge(challengeData as ExtendedNovaChallenge);
      setChallengeId(challengeId);

      // Fetch challenge session
      const response = await fetch(`/api/v1/challenges/${challengeId}/session`);
      if (response.ok) {
        const sessionData = await response.json();
        setSession(sessionData);

        // If challenge is ended, redirect to report page
        if (sessionData?.status === 'ENDED') {
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
      (acc, curr) => acc + (curr[0]?.score || 0),
      0
    );

    const response = await fetch(`/api/v1/challenges/${challengeId}/session`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'ENDED',
        totalScore: totalScore,
      }),
    });

    if (response.ok) {
      router.push(`/challenges/${challengeId}/results`);
    } else {
      toast({
        title: 'Error',
        description: 'Failed to end challenge',
        variant: 'destructive',
      });
    }
  };

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-xl font-semibold text-gray-700">Loading...</p>
      </div>
    );
  }

  return (
    <>
      <div className="relative">
        <CustomizedHeader
          proNum={problems.length}
          currentProblem={currentProblemIndex + 1}
          challengeId={challengeId}
          onNext={nextProblem}
          onPrev={prevProblem}
          onEnd={() => setShowEndDialog(true)}
          startTime={session.start_time}
          endTime={session.end_time}
          duration={challenge?.duration || 0}
        />

        <div className="flex gap-4 p-6 pt-20">
          <div className="flex w-1/2 flex-col">
            <ProblemComponent
              problem={{
                id: problems[currentProblemIndex]?.id || '',
                title: problems[currentProblemIndex]?.title || '',
                description: problems[currentProblemIndex]?.description || '',
                maxInputLength:
                  problems[currentProblemIndex]?.max_input_length || 0,
                exampleInput:
                  problems[currentProblemIndex]?.example_input || '',
                exampleOutput:
                  problems[currentProblemIndex]?.example_output || '',
              }}
            />
            <TestCaseComponent
              testcases={problems[currentProblemIndex]?.testcases || []}
            />
          </div>

          <PromptComponent
            problem={{
              id: problems[currentProblemIndex]?.id || '',
              title: problems[currentProblemIndex]?.title || '',
              description: problems[currentProblemIndex]?.description || '',
              maxInputLength:
                problems[currentProblemIndex]?.max_input_length || 0,
              exampleInput: problems[currentProblemIndex]?.example_input || '',
              exampleOutput:
                problems[currentProblemIndex]?.example_output || '',
              testcases:
                problems[currentProblemIndex]?.testcases?.map(
                  (testCase) => testCase.input || ''
                ) || [],
            }}
          />
        </div>
      </div>

      <AlertDialog open={showEndDialog} onOpenChange={setShowEndDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End Challenge</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to end this challenge?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleEndChallenge}>
              End
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
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
      .select('*')
      .eq('challenge_id', challengeId);

    if (problemError) {
      console.error('Error fetching problems:', problemError.message);
      return null;
    }

    // Fetch constraints and test cases for all problems in one request
    const problemIds = problems.map((problem) => problem.id);

    const { data: testcases, error: testcaseError } = await supabase
      .from('nova_problem_testcases')
      .select('*')
      .in('problem_id', problemIds);
    if (testcaseError) {
      console.error('Error fetching test cases:', testcaseError.message);
    }

    // Map problems with test cases
    const formattedProblems = problems.map((problem) => {
      // Get testcases for this specific problem
      const problemTestcases =
        testcases?.filter((t) => t.problem_id === problem.id) || [];

      return {
        id: problem.id,
        title: problem.title,
        description: problem.description,
        example_input: problem.example_input,
        example_output: problem.example_output,
        challenge_id: challenge.id,
        max_input_length: problem.max_input_length,
        created_at: problem.created_at,
        testcases: problemTestcases,
      };
    });

    return {
      ...challenge,
      problems: formattedProblems,
    } as ExtendedNovaChallenge;
  } catch (error) {
    console.error('Unexpected error fetching challenge:', error);
    return null;
  }
}

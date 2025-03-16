'use client';

import CustomizedHeader from './customizedHeader';
import ProblemComponent from './problem-component';
import PromptComponent from './prompt-component';
import TestCaseComponent from './test-case-component';
import { createClient } from '@tuturuuu/supabase/next/client';
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
import { Card, CardContent } from '@tuturuuu/ui/card';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useRouter } from 'next/navigation';
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

export default function Page({ params }: Props) {
  const [challenge, setChallenge] = useState<ExtendedNovaChallenge | null>(
    null
  );
  const [session, setSession] = useState<NovaSession | null>(null);
  const [currentProblemIndex, setCurrentProblemIndex] = useState(0);
  const [showEndDialog, setShowEndDialog] = useState(false);

  const router = useRouter();

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
      setChallenge(challengeData);

      // Fetch challenge session
      const response = await fetch(`/api/v1/challenges/${challengeId}/session`);

      if (response.ok) {
        const sessionData = await response.json();

        // If challenge is ended, redirect to report page
        if (sessionData?.status === 'ENDED') {
          router.replace(`/challenges/${challengeId}/results`);
        } else {
          setSession(sessionData);
        }
      } else {
        router.push(`/challenges`);
      }
    };

    fetchData();
  }, []);

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
    const response = await fetch(
      `/api/v1/challenges/${challenge?.id}/session`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'ENDED',
        }),
      }
    );

    if (response.ok) {
      router.push(`/challenges/${challenge?.id}/results`);
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
        <p className="text-xl font-semibold text-muted-foreground">
          Loading...
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="relative h-screen overflow-hidden">
        <CustomizedHeader
          problemLength={problems.length}
          currentProblem={currentProblemIndex + 1}
          endTime={session.end_time}
          onPrev={prevProblem}
          onNext={nextProblem}
          onEnd={() => setShowEndDialog(true)}
          onAutoEnd={handleEndChallenge}
          className="flex-none"
        />

        <div className="relative grid h-[calc(100vh-4rem)] grid-cols-1 gap-4 overflow-scroll p-6 md:grid-cols-2">
          <div className="flex h-full w-full flex-col gap-4 overflow-hidden">
            <Card className="h-full overflow-y-auto border-foreground/10 bg-foreground/5">
              <CardContent className="p-0">
                <Tabs defaultValue="problem" className="w-full">
                  <TabsList className="w-full rounded-t-lg rounded-b-none bg-foreground/10">
                    <TabsTrigger value="problem" className="flex-1">
                      Problem
                    </TabsTrigger>
                    <TabsTrigger value="testcases" className="flex-1">
                      Test Cases
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="problem" className="m-0 p-4">
                    <ProblemComponent
                      problem={{
                        id: problems[currentProblemIndex]?.id || '',
                        title: problems[currentProblemIndex]?.title || '',
                        description:
                          problems[currentProblemIndex]?.description || '',
                        maxPromptLength:
                          problems[currentProblemIndex]?.max_prompt_length || 0,
                        exampleInput:
                          problems[currentProblemIndex]?.example_input || '',
                        exampleOutput:
                          problems[currentProblemIndex]?.example_output || '',
                      }}
                    />
                  </TabsContent>
                  <TabsContent value="testcases" className="m-0 p-4">
                    <TestCaseComponent
                      testcases={problems[currentProblemIndex]?.testcases || []}
                    />
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>

          <div className="relative flex h-full w-full flex-col gap-4 overflow-hidden">
            <PromptComponent
              problem={{
                id: problems[currentProblemIndex]?.id || '',
                title: problems[currentProblemIndex]?.title || '',
                description: problems[currentProblemIndex]?.description || '',
                maxPromptLength:
                  problems[currentProblemIndex]?.max_prompt_length || 0,
                exampleInput:
                  problems[currentProblemIndex]?.example_input || '',
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
        max_prompt_length: problem.max_prompt_length,
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

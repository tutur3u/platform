'use client';

import ProblemComponent from '../../shared/problem-component';
import PromptComponent from '../../shared/prompt-component';
import TestCaseComponent from '../../shared/test-case-component';
import CustomizedHeader from './customizedHeader';
import PromptForm from './prompt-form';
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
    test_cases: NovaProblemTestCase[];
  })[];
};

interface Props {
  challenge: ExtendedNovaChallenge;
}

export default function ChallengeClient({ challenge }: Props) {
  const [session, setSession] = useState<NovaSession | null>(null);
  const [currentProblemIndex, setCurrentProblemIndex] = useState(0);
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [loading, setLoading] = useState(true);

  const router = useRouter();
  const problems = challenge?.problems || [];

  useEffect(() => {
    const fetchSession = async () => {
      try {
        // Fetch challenge session
        const response = await fetch(
          `/api/v1/sessions?challengeId=${challenge.id}`
        );

        if (!response.ok) {
          router.replace('/challenges');
          return;
        }

        const sessionsData = await response.json();

        // API returns an array of sessions, find the most recent active one
        const sessionData =
          Array.isArray(sessionsData) && sessionsData.length > 0
            ? sessionsData[0] // Assuming the most recent session is first
            : null;

        // If challenge is ended, redirect to report page
        if (sessionData?.status === 'ENDED') {
          router.replace(`/challenges/${challenge.id}/results`);
          return;
        } else if (sessionData) {
          setSession(sessionData);
        } else {
          router.replace('/challenges');
          return;
        }
      } catch (error) {
        console.error('Error loading session:', error);
        router.replace('/challenges');
      } finally {
        setLoading(false);
      }
    };

    fetchSession();
  }, [challenge.id, router]);

  // Memoize these functions to prevent unnecessary re-renders
  const nextProblem = () => {
    setCurrentProblemIndex((prev) =>
      prev < problems.length - 1 ? prev + 1 : prev
    );
  };

  const prevProblem = () => {
    setCurrentProblemIndex((prev) => (prev > 0 ? prev - 1 : prev));
  };

  const handleEndChallenge = async () => {
    const response = await fetch(`/api/v1/sessions/${session?.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'ENDED',
      }),
    });

    if (response.ok) {
      router.replace(`/challenges/${challenge.id}/results`);
    } else {
      toast({
        title: 'Error',
        description: 'Failed to end challenge',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground text-xl font-semibold">
          Loading...
        </p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground text-xl font-semibold">
          Session not found
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="relative h-screen overflow-hidden">
        <CustomizedHeader
          key={`challenge-header-${session.id}`}
          problemLength={problems.length}
          currentProblem={currentProblemIndex + 1}
          endTime={session.end_time}
          onPrev={prevProblem}
          onNext={nextProblem}
          onEnd={() => setShowEndDialog(true)}
          onAutoEnd={handleEndChallenge}
          className="flex-none"
          challengeCloseAt={challenge.close_at || undefined}
          sessionStartTime={session.start_time}
        />

        <div className="relative grid h-[calc(100vh-4rem)] grid-cols-1 gap-4 overflow-scroll p-4 md:grid-cols-2">
          <div className="flex h-full w-full flex-col gap-4 overflow-hidden">
            <Card className="border-foreground/10 bg-foreground/5 h-full overflow-y-auto">
              <CardContent className="p-0">
                <Tabs defaultValue="problem" className="w-full">
                  <TabsList className="bg-foreground/10 w-full rounded-b-none rounded-t-lg">
                    <TabsTrigger value="problem" className="flex-1">
                      Problem
                    </TabsTrigger>
                    <TabsTrigger value="test-cases" className="flex-1">
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
                  <TabsContent value="test-cases" className="m-0 p-4">
                    <TestCaseComponent
                      testCases={
                        problems[currentProblemIndex]?.test_cases || []
                      }
                    />
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>

          <div className="relative flex h-full w-full flex-col gap-4 overflow-hidden">
            <PromptComponent>
              <PromptForm
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
                  testCases:
                    problems[currentProblemIndex]?.test_cases?.map(
                      (testCase) => testCase.input || ''
                    ) || [],
                }}
              />
            </PromptComponent>
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

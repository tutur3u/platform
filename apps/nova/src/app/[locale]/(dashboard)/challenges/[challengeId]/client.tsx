'use client';

import ProblemComponent from '../../shared/problem-component';
import PromptComponent from '../../shared/prompt-component';
import TestCaseComponent from '../../shared/test-case-component';
import ChallengeHeader from './challengeHeader';
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
import { useState } from 'react';

type ExtendedNovaChallenge = NovaChallenge & {
  problems: (NovaProblem & {
    test_cases: NovaProblemTestCase[];
  })[];
};

interface Props {
  challenge: ExtendedNovaChallenge;
  session: NovaSession;
}

export default function ChallengeClient({ challenge, session }: Props) {
  const [currentProblemIndex, setCurrentProblemIndex] = useState(0);
  const [showEndDialog, setShowEndDialog] = useState(false);

  const router = useRouter();

  const currentProblem =
    challenge.problems[currentProblemIndex] ||
    ({} as NovaProblem & { test_cases: NovaProblemTestCase[] });

  const nextProblem = () => {
    setCurrentProblemIndex((prev) =>
      prev < challenge.problems.length - 1 ? prev + 1 : prev
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
        endTime: new Date(
          Math.min(
            new Date().getTime(),
            new Date(session?.start_time || '').getTime() +
              challenge.duration * 1000
          )
        ).toISOString(),
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

  return (
    <>
      <div className="relative h-screen overflow-hidden">
        <ChallengeHeader
          className="flex-none"
          problemLength={challenge.problems.length}
          currentProblemIndex={currentProblemIndex + 1}
          startTime={session.start_time}
          endTime={new Date(
            new Date(session.start_time).getTime() + challenge.duration * 1000
          ).toISOString()}
          challengeCloseAt={challenge.close_at || ''}
          onPrev={prevProblem}
          onNext={nextProblem}
          onEnd={() => setShowEndDialog(true)}
          onAutoEnd={handleEndChallenge}
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
                    <ProblemComponent problem={currentProblem} />
                  </TabsContent>
                  <TabsContent value="test-cases" className="m-0 p-4">
                    <TestCaseComponent
                      testCases={currentProblem.test_cases || []}
                    />
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>

          <div className="relative flex h-full w-full flex-col gap-4 overflow-hidden">
            <PromptComponent>
              <PromptForm problem={currentProblem} session={session} />
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

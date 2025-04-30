'use client';

import ProblemComponent from '../../../../shared/problem-component';
import PromptComponent from '../../../../shared/prompt-component';
import TestCaseComponent from '../../../../shared/test-case-component';
import type { ExtendedNovaSubmission } from './actions';
import ChallengeHeader from './challengeHeader';
import PromptForm from './prompt-form';
import {
  NovaChallenge,
  NovaChallengeCriteria,
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
  criteria: NovaChallengeCriteria[];
  problems: (NovaProblem & {
    test_cases: NovaProblemTestCase[];
  })[];
};

interface Props {
  currentProblemIndex: number;
  problem: NovaProblem & { test_cases: NovaProblemTestCase[] };
  challenge: ExtendedNovaChallenge;
  session: NovaSession;
  submissions: ExtendedNovaSubmission[];
}

export default function ChallengeClient({
  currentProblemIndex,
  problem: currentProblem,
  challenge,
  session,
  submissions,
}: Props) {
  const router = useRouter();

  const [showEndDialog, setShowEndDialog] = useState(false);
  const [showModel, setShowModel] = useState(false);
  const [isNavigationConfirmed, setIsNavigationConfirmed] = useState(false);
  const [pendingHref, setPendingHref] = useState('');
  const nextProblem = () => {
    const nextProblemId =
      challenge.problems.length > currentProblemIndex + 1
        ? challenge.problems[currentProblemIndex + 1]?.id
        : null;

    if (nextProblemId) {
      router.push(`/challenges/${challenge.id}/problems/${nextProblemId}`);
      router.refresh();
    }
  };
  const pendingNavKey = 'pending nav key';
  const prevProblem = () => {
    const prevProblemId =
      currentProblemIndex > 0
        ? challenge.problems[currentProblemIndex - 1]?.id
        : null;

    if (prevProblemId) {
      router.push(`/challenges/${challenge.id}/problems/${prevProblemId}`);
      router.refresh();
    }
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

  useEffect(() => {
    window.history.pushState(
      { challengePage: true },
      '',
      window.location.pathname
    );

    const handlePopstate = () => {
      if (isNavigationConfirmed) return;
      // remember that the user wanted to go back
      sessionStorage.setItem(pendingNavKey, 'back');
      window.history.pushState(
        { challengePage: true },
        '',
        window.location.pathname
      );
      setShowModel(true);
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isNavigationConfirmed) return;

      e.preventDefault();
      e.returnValue =
        'Are you sure you want to leave? Your progress may not be saved.';
      return e.returnValue;
    };

    const handleLinkClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest('a');

      if (!anchor) return;

      if (anchor.getAttribute('data-allow-navigation') === 'true') return;

      const href = anchor.getAttribute('href');

      if (!href || href.startsWith('#') || href.startsWith('javascript:'))
        return;

      if (
        href.includes(
          `/challenges/${challenge.id}/problems/${currentProblem.id}`
        )
      )
        return;

      if (!isNavigationConfirmed) {
        e.preventDefault();
        setPendingHref(href);
        setShowModel(true);
      }
    };

    window.addEventListener('popstate', handlePopstate);
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('click', handleLinkClick, { capture: true });

    return () => {
      window.removeEventListener('popstate', handlePopstate);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('click', handleLinkClick, { capture: true });
    };
  }, [challenge.id, isNavigationConfirmed]);

  const handleCancel = () => {
    window.history.pushState(
      { challengePage: true },
      '',
      window.location.pathname
    );
    setShowModel(false);
  };

  const handleConfirm = () => {
    setIsNavigationConfirmed(true);
    setShowModel(false);
    if (pendingHref) router.push(pendingHref);
    else if (sessionStorage.getItem(pendingNavKey) === 'back') router.back();
    sessionStorage.removeItem(pendingNavKey);
  };

  return (
    <>
      <div className="relative h-screen overflow-hidden">
        <ChallengeHeader
          challenge={challenge}
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
              <PromptForm
                problem={currentProblem}
                session={session}
                submissions={submissions}
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

      <AlertDialog open={showModel} onOpenChange={setShowModel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave Challenge Page</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to leave this page? Your progress may not be
              saved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancel}>
              Stay on Page
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>
              Leave Page
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

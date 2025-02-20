'use client';

import { getChallenge } from '../challenges';
import CustomizedHeader from './customizedHeader';
import ProblemComponent from './problem-component';
import PromptComponent from './prompt-component';
import TestCaseComponent from './test-case-component';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';

interface Props {
  params: Promise<{
    wsId: string;
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
  const [wsId, setWsId] = useState('');
  const database = createClient();
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
      } = await database.auth.getUser();

      if (!user?.id) {
        router.push('/login');
      }
    };

    authCheck();
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      const { wsId, challengeId } = await params;
      const challengeData = getChallenge(parseInt(challengeId));
      setChallenge(challengeData);
      setWsId(wsId);
      const timerData = await fetchTimer(String(challengeData?.id));
      setFetchedTimer(timerData);
    };

    fetchData();
  }, [params]);

  const problems = challenge?.problems || [];

  // Navigate to next problem
  const nextProblem = () => {
    setCurrentProblemIndex((prev) =>
      prev < problems.length - 1 ? prev + 1 : prev
    );
  };

  // Navigate to previous problem
  const prevProblem = () => {
    setCurrentProblemIndex((prev) => (prev > 0 ? prev - 1 : prev));
  };

  return (
    <>
      <CustomizedHeader
        proNum={problems.length}
        currentProblem={currentProblemIndex + 1}
        duraion={fetchedTimer?.duration || 0}
        wsId={wsId}
        createdAt={fetchedTimer?.created_at || ''}
        onNext={nextProblem}
        onPrev={prevProblem}
      />

      <div className="flex gap-4 p-6">
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

        <PromptComponent problem={problems[currentProblemIndex]} />
      </div>
    </>
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

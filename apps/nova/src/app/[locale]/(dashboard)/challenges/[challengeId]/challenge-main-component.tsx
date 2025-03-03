'use client';

import CustomizedHeader from './customizedHeader';
import ProblemComponent from './problem-component';
import PromptComponent from './prompt-component';
import TestCaseComponent from './test-case-component';
import { useChallenge } from '@/hooks/useChallenge';
import { useRouter } from 'next/navigation';

interface Props {
  challengeId: string;
}

export default function ChallengePage({ challengeId }: Props) {
  const { challenge, status, currentProblemIndex, nextProblem, prevProblem } =
    useChallenge(challengeId);

  const router = useRouter();
  const problems = challenge?.problems || [];

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
          {problems.length > 0 ? (
            <ProblemComponent problem={problems[currentProblemIndex]} />
          ) : (
            <p>No problems available.</p>
          )}
          <TestCaseComponent
            testcases={problems[currentProblemIndex]?.testcases ?? []}
          />
        </div>

        <PromptComponent problem={problems[currentProblemIndex]} />
      </div>
    </div>
  );
}

'use client';

import { getChallenge } from '../challenges';
import CustomizedHeader from './customizedHeader';
import ProblemComponent from './problem-component';
import PromptComponent from './prompt-component';
import TestCaseComponent from './test-case-component';
import React, { useEffect, useState } from 'react';

interface Props {
  params: {
    challengeId: string;
  };
}

export default function Page({ params }: Props) {
  const [challenge, setChallenge] = useState<any | null>(null);

  useEffect(() => {
    // Wait for params to resolve
    const fetchData = async () => {
      const { challengeId } = await params;
      const challengeData = getChallenge(parseInt(challengeId));
      setChallenge(challengeData);
    };

    fetchData();
  }, [params]);

  const problems = challenge?.problems || [];

  const [currentProblemIndex, setCurrentProblemIndex] = useState(0);

  // Handle "Next" and "Previous" navigation
  const nextProblem = () => {
    setCurrentProblemIndex((prev) =>
      prev < problems.length - 1 ? prev + 1 : prev
    );
  };

  const prevProblem = () => {
    setCurrentProblemIndex((prev) => (prev > 0 ? prev - 1 : prev));
  };
  // console.log(problems[currentProblemIndex].testcase), 'testcase ';
  return (
    <>
      {/* Header with navigation */}
      <CustomizedHeader
        proNum={problems.length}
        currentProblem={currentProblemIndex + 1}
        onNext={nextProblem}
        onPrev={prevProblem}
      />

      <div className="flex gap-4 p-6">
        {/* Left side: Problem & Test Cases */}
        <div className="flex w-1/2 flex-col">
          {problems.length > 0 ? (
            <ProblemComponent problem={problems[currentProblemIndex]} />
          ) : (
            <p>No problems available.</p>
          )}
          <TestCaseComponent
            testcase={problems[currentProblemIndex]?.testcase}
          />
        </div>

        {/* Right Side */}
        <PromptComponent />
      </div>
    </>
  );
}

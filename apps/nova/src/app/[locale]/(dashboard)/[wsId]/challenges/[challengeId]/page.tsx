// import { getChallenges } from '../challenges';
import ProblemComponent from './problem-component';
import PromptComponent from './prompt-component';
import TestCaseComponent from './test-case-component';
import React from 'react';

interface Props {
  params: Promise<{
    challengeId: string;
  }>;
}

export default async function Page({ params }: Props) {
  const { challengeId } = await params;

  return (
    <div className="flex gap-4 p-6">
      {/* Left side: Problem & Test Cases */}
      <div className="flex w-1/2 flex-col">
        <ProblemComponent />
        <TestCaseComponent />
      </div>

      <PromptComponent></PromptComponent>
    </div>
  );
}
